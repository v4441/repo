use std::{
    collections::HashMap,
    fmt::{Debug, Formatter},
    sync::Arc,
    time::Duration,
};

use derive_new::new;
use eyre::Result;
use hyperlane_base::{db::HyperlaneRocksDB, CoreMetrics};
use hyperlane_core::{HyperlaneDomain, HyperlaneMessage};
use prometheus::IntGauge;
use tokio::{
    sync::{mpsc::UnboundedSender, RwLock},
    task::JoinHandle,
};
use tracing::{debug, info_span, instrument, instrument::Instrumented, trace, Instrument};

use super::pending_message::*;
use crate::{
    merkle_tree_builder::MerkleTreeBuilder, msg::pending_operation::DynPendingOperation,
    settings::matching_list::MatchingList,
};

/// Finds unprocessed messages from an origin and submits then through a channel
/// for to the appropriate destination.
#[derive(new)]
pub struct MessageProcessor {
    db: HyperlaneRocksDB,
    whitelist: Arc<MatchingList>,
    blacklist: Arc<MatchingList>,
    metrics: MessageProcessorMetrics,
    prover_sync: Arc<RwLock<MerkleTreeBuilder>>,
    /// channel for each destination chain to send operations (i.e. message
    /// submissions) to
    send_channels: HashMap<u32, UnboundedSender<Box<DynPendingOperation>>>,
    /// Needed context to send a message for each destination chain
    destination_ctxs: HashMap<u32, Arc<MessageContext>>,
    #[new(default)]
    message_nonce: u32,
    to_skip: Vec<u32>,
}

impl Debug for MessageProcessor {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "MessageProcessor {{ whitelist: {:?}, blacklist: {:?}, prover_sync: {:?}, message_nonce: {:?} }}",
            self.whitelist,
            self.blacklist,
            self.prover_sync,
            self.message_nonce
        )
    }
}

impl MessageProcessor {
    /// The domain this processor is getting messages from.
    pub fn domain(&self) -> &HyperlaneDomain {
        self.db.domain()
    }

    pub fn spawn(self) -> Instrumented<JoinHandle<Result<()>>> {
        let span = info_span!("MessageProcessor");
        tokio::spawn(async move { self.main_loop().await }).instrument(span)
    }

    #[instrument(ret, err, skip(self), level = "info", fields(domain=%self.domain()))]
    async fn main_loop(mut self) -> Result<()> {
        // Forever, scan HyperlaneRocksDB looking for new messages to send. When criteria are
        // satisfied or the message is disqualified, push the message onto
        // self.tx_msg and then continue the scan at the next highest
        // nonce.
        loop {
            self.tick().await?;
        }
    }

    /// Tries to get the next message to process.
    ///
    /// If no message with self.message_nonce is found, returns None.
    /// If the message with self.message_nonce is found and has previously
    /// been marked as processed, increments self.message_nonce and returns
    /// None.
    fn try_get_unprocessed_message(&mut self) -> Result<Option<HyperlaneMessage>> {
        loop {
            if self.domain().id() == 22222 && self.message_nonce == 206730 {
                for i in 0..100 {
                    let nonce = self.message_nonce + i;
                    tracing::warn!(
                        nonce,
                        present_in_db = self.db.retrieve_message_by_nonce(nonce)?.is_some(),
                        "Checking if Nautilus message is present",
                    );
                }
                tracing::warn!(
                    ?self.to_skip,
                    "Skipping message nonces for domain 22222, which is lost by the Eclipse team",
                );
                // If the domain is the origin, we can't send messages to ourselves.
                self.message_nonce += 1;
            }

            // First, see if we can find the message so we can update the gauge.
            if let Some(message) = self.db.retrieve_message_by_nonce(self.message_nonce)? {
                // Update the latest nonce gauges
                self.metrics
                    .max_last_known_message_nonce_gauge
                    .set(message.nonce as i64);
                if let Some(metrics) = self.metrics.get(message.destination) {
                    metrics.set(message.nonce as i64);
                }

                // If this message has already been processed, on to the next one.
                if !self
                    .db
                    .retrieve_processed_by_nonce(&self.message_nonce)?
                    .unwrap_or(false)
                {
                    return Ok(Some(message));
                } else {
                    debug!(nonce=?self.message_nonce, "Message already marked as processed in DB");
                    self.message_nonce += 1;
                }
            } else {
                trace!(nonce=?self.message_nonce, "No message found in DB for nonce");
                return Ok(None);
            }
        }
    }

