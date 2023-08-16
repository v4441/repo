use core::str::FromStr;
use std::collections::HashMap;
use std::path::PathBuf;

use eyre::{eyre, Context, Report, Result};
use prometheus::{IntGauge, IntGaugeVec};
use rusoto_core::Region;
use serde::Deserialize;

use hyperlane_core::{config::*, H160};

use crate::{CheckpointSyncer, LocalStorage, MultisigCheckpointSyncer, S3Storage};

/// Checkpoint Syncer types
#[derive(Debug, Clone)]
pub enum CheckpointSyncerConf {
    /// A local checkpoint syncer
    LocalStorage {
        /// Path
        path: PathBuf,
    },
    /// A checkpoint syncer on S3
    S3 {
        /// Bucket name
        bucket: String,
        /// Folder name inside bucket
        folder: String,
        /// S3 Region
        region: Region,
    },
}

/// Raw checkpoint syncer types
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RawCheckpointSyncerConf {
    /// A local checkpoint syncer
    LocalStorage {
        /// Path
        path: Option<String>,
    },
    /// A checkpoint syncer on S3
    S3 {
        /// Bucket name
        bucket: Option<String>,
        /// Folder name inside bucket - defaults to the root of the bucket (i.e. empty string)
        folder: Option<String>,
        /// S3 Region
        region: Option<String>,
    },
    /// Unknown checkpoint syncer type was specified
    #[serde(other)]
    Unknown,
}

impl FromRawConf<'_, RawCheckpointSyncerConf> for CheckpointSyncerConf {
    fn from_config_filtered(
        raw: RawCheckpointSyncerConf,
        cwp: &ConfigPath,
        _filter: (),
    ) -> ConfigResult<Self> {
        match raw {
            RawCheckpointSyncerConf::LocalStorage { path } => {
                let path: PathBuf = path
                    .ok_or_else(|| eyre!("Missing `path` for LocalStorage checkpoint syncer"))
                    .into_config_result(|| cwp + "path")?
                    .parse()
                    .into_config_result(|| cwp + "path")?;
                if !path.exists() {
                    std::fs::create_dir_all(&path)
                        .with_context(|| {
                            format!(
                                "Failed to create local checkpoint syncer storage directory at {:?}",
                                path
                            )
                        })
                        .into_config_result(|| cwp + "path")?;
                } else if !path.is_dir() {
                    Err(eyre!(
                        "LocalStorage checkpoint syncer path is not a directory"
                    ))
                    .into_config_result(|| cwp + "path")?;
                }
                Ok(Self::LocalStorage { path })
            }
            RawCheckpointSyncerConf::S3 { bucket, folder, region } => Ok(Self::S3 {
                bucket: bucket
                    .ok_or_else(|| eyre!("Missing `bucket` for S3 checkpoint syncer"))
                    .into_config_result(|| cwp + "bucket")?,
                folder: folder
                    .map_or(Ok::<String, Report>(String::from("")), Result::Ok)
                    .into_config_result(|| cwp + "folder")?,
                region: region
                    .ok_or_else(|| eyre!("Missing `region` for S3 checkpoint syncer"))
                    .into_config_result(|| cwp + "region")?
                    .parse()
                    .into_config_result(|| cwp + "region")?,
            }),
            RawCheckpointSyncerConf::Unknown => Err(eyre!("Missing `type` for checkpoint syncer"))
                .into_config_result(|| cwp + "type"),
        }
    }
}

impl FromStr for CheckpointSyncerConf {
    type Err = Report;

    fn from_str(s: &str) -> Result<Self> {
        let [prefix, suffix]: [&str; 2] =
            s.split("://").collect::<Vec<_>>().try_into().map_err(|_| {
                eyre!("Error parsing storage location; could not split prefix and suffix ({s})")
            })?;

        match prefix {
            "s3" => {
                let url_components = suffix
                    .split('/')
                    .collect::<Vec<&str>>();
                let [bucket, region, folder]: [&str; 3] = match url_components[..] {
                    [bucket, region] => Ok([bucket, region, ""]), // no folder means empty folder path
                    [bucket, region, folder] => Ok([bucket, region, folder]),
                    _ => Err(eyre!("Error parsing storage location; could not split bucket, region and folder ({suffix})"))
                }?;
                Ok(CheckpointSyncerConf::S3 {
                    bucket: bucket.into(),
                    folder: folder.into(),
                    region: region
                        .parse()
                        .context("Invalid region when parsing storage location")?,
                })
            }
            "file" => Ok(CheckpointSyncerConf::LocalStorage {
                path: suffix.into(),
            }),
            _ => Err(eyre!("Unknown storage location prefix `{prefix}`")),
        }
    }
}

impl CheckpointSyncerConf {
    /// Turn conf info a Checkpoint Syncer
    pub fn build(
        &self,
        latest_index_gauge: Option<IntGauge>,
    ) -> Result<Box<dyn CheckpointSyncer>, Report> {
        Ok(match self {
            CheckpointSyncerConf::LocalStorage { path } => {
                Box::new(LocalStorage::new(path.clone(), latest_index_gauge)?)
            }
            CheckpointSyncerConf::S3 { bucket, folder, region } => Box::new(S3Storage::new(
                bucket.clone(),
                folder.clone(),
                region.clone(),
                latest_index_gauge,
            )),
        })
    }
}

/// Config for a MultisigCheckpointSyncer
#[derive(Debug, Clone)]
pub struct MultisigCheckpointSyncerConf {
    /// The checkpoint syncer for each valid validator signer address
    checkpointsyncers: HashMap<String, CheckpointSyncerConf>,
}

impl MultisigCheckpointSyncerConf {
    /// Get a MultisigCheckpointSyncer from the config
    pub fn build(
        &self,
        origin: &str,
        validator_checkpoint_index: IntGaugeVec,
    ) -> Result<MultisigCheckpointSyncer, Report> {
        let mut checkpoint_syncers = HashMap::new();
        for (key, value) in self.checkpointsyncers.iter() {
            let gauge =
                validator_checkpoint_index.with_label_values(&[origin, &key.to_lowercase()]);
            if let Ok(conf) = value.build(Some(gauge)) {
                checkpoint_syncers.insert(H160::from_str(key)?, conf.into());
            } else {
                continue;
            }
        }
        Ok(MultisigCheckpointSyncer::new(checkpoint_syncers))
    }
}
