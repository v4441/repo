use std::{
    collections::HashSet, fmt::Debug, hash::Hash, marker::PhantomData, sync::Arc, time::Duration,
};

use axum::async_trait;
use cursors::*;
use derive_new::new;
use fuels::programs::logs;
use hyperlane_core::{
    utils::fmt_sync_time, ContractSyncCursor, CursorAction, HyperlaneDomain, HyperlaneLogStore,
    HyperlaneSequenceAwareIndexerStore, HyperlaneWatermarkedLogStore, Indexer,
    SequenceAwareIndexer,
};
use hyperlane_core::{BroadcastReceiver, Indexed, LogMeta, H512};
pub use metrics::ContractSyncMetrics;
use num_traits::Zero;
use prometheus::core::{AtomicI64, AtomicU64, GenericCounter, GenericGauge};
use tokio::sync::broadcast::Sender as BroadcastSender;
use tokio::time::sleep;
use tracing::{debug, info, warn};

use crate::settings::IndexSettings;

pub(crate) mod cursors;
mod eta_calculator;
mod metrics;

use cursors::ForwardBackwardSequenceAwareSyncCursor;

const SLEEP_DURATION: Duration = Duration::from_secs(5);

// H256 * 1M = 32MB per origin chain worst case
// With one such channel per origin chain.
const TX_ID_CHANNEL_CAPACITY: usize = 1_000_000;

enum LogsOrSleepDuration {
    Logs(u64),
    Sleep(Duration),
}

/// Entity that drives the syncing of an agent's db with on-chain data.
/// Extracts chain-specific data (emitted checkpoints, messages, etc) from an
/// `indexer` and fills the agent's db with this data.
#[derive(Debug)]
pub struct ContractSync<T, D: HyperlaneLogStore<T>, I: Indexer<T>> {
    domain: HyperlaneDomain,
    db: D,
    indexer: I,
    metrics: ContractSyncMetrics,
    broadcast_sender: BroadcastSender<H512>,
    _phantom: PhantomData<T>,
}

impl<T, D: HyperlaneLogStore<T>, I: Indexer<T>> ContractSync<T, D, I> {
    pub fn new(domain: HyperlaneDomain, db: D, indexer: I, metrics: ContractSyncMetrics) -> Self {
        Self {
            domain,
            db,
            indexer,
            metrics,
            broadcast_sender: BroadcastSender::new(TX_ID_CHANNEL_CAPACITY),
            _phantom: PhantomData,
        }
    }
}

