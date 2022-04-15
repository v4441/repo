use crate::{
    cancel_task,
    metrics::CoreMetrics,
    settings::{IndexSettings, Settings},
    CachingInbox, CachingOutbox, InboxValidatorManagers,
};
use abacus_core::db::DB;
use async_trait::async_trait;
use color_eyre::{eyre::bail, Report, Result};
use futures_util::future::select_all;
use tracing::instrument::Instrumented;
use tracing::{info_span, Instrument};

use std::{collections::HashMap, sync::Arc};
use tokio::task::JoinHandle;

/// Properties shared across all abacus agents
#[derive(Debug)]
pub struct AbacusAgentCore {
    /// A boxed Outbox
    pub outbox: Arc<CachingOutbox>,
    /// A map of boxed Inboxes
    pub inboxes: HashMap<String, Arc<CachingInbox>>,
    /// A map of boxed InboxValidatorManagers
    pub inbox_validator_managers: HashMap<String, Arc<InboxValidatorManagers>>,
    /// A map of boxed (Inbox, InboxValidatorManagers)
    pub inboxes_and_validator_managers:
        HashMap<String, (Arc<CachingInbox>, Arc<InboxValidatorManagers>)>,
    /// A persistent KV Store (currently implemented as rocksdb)
    pub db: DB,
    /// Prometheus metrics
    pub metrics: Arc<CoreMetrics>,
    /// The height at which to start indexing the Outbox
    pub indexer: IndexSettings,
    /// Settings this agent was created with
    pub settings: crate::settings::Settings,
}

impl AbacusAgentCore {
    /// Constructor
    pub fn new(
        outbox: Arc<CachingOutbox>,
        inboxes: HashMap<String, Arc<CachingInbox>>,
        inbox_validator_managers: HashMap<String, Arc<InboxValidatorManagers>>,
        db: DB,
        metrics: Arc<CoreMetrics>,
        indexer: IndexSettings,
        settings: crate::settings::Settings,
    ) -> Result<AbacusAgentCore> {
        let mut inboxes_and_validator_managers = HashMap::default();
        for (name, inbox) in &inboxes {
            if let Some(inbox_validator_manager) = inbox_validator_managers.get(name) {
                inboxes_and_validator_managers.insert(
                    name.to_owned(),
                    (inbox.clone(), inbox_validator_manager.clone()),
                );
            } else {
                bail!("No InboxValidatorManager for Inbox named {}", name);
            }
        }
        Ok(AbacusAgentCore {
            outbox,
            inboxes,
            inbox_validator_managers,
            inboxes_and_validator_managers,
            db,
            metrics,
            indexer,
            settings,
        })
    }
}

/// A trait for an abacus agent
#[async_trait]
pub trait Agent: Send + Sync + std::fmt::Debug + AsRef<AbacusAgentCore> {
    /// The agent's name
    const AGENT_NAME: &'static str;

    /// The settings object for this agent
    type Settings: AsRef<Settings>;

    /// Instantiate the agent from the standard settings object
    async fn from_settings(settings: Self::Settings) -> Result<Self>
    where
        Self: Sized;

    /// Return a handle to the metrics registry
    fn metrics(&self) -> Arc<CoreMetrics> {
        self.as_ref().metrics.clone()
    }

    /// Return a handle to the DB
    fn db(&self) -> DB {
        self.as_ref().db.clone()
    }

    /// Return a reference to a outbox contract
    fn outbox(&self) -> Arc<CachingOutbox> {
        self.as_ref().outbox.clone()
    }

    /// Get a reference to the inboxes map
    fn inboxes(&self) -> &HashMap<String, Arc<CachingInbox>> {
        &self.as_ref().inboxes
    }

    /// Get a reference to an inbox by its name
    fn inbox_by_name(&self, name: &str) -> Option<Arc<CachingInbox>> {
        self.inboxes().get(name).map(Clone::clone)
    }

    /// Get a reference to the inbox_validator_managers map
    fn inbox_validator_managers(&self) -> &HashMap<String, Arc<InboxValidatorManagers>> {
        &self.as_ref().inbox_validator_managers
    }

    /// Get a reference to an InboxValidatorManager in by its name
    fn inbox_validator_manager_by_name(&self, name: &str) -> Option<Arc<InboxValidatorManagers>> {
        self.inbox_validator_managers().get(name).map(Clone::clone)
    }

    /// Gets a map of names to a tuple of (Inbox, InboxValidatorManager).
    fn inboxes_and_validator_managers(
        &self,
    ) -> &HashMap<String, (Arc<CachingInbox>, Arc<InboxValidatorManagers>)> {
        &self.as_ref().inboxes_and_validator_managers
    }

    /// Run tasks
    #[allow(clippy::unit_arg, unused_must_use)]
    fn run_all(
        &self,
        tasks: Vec<Instrumented<JoinHandle<Result<(), Report>>>>,
    ) -> Instrumented<JoinHandle<Result<()>>>
    where
        Self: Sized + 'static,
    {
        let span = info_span!("run_all");
        tokio::spawn(async move {
            let (res, _, remaining) = select_all(tasks).await;

            for task in remaining.into_iter() {
                cancel_task!(task);
            }

            res?
        })
        .instrument(span)
    }
}
