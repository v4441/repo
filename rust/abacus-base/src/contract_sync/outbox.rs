use std::cmp::min;
use std::time::Duration;

use tokio::time::sleep;
use tracing::{debug, info, info_span, warn};
use tracing::{instrument::Instrumented, Instrument};

use abacus_core::{chain_from_domain, CommittedMessage, ListValidity, OutboxIndexer};

use crate::{
    contract_sync::{last_message::OptLatestLeafIndex, schema::OutboxContractSyncDB},
    ContractSync,
};

const MESSAGES_LABEL: &str = "messages";

impl<I> ContractSync<I>
where
    I: OutboxIndexer + 'static,
{
    /// Sync outbox messages
    pub fn sync_outbox_messages(&self) -> Instrumented<tokio::task::JoinHandle<eyre::Result<()>>> {
        let span = info_span!("MessageContractSync");

        let db = self.db.clone();
        let indexer = self.indexer.clone();
        let indexed_height = self
            .metrics
            .indexed_height
            .with_label_values(&[MESSAGES_LABEL, &self.chain_name]);

        let stored_messages = self
            .metrics
            .stored_events
            .with_label_values(&[MESSAGES_LABEL, &self.chain_name]);

        let missed_messages = self
            .metrics
            .missed_events
            .with_label_values(&[MESSAGES_LABEL, &self.chain_name]);

        let message_leaf_index = self.metrics.message_leaf_index.clone();
        let chain_name = self.chain_name.clone();

        let config_from = self.index_settings.from();
        let chunk_size = self.index_settings.chunk_size();

        tokio::spawn(async move {
            let mut from = db
                .retrieve_message_latest_block_end()
                .map_or_else(|| config_from, |h| h + 1);

            let mut finding_missing = false;
            let mut realized_missing_start_block = 0;
            let mut realized_missing_end_block = 0;
            let mut exponential = 0;

            info!(from = from, "[Messages]: resuming indexer from {from}");

            loop {
                indexed_height.set(from as i64);

                // If we were searching for missing message and have reached
                // original missing start block, turn off finding_missing and
                // TRY to resume normal indexing
                if finding_missing && from >= realized_missing_start_block {
                    info!("Turning off finding_missing mode");
                    finding_missing = false;
                }

                // If we have passed the end block of the missing message, we
                // have found the message and can reset variables
                if from > realized_missing_end_block && realized_missing_end_block != 0 {
                    missed_messages.inc();

                    exponential = 0;
                    realized_missing_start_block = 0;
                    realized_missing_end_block = 0;
                }

                // Only index blocks considered final
                let tip = indexer.get_finalized_block_number().await?;
                if tip <= from {
                    // TODO: Make this configurable
                    // Sleep if caught up to tip
                    sleep(Duration::from_secs(1)).await;
                    continue;
                }

                let candidate = from + chunk_size;
                let to = min(tip, candidate);

                let sorted_messages = indexer.fetch_sorted_messages(from, to).await?;

                debug!(
                    from = from,
                    to = to,
                    message_count = sorted_messages.len(),
                    "[Messages]: indexed block heights {from}...{to}"
                );

                // If no messages found, update last seen block and next height
                // and continue
                if sorted_messages.is_empty() {
                    db.store_message_latest_block_end(to)?;
                    from = to + 1;
                    continue;
                }

                // If messages found, check that list is valid
                let last_leaf_index: OptLatestLeafIndex = db.retrieve_latest_leaf_index()?.into();
                match &last_leaf_index.valid_continuation(&sorted_messages) {
                    ListValidity::Valid => {
                        // Store messages
                        let max_leaf_index_of_batch = db.store_messages(&sorted_messages)?;

                        // Report amount of messages stored into db
                        stored_messages.add(sorted_messages.len().try_into()?);

                        // Report latest leaf index to gauge by dst
                        for raw_msg in sorted_messages.iter() {
                            let dst = CommittedMessage::try_from(raw_msg)
                                .ok()
                                .and_then(|msg| chain_from_domain(msg.message.destination))
                                .unwrap_or("unknown");
                            message_leaf_index
                                .with_label_values(&["dispatch", &chain_name, dst])
                                .set(max_leaf_index_of_batch as i64);
                        }

                        // Move forward next height
                        db.store_message_latest_block_end(to)?;
                        from = to + 1;
                    }
                    ListValidity::Invalid => {
                        if finding_missing {
                            from = to + 1;
                        } else {
                            warn!(
                                last_leaf_index = ?last_leaf_index,
                                start_block = from,
                                end_block = to,
                                "[Messages]: RPC failed to find message(s) between blocks {from}...{to}. Last seen leaf index: {:?}. Activating finding_missing mode.",
                                last_leaf_index
                            );

                            // Turn on finding_missing mode
                            finding_missing = true;
                            realized_missing_start_block = from;
                            realized_missing_end_block = to;

                            from = realized_missing_start_block - (chunk_size * 2u32.pow(exponential as u32));
                            exponential += 1;
                        }
                    }
                    ListValidity::Empty => unreachable!("Tried to validate empty list of messages"),
                };
            }
        })
            .instrument(span)
    }
}

