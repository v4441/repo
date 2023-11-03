use std::path::PathBuf;

use async_trait::async_trait;
use eyre::{Context, Result};
use hyperlane_core::{SignedAnnouncement, SignedCheckpointWithMessageId};
use prometheus::IntGauge;

use crate::traits::CheckpointSyncer;

#[derive(Debug, Clone)]
/// Type for reading/write to LocalStorage
pub struct LocalStorage {
    /// base path
    path: PathBuf,
    latest_index: Option<IntGauge>,
}

impl LocalStorage {
    /// Create a new LocalStorage checkpoint syncer instance.
    pub fn new(path: PathBuf, latest_index: Option<IntGauge>) -> Result<Self> {
        if !path.exists() {
            std::fs::create_dir_all(&path).with_context(|| {
                format!(
                    "Failed to create local checkpoint syncer storage directory at {:?}",
                    path
                )
            })?;
        }
        Ok(Self { path, latest_index })
    }

    fn checkpoint_file_path(&self, index: u32) -> PathBuf {
        self.path.join(format!("{}_with_id.json", index))
    }

    fn latest_index_file_path(&self) -> PathBuf {
        self.path.join("index.json")
    }

    fn announcement_file_path(&self) -> PathBuf {
        self.path.join("announcement.json")
    }
}

#[async_trait]
impl CheckpointSyncer for LocalStorage {
    async fn latest_index(&self) -> Result<Option<u32>> {
        match tokio::fs::read(self.latest_index_file_path())
            .await
            .and_then(|data| {
                String::from_utf8(data)
                    .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))
            }) {
            Ok(data) => {
                let index = data.parse()?;
                if let Some(gauge) = &self.latest_index {
                    gauge.set(index as i64);
                }
                Ok(Some(index))
            }
            _ => Ok(None),
        }
    }

    async fn write_latest_index(&self, index: u32) -> Result<()> {
        let path = self.latest_index_file_path();
        tokio::fs::write(&path, index.to_string())
            .await
            .with_context(|| format!("Writing index to {path:?}"))?;
        Ok(())
    }

    async fn fetch_checkpoint(&self, index: u32) -> Result<Option<SignedCheckpointWithMessageId>> {
        let Ok(data) = tokio::fs::read(self.checkpoint_file_path(index)).await else {
            return Ok(None);
        };
        let checkpoint = serde_json::from_slice(&data)?;
        Ok(Some(checkpoint))
    }

    async fn write_checkpoint(
        &self,
        signed_checkpoint: &SignedCheckpointWithMessageId,
    ) -> Result<()> {
        let serialized_checkpoint = serde_json::to_string_pretty(signed_checkpoint)?;
        let path = self.checkpoint_file_path(signed_checkpoint.value.index);
        tokio::fs::write(&path, &serialized_checkpoint)
            .await
            .with_context(|| format!("Writing (checkpoint, messageId) to {path:?}"))?;

        Ok(())
    }

    async fn write_announcement(&self, signed_announcement: &SignedAnnouncement) -> Result<()> {
        let serialized_announcement = serde_json::to_string_pretty(signed_announcement)?;
        let path = self.announcement_file_path();
        tokio::fs::write(&path, &serialized_announcement)
            .await
            .with_context(|| format!("Writing announcement to {path:?}"))?;
        Ok(())
    }

    fn announcement_location(&self) -> String {
        format!("file://{}", self.path.to_str().unwrap())
    }
}