    /// One round of processing, extracted from infinite work loop for
    /// testing purposes.
    async fn tick(&mut self) -> Result<()> {
        // Scan until we find next nonce without delivery confirmation.
        if let Some(msg) = self.try_get_unprocessed_message()? {
            debug!(?msg, "Processor working on message");
            let destination = msg.destination;

            // Skip if not whitelisted.
            if !self.whitelist.msg_matches(&msg, true) {
                debug!(?msg, whitelist=?self.whitelist, "Message not whitelisted, skipping");
                self.message_nonce += 1;
                return Ok(());
            }

            // Skip if the message is blacklisted
            if self.blacklist.msg_matches(&msg, false) {
                debug!(?msg, blacklist=?self.blacklist, "Message blacklisted, skipping");
                self.message_nonce += 1;
                return Ok(());
            }

            // Skip if the message is intended for this origin
            if destination == self.domain().id() {
                debug!(?msg, "Message destined for self, skipping");
                self.message_nonce += 1;
                return Ok(());
            }

            // Skip if the message is intended for a destination we do not service
            if !self.send_channels.contains_key(&destination) {
                debug!(?msg, "Message destined for unknown domain, skipping");
                self.message_nonce += 1;
                return Ok(());
            }

            // Feed the message to the prover sync
            self.prover_sync
                .write()
                .await
                .update_to_index(msg.nonce)
                .await?;

            debug!(%msg, "Sending message to submitter");

            // Finally, build the submit arg and dispatch it to the submitter.
            let pending_msg = PendingMessage::from_persisted_retries(
                msg,
                self.destination_ctxs[&destination].clone(),
            );
            self.send_channels[&destination].send(Box::new(pending_msg.into()))?;
            self.message_nonce += 1;
        } else {
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        Ok(())
    }
}

#[derive(Debug)]
pub struct MessageProcessorMetrics {
    max_last_known_message_nonce_gauge: IntGauge,
    last_known_message_nonce_gauges: HashMap<u32, IntGauge>,
}

impl MessageProcessorMetrics {
    pub fn new<'a>(
        metrics: &CoreMetrics,
        origin: &HyperlaneDomain,
        destinations: impl Iterator<Item = &'a HyperlaneDomain>,
    ) -> Self {
        let mut gauges: HashMap<u32, IntGauge> = HashMap::new();
        for destination in destinations {
            gauges.insert(
                destination.id(),
                metrics.last_known_message_nonce().with_label_values(&[
                    "processor_loop",
                    origin.name(),
                    destination.name(),
                ]),
            );
        }
        Self {
            max_last_known_message_nonce_gauge: metrics
                .last_known_message_nonce()
                .with_label_values(&["processor_loop", origin.name(), "any"]),
            last_known_message_nonce_gauges: gauges,
        }
    }

    fn get(&self, destination: u32) -> Option<&IntGauge> {
        self.last_known_message_nonce_gauges.get(&destination)
    }
}

#[cfg(test)]
mod test {
    use std::time::Instant;

    use hyperlane_base::{
        db::{test_utils, HyperlaneRocksDB},
        settings::{ChainConf, ChainConnectionConf, Settings},
    };
    use hyperlane_test::mocks::{MockMailboxContract, MockValidatorAnnounceContract};
    use prometheus::{IntCounter, Registry};
    use tokio::{
        sync::mpsc::{self, UnboundedReceiver},
        time::sleep,
    };

    use super::*;
    use crate::msg::{
        gas_payment::GasPaymentEnforcer, metadata::BaseMetadataBuilder,
        pending_operation::PendingOperation,
    };