#[cfg(test)]
mod test {
    use std::sync::Arc;
    use std::time::Duration;

    use ethers::core::types::H256;
    use eyre::eyre;
    use mockall::*;
    use tokio::select;
    use tokio::time::{interval, timeout};

    use abacus_core::{db::AbacusDB, AbacusMessage, Encode, RawCommittedMessage};
    use abacus_test::mocks::indexer::MockAbacusIndexer;
    use abacus_test::test_utils;

    use crate::ContractSync;
    use crate::{settings::IndexSettings, ContractSyncMetrics, CoreMetrics};

    #[tokio::test]
    async fn handles_missing_rpc_messages() {
        test_utils::run_test_db(|db| async move {
            let mut message_vec = vec![];
            AbacusMessage {
                origin: 1000,
                destination: 2000,
                sender: H256::from([10; 32]),
                recipient: H256::from([11; 32]),
                body: [10u8; 5].to_vec(),
            }
            .write_to(&mut message_vec)
            .expect("!write_to");

            let first_message = RawCommittedMessage {
                leaf_index: 0,
                message: message_vec.clone(),
            };

            let second_message = RawCommittedMessage {
                leaf_index: 1,
                message: message_vec.clone(),
            };

            let third_message = RawCommittedMessage {
                leaf_index: 2,
                message: message_vec.clone(),
            };

            let fourth_message = RawCommittedMessage {
                leaf_index: 3,
                message: message_vec.clone(),
            };

            let fifth_message = RawCommittedMessage {
                leaf_index: 4,
                message: message_vec.clone(),
            };

            let mut mock_indexer = MockAbacusIndexer::new();
            {
                let mut seq = Sequence::new();

                // Return first message.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                let m1 = first_message.clone();
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![m1]).into());

                // Return second message, misses third message.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                let m2 = second_message.clone();
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![m2]));

                // Misses the fourth.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![]));

                // Empty range.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![]));

                // Second --> fifth message seen as invalid.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                let m5 = fifth_message.clone();
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![m5]));

                // Indexer goes back and tries empty block range
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![]));

                // Indexer tries to move on to realized missing block range but can't.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                let m5 = fifth_message.clone();
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![m5]));

                // Indexer goes back further and gets to fourth message.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                let m4 = fourth_message.clone();
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![m4]));

                // Indexer gets empty range again.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![]));

                // Indexer gets fifth message again.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                let m5 = fifth_message.clone();
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![m5]));

                // Indexer goes back even further and gets to message 2 and 3.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                let m2 = second_message.clone();
                let m3 = third_message.clone();
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![m2, m3]));

                // Return fourth message.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                let m4 = fourth_message.clone();
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![m4]));

                // Re-indexes empty block range.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![]));

                // Return fifth message.
                mock_indexer
                    .expect__get_finalized_block_number()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(|| Ok(100));
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .times(1)
                    .in_sequence(&mut seq)
                    .return_once(move |_, _| Ok(vec![fifth_message]));

                mock_indexer
                    .expect__get_finalized_block_number()
                    .returning(|| Ok(100));
                mock_indexer
                    .expect__fetch_sorted_messages()
                    .returning(|_, _| Ok(vec![]));
            }

            let abacus_db = AbacusDB::new("outbox_1", db);

            let indexer = Arc::new(mock_indexer);
            let metrics = Arc::new(
                CoreMetrics::new("contract_sync_test", None, prometheus::Registry::new())
                    .expect("could not make metrics"),
            );

            let sync_metrics = ContractSyncMetrics::new(metrics);

            let contract_sync = ContractSync::new(
                "outbox_1".into(),
                abacus_db.clone(),
                indexer.clone(),
                IndexSettings {
                    from: Some("0".to_string()),
                    chunk: Some("10".to_string()),
                },
                sync_metrics,
            );

            let sync_task = contract_sync.sync_outbox_messages();
            let test_pass_fut = timeout(Duration::from_secs(30), async move {
                let mut interval = interval(Duration::from_millis(20));
                loop {
                    if abacus_db.message_by_leaf_index(0).expect("!db").is_some()
                        && abacus_db.message_by_leaf_index(1).expect("!db").is_some()
                        && abacus_db.message_by_leaf_index(2).expect("!db").is_some()
                        && abacus_db.message_by_leaf_index(3).expect("!db").is_some()
                        && abacus_db.message_by_leaf_index(4).expect("!db").is_some()
                    {
                        break;
                    }
                    interval.tick().await;
                }
            });
            let test_result = select! {
                 err = sync_task => Err(eyre!(
                    "sync task unexpectedly done before test: {:?}", err.unwrap_err())),
                 tests_result = test_pass_fut =>
                   if tests_result.is_ok() { Ok(()) } else { Err(eyre!("timed out")) }
            };
            assert!(test_result.is_ok());
        })
        .await
    }
}