impl<T, D, I> ContractSync<T, D, I>
where
    T: Debug + Send + Sync + Clone + Eq + Hash + 'static,
    D: HyperlaneLogStore<T>,
    I: Indexer<T> + 'static,
{
    /// The domain that this ContractSync is running on
    pub fn domain(&self) -> &HyperlaneDomain {
        &self.domain
    }

    fn get_new_receive_tx_channel(&self) -> BroadcastReceiver<H512> {
        let tx = &self.broadcast_sender;
        BroadcastReceiver::new(tx.clone(), tx.subscribe())
    }

    /// Sync logs and write them to the LogStore
    #[tracing::instrument(name = "ContractSync", fields(domain=self.domain().name()), skip(self, opts))]
    pub async fn sync(&self, label: &'static str, mut opts: SyncOptions<T>) {
        let chain_name = self.domain.as_ref();
        let indexed_height_metric = self
            .metrics
            .indexed_height
            .with_label_values(&[label, chain_name]);
        let stored_logs_metric = self
            .metrics
            .stored_events
            .with_label_values(&[label, chain_name]);

        loop {
            // in here, we check to see whether the recv end of the channel received any txid to query receipts for
            // the recv end is defined as an Option

            let mut logs_found = 0;
            // // let mut sleep_duration = SLEEP_DURATION;
            if let Some(recv) = opts.tx_id_recv.as_mut() {
                logs_found += self
                    .fetch_logs_from_receiver(recv, &stored_logs_metric)
                    .await;
            }
            // if let Some(cursor) = opts.cursor.as_mut() {
            //     match self
            //         .fetch_logs_with_cursor(cursor, &stored_logs_metric, &indexed_height_metric)
            //         .await
            //     {
            //         LogsOrSleepDuration::Logs(found) => logs_found += found,
            //         LogsOrSleepDuration::Sleep(duration) => sleep_duration = duration,
            //     }
            // }

            // if logs_found.is_zero() {
            //     sleep(sleep_duration).await;
            // }
            info!("~~~ looping");
            let cursor = opts.cursor.as_mut().unwrap();
            indexed_height_metric.set(cursor.latest_queried_block() as i64);
            let (action, eta) = match cursor.next_action().await {
                Ok((action, eta)) => (action, eta),
                Err(err) => {
                    warn!(?err, "Error getting next action");
                    sleep(SLEEP_DURATION).await;
                    continue;
                }
            };
            let sleep_duration = match action {
                // Use `loop` but always break - this allows for returning a value
                // from the loop (the sleep duration)
                #[allow(clippy::never_loop)]
                CursorAction::Query(range) => loop {
                    debug!(?range, "Looking for for events in index range");

                    let logs = match self.indexer.fetch_logs_in_range(range.clone()).await {
                        Ok(logs) => logs,
                        Err(err) => {
                            warn!(?err, "Error fetching logs");
                            break SLEEP_DURATION;
                        }
                    };
                    let logs = self.dedupe_and_store_logs(logs, &stored_logs_metric).await;
                    let logs_found = logs.len() as u64;
                    info!(
                        ?range,
                        num_logs = logs_found,
                        estimated_time_to_sync = fmt_sync_time(eta),
                        sequences = ?logs.iter().map(|(log, _)| log.sequence).collect::<Vec<_>>(),
                        cursor = ?cursor,
                        "Found log(s) in index range"
                    );

                    logs.iter().for_each(|(_, meta)| {
                        if let Err(err) = self.broadcast_sender.send(meta.transaction_id) {
                            warn!(?err, "Error sending txid to receiver");
                        }
                    });
                    // Report amount of deliveries stored into db
                    // Update cursor
                    if let Err(err) = cursor.update(logs, range).await {
                        warn!(?err, "Error updating cursor");
                        break SLEEP_DURATION;
                    };
                    break Default::default();
                },
                CursorAction::Sleep(duration) => duration,
            };
            sleep(sleep_duration).await;
        }
    }

    async fn fetch_logs_from_receiver(
        &self,
        recv: &mut BroadcastReceiver<H512>,
        stored_logs_metric: &GenericCounter<AtomicU64>,
    ) -> u64 {
        println!("~~~ fetch_logs_from_receiver");
        let mut logs_found = 0;
        loop {
            match recv.try_recv() {
                Ok(tx_id) => {
                    println!("~~~ tx_id: {:?}", tx_id);
                    // query receipts for tx_id
                    // let logs = vec![];
                    let logs = match self.indexer.fetch_logs_by_tx_hash(tx_id).await {
                        Ok(logs) => logs,
                        Err(err) => {
                            warn!(?err, ?tx_id, "Error fetching logs for tx id");
                            continue;
                        }
                    };
                    let logs = self.dedupe_and_store_logs(logs, &stored_logs_metric).await;
                    let num_logs = logs.len() as u64;
                    info!(num_logs = logs_found, ?tx_id, "Found log(s) for tx id");
                    // logs_found += num_logs;
                }
                Err(err) => {
                    warn!(?err, "Error receiving txid from channel");
                    break;
                }
            }
        }
        logs_found
    }

    async fn fetch_logs_with_cursor(
        &self,
        cursor: &mut Box<dyn ContractSyncCursor<T>>,
        stored_logs_metric: &GenericCounter<AtomicU64>,
        indexed_height_metric: &GenericGauge<AtomicI64>,
    ) -> LogsOrSleepDuration {
        indexed_height_metric.set(cursor.latest_queried_block() as i64);
        let (action, eta) = match cursor.next_action().await {
            Ok((action, eta)) => (action, eta),
            Err(err) => {
                warn!(?err, "Error getting next action");
                return LogsOrSleepDuration::Sleep(SLEEP_DURATION);
            }
        };
        match action {
            // Use `loop` but always break - this allows for returning a value
            // from the loop (the sleep duration)
            #[allow(clippy::never_loop)]
            CursorAction::Query(range) => loop {
                debug!(?range, "Looking for for events in index range");

                let logs = match self.indexer.fetch_logs_in_range(range.clone()).await {
                    Ok(logs) => logs,
                    Err(err) => {
                        warn!(?err, ?range, "Error fetching logs in range");
                        return LogsOrSleepDuration::Sleep(SLEEP_DURATION);
                    }
                };

                let logs = self.dedupe_and_store_logs(logs, &stored_logs_metric).await;
                let logs_found = logs.len() as u64;
                info!(
                    ?range,
                    num_logs = logs_found,
                    estimated_time_to_sync = fmt_sync_time(eta),
                    sequences = ?logs.iter().map(|(log, _)| log.sequence).collect::<Vec<_>>(),
                    cursor = ?cursor,
                    "Found log(s) in index range"
                );

                logs.iter().for_each(|(_, meta)| {
                    if let Err(err) = self.broadcast_sender.send(meta.transaction_id) {
                        warn!(?err, "Error sending txid to receiver");
                    }
                });

                // Update cursor
                if let Err(err) = cursor.update(logs, range).await {
                    warn!(?err, "Error updating cursor");
                    return LogsOrSleepDuration::Sleep(SLEEP_DURATION);
                };
                return LogsOrSleepDuration::Logs(logs_found);
            },
            CursorAction::Sleep(duration) => return LogsOrSleepDuration::Sleep(duration),
        };
    }

    async fn dedupe_and_store_logs(
        &self,
        logs: Vec<(Indexed<T>, LogMeta)>,
        stored_logs_metric: &GenericCounter<AtomicU64>,
    ) -> Vec<(Indexed<T>, LogMeta)> {
        let deduped_logs = HashSet::<_>::from_iter(logs);
        let logs = Vec::from_iter(deduped_logs);

        // Store deliveries
        let stored = match self.db.store_logs(&logs).await {
            Ok(stored) => {
                if stored > 0 {
                    println!(
                        "~~~ stored logs in db. domain: {:?}, Len: {:?}, sequenes: {:?}, logs: {:?}",
                        self.domain,
                        stored,
                        logs.iter().map(|(log, _)| log.sequence).collect::<Vec<_>>(),
                        logs
                    );
                }
                stored
            }
            Err(err) => {
                warn!(?err, "Error storing logs in db");
                Default::default()
            }
        };
        // Report amount of deliveries stored into db
        stored_logs_metric.inc_by(stored as u64);
        logs
    }
}