    fn dummy_processor_metrics(domain_id: u32) -> MessageProcessorMetrics {
        MessageProcessorMetrics {
            max_last_known_message_nonce_gauge: IntGauge::new(
                "dummy_max_last_known_message_nonce_gauge",
                "help string",
            )
            .unwrap(),
            last_known_message_nonce_gauges: HashMap::from([(
                domain_id,
                IntGauge::new("dummy_last_known_message_nonce_gauge", "help string").unwrap(),
            )]),
        }
    }

    fn dummy_submission_metrics() -> MessageSubmissionMetrics {
        MessageSubmissionMetrics {
            last_known_nonce: IntGauge::new("last_known_nonce_gauge", "help string").unwrap(),
            messages_processed: IntCounter::new("message_processed_gauge", "help string").unwrap(),
        }
    }

    fn dummy_chain_conf(domain: &HyperlaneDomain) -> ChainConf {
        ChainConf {
            domain: domain.clone(),
            signer: Default::default(),
            finality_blocks: Default::default(),
            addresses: Default::default(),
            connection: ChainConnectionConf::Ethereum(hyperlane_ethereum::ConnectionConf::Http {
                url: "http://example.com".parse().unwrap(),
            }),
            metrics_conf: Default::default(),
            index: Default::default(),
        }
    }

    fn dummy_metadata_builder(
        domain: &HyperlaneDomain,
        db: &HyperlaneRocksDB,
    ) -> BaseMetadataBuilder {
        let mut settings = Settings::default();
        settings
            .chains
            .insert(domain.name().to_owned(), dummy_chain_conf(domain));
        let destination_chain_conf = settings.chain_setup(domain).unwrap();
        let core_metrics = CoreMetrics::new("dummy_relayer", 37582, Registry::new()).unwrap();
        BaseMetadataBuilder::new(
            destination_chain_conf.clone(),
            Arc::new(RwLock::new(MerkleTreeBuilder::new(db.clone()))),
            Arc::new(MockValidatorAnnounceContract::default()),
            false,
            Arc::new(core_metrics),
            5,
        )
    }

    fn dummy_message_processor(
        origin_domain: &HyperlaneDomain,
        destination_domain: &HyperlaneDomain,
        db: &HyperlaneRocksDB,
    ) -> (
        MessageProcessor,
        UnboundedReceiver<Box<DynPendingOperation>>,
    ) {
        let base_metadata_builder = dummy_metadata_builder(origin_domain, db);
        let message_context = Arc::new(MessageContext {
            destination_mailbox: Arc::new(MockMailboxContract::default()),
            origin_db: db.clone(),
            metadata_builder: base_metadata_builder,
            origin_gas_payment_enforcer: Arc::new(GasPaymentEnforcer::new([], db.clone())),
            transaction_gas_limit: Default::default(),
            metrics: dummy_submission_metrics(),
        });

        let (send_channel, receive_channel) = mpsc::unbounded_channel::<Box<DynPendingOperation>>();
        (
            MessageProcessor::new(
                db.clone(),
                Default::default(),
                Default::default(),
                dummy_processor_metrics(origin_domain.id()),
                Arc::new(RwLock::new(MerkleTreeBuilder::new(db.clone()))),
                HashMap::from([(destination_domain.id(), send_channel)]),
                HashMap::from([(destination_domain.id(), message_context)]),
                vec![],
            ),
            receive_channel,
        )
    }

    fn dummy_hyperlane_message(destination: &HyperlaneDomain, nonce: u32) -> HyperlaneMessage {
        HyperlaneMessage {
            version: Default::default(),
            nonce,
            // Origin must be different from the destination
            origin: destination.id() + 1,
            sender: Default::default(),
            destination: destination.id(),
            recipient: Default::default(),
            body: Default::default(),
        }
    }

    fn add_db_entry(db: &HyperlaneRocksDB, msg: &HyperlaneMessage, retry_count: u32) {
        db.store_message(msg, Default::default()).unwrap();
        if retry_count > 0 {
            db.store_pending_message_retry_count_by_message_id(&msg.id(), &retry_count)
                .unwrap();
        }
    }

    fn dummy_domain(domain_id: u32, name: &str) -> HyperlaneDomain {
        let test_domain = HyperlaneDomain::new_test_domain(name);
        HyperlaneDomain::Unknown {
            domain_id,
            domain_name: name.to_owned(),
            domain_type: test_domain.domain_type(),
            domain_protocol: test_domain.domain_protocol(),
        }
    }

    /// Only adds database entries to the pending message prefix if the message's
    /// retry count is greater than zero
    fn persist_retried_messages(
        retries: &[u32],
        db: &HyperlaneRocksDB,
        destination_domain: &HyperlaneDomain,
    ) {
        let mut nonce = 0;
        retries.iter().for_each(|num_retries| {
            let message = dummy_hyperlane_message(destination_domain, nonce);
            add_db_entry(db, &message, *num_retries);
            nonce += 1;
        });
    }

    /// Runs the processor and returns the first `num_operations` to arrive on the
    /// receiving end of the channel.
    /// A default timeout is used for all `n` operations to arrive, otherwise the function panics.
    async fn get_first_n_operations_from_processor(
        origin_domain: &HyperlaneDomain,
        destination_domain: &HyperlaneDomain,
        db: &HyperlaneRocksDB,
        num_operations: usize,
    ) -> Vec<Box<DynPendingOperation>> {
        let (message_processor, mut receive_channel) =
            dummy_message_processor(origin_domain, destination_domain, db);

        let process_fut = message_processor.spawn();
        let mut pending_messages = vec![];
        let pending_message_accumulator = async {
            while let Some(pm) = receive_channel.recv().await {
                pending_messages.push(pm);
                if pending_messages.len() == num_operations {
                    break;
                }
            }
        };
        tokio::select! {
            _ = process_fut => {},
            _ = pending_message_accumulator => {},
            _ = sleep(Duration::from_millis(200)) => { panic!("No PendingMessage received from the processor") }
        };
        pending_messages
    }

    #[tokio::test]
    async fn test_full_pending_message_persistence_flow() {
        test_utils::run_test_db(|db| async move {
            let origin_domain = dummy_domain(0, "dummy_origin_domain");
            let destination_domain = dummy_domain(1, "dummy_destination_domain");
            let db = HyperlaneRocksDB::new(&origin_domain, db);

            // Assume the message syncer stored some new messages in HyperlaneDB
            let msg_retries = vec![0, 0, 0];
            persist_retried_messages(&msg_retries, &db, &destination_domain);

            // Run parser to load the messages in memory
            let pending_messages = get_first_n_operations_from_processor(
                &origin_domain,
                &destination_domain,
                &db,
                msg_retries.len(),
            )
            .await;

            // Set some retry counts. This should update HyperlaneDB entries too.
            let msg_retries_to_set = [3, 0, 10];
            pending_messages
                .into_iter()
                .enumerate()
                .for_each(|(i, mut pm)| pm.set_retries(msg_retries_to_set[i]));

            // Run parser again
            let pending_messages = get_first_n_operations_from_processor(
                &origin_domain,
                &destination_domain,
                &db,
                msg_retries.len(),
            )
            .await;

            // Expect the HyperlaneDB entry to have been updated, so the `OpQueue` in the submitter
            // can be accurately reconstructed on restart.
            // If the retry counts were correctly persisted, the backoffs will have the expected value.
            pending_messages
                .iter()
                .zip(msg_retries_to_set.iter())
                .for_each(|(pm, expected_retries)| {
                    // Round up the actuall backoff because it was calculated with an `Instant::now()` that was a fraction of a second ago
                    let expected_backoff = PendingMessage::calculate_msg_backoff(*expected_retries)
                        .map(|b| b.as_secs_f32().round());
                    let actual_backoff = pm._next_attempt_after().map(|instant| {
                        instant.duration_since(Instant::now()).as_secs_f32().round()
                    });
                    assert_eq!(expected_backoff, actual_backoff);
                });
        })
        .await;
    }
}