/// A ContractSync for syncing events using a SequenceAwareIndexer
pub type SequenceAwareContractSync<T, U> = ContractSync<T, U, Arc<dyn SequenceAwareIndexer<T>>>;

/// Log store for the watermark cursor
pub type WatermarkLogStore<T> = Arc<dyn HyperlaneWatermarkedLogStore<T>>;

/// A ContractSync for syncing events using a RateLimitedContractSyncCursor
pub type WatermarkContractSync<T> =
    SequenceAwareContractSync<T, Arc<dyn HyperlaneWatermarkedLogStore<T>>>;

/// Abstraction over a contract syncer that can also be converted into a cursor
#[async_trait]
pub trait ContractSyncer<T>: Send + Sync {
    /// Returns a new cursor to be used for syncing events from the indexer
    async fn cursor(&self, index_settings: IndexSettings) -> Box<dyn ContractSyncCursor<T>>;

    /// Syncs events from the indexer using the provided cursor
    async fn sync(&self, label: &'static str, opts: SyncOptions<T>);

    /// The domain of this syncer
    fn domain(&self) -> &HyperlaneDomain;

    /// If this syncer is also a broadcaster, return the channel to receive txids
    fn get_new_receive_tx_channel(&self) -> BroadcastReceiver<H512>;

    /// Set the channel to receive txids
    async fn set_receive_tx_channel(&mut self, channel: BroadcastReceiver<H512>);

    // async fn receive_tx_to_index(&self) -> Option<H256> {
    //     None
    // }
}

#[derive(new)]
pub struct SyncOptions<T> {
    // Keep as optional fields for now to run them simultaneously.
    // Might want to refactor into an enum later.
    cursor: Option<Box<dyn ContractSyncCursor<T>>>,
    tx_id_recv: Option<BroadcastReceiver<H512>>,
}

impl<T> From<Box<dyn ContractSyncCursor<T>>> for SyncOptions<T> {
    fn from(cursor: Box<dyn ContractSyncCursor<T>>) -> Self {
        Self {
            cursor: Some(cursor),
            tx_id_recv: None,
        }
    }
}

#[async_trait]
impl<T> ContractSyncer<T> for WatermarkContractSync<T>
where
    T: Debug + Send + Sync + Clone + Eq + Hash + 'static,
{
    /// Returns a new cursor to be used for syncing events from the indexer based on time
    async fn cursor(&self, index_settings: IndexSettings) -> Box<dyn ContractSyncCursor<T>> {
        let watermark = self.db.retrieve_high_watermark().await.unwrap();
        let index_settings = IndexSettings {
            from: watermark.unwrap_or(index_settings.from),
            chunk_size: index_settings.chunk_size,
            mode: index_settings.mode,
        };
        Box::new(
            RateLimitedContractSyncCursor::new(
                Arc::new(self.indexer.clone()),
                self.db.clone(),
                index_settings.chunk_size,
                index_settings.from,
            )
            .await
            .unwrap(),
        )
    }

    async fn sync(&self, label: &'static str, opts: SyncOptions<T>) {
        ContractSync::sync(self, label, opts).await
    }

    fn domain(&self) -> &HyperlaneDomain {
        ContractSync::domain(self)
    }

    fn get_new_receive_tx_channel(&self) -> BroadcastReceiver<H512> {
        ContractSync::get_new_receive_tx_channel(self)
    }

    async fn set_receive_tx_channel(&mut self, channel: BroadcastReceiver<H512>) {
        ContractSync::set_receive_tx_channel(self, channel).await
    }
}

/// Log store for sequence aware cursors
pub type SequenceAwareLogStore<T> = Arc<dyn HyperlaneSequenceAwareIndexerStore<T>>;

/// A ContractSync for syncing messages using a SequenceSyncCursor
pub type SequencedDataContractSync<T> =
    SequenceAwareContractSync<T, Arc<dyn HyperlaneSequenceAwareIndexerStore<T>>>;

#[async_trait]
impl<T> ContractSyncer<T> for SequencedDataContractSync<T>
where
    T: Send + Sync + Debug + Clone + Eq + Hash + 'static,
{
    /// Returns a new cursor to be used for syncing dispatched messages from the indexer
    async fn cursor(&self, index_settings: IndexSettings) -> Box<dyn ContractSyncCursor<T>> {
        Box::new(
            ForwardBackwardSequenceAwareSyncCursor::new(
                self.indexer.clone(),
                Arc::new(self.db.clone()),
                index_settings.chunk_size,
                index_settings.mode,
            )
            .await
            .unwrap(),
        )
    }

    async fn sync(&self, label: &'static str, opts: SyncOptions<T>) {
        ContractSync::sync(self, label, opts).await;
    }

    fn domain(&self) -> &HyperlaneDomain {
        ContractSync::domain(self)
    }

    fn get_new_receive_tx_channel(&self) -> BroadcastReceiver<H512> {
        ContractSync::get_new_receive_tx_channel(self)
    }

    async fn set_receive_tx_channel(&mut self, channel: BroadcastReceiver<H512>) {
        ContractSync::set_receive_tx_channel(self, channel).await
    }
}
