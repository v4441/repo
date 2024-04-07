use std::{collections::HashMap, fmt::Debug, hash::Hash, sync::Arc};

use eyre::{eyre, Context, Result};
use futures_util::future::try_join_all;
use hyperlane_core::{
    HyperlaneChain, HyperlaneDomain, HyperlaneLogStore, HyperlaneProvider,
    HyperlaneSequenceAwareIndexerStoreReader, HyperlaneWatermarkedLogStore, InterchainGasPaymaster,
    Mailbox, MerkleTreeHook, MultisigIsm, SequenceAwareIndexer, Sequenced, ValidatorAnnounce, H256,
};

use crate::{
    cursors::CursorType,
    db::HyperlaneRocksDB,
    settings::{chains::ChainConf, trace::TracingConfig},
    ContractSync, ContractSyncMetrics, ContractSyncer, CoreMetrics, HyperlaneAgentCore,
    SequenceAwareLogStore, SequencedDataContractSync, Server, WatermarkContractSync,
    WatermarkLogStore,
};

use super::TryFromWithMetrics;

/// Settings. Usually this should be treated as a base config and used as
/// follows:
///
/// ```ignore
/// use hyperlane_base::*;
/// use serde::Deserialize;
///
/// pub struct OtherSettings { /* anything */ };
///
/// #[derive(Debug, Deserialize)]
/// pub struct MySettings {
///     #[serde(flatten)]
///     base_settings: Settings,
///     #[serde(flatten)]
///     other_settings: (),
/// }
///
/// // Make sure to define MySettings::new()
/// impl MySettings {
///     fn new() -> Self {
///         unimplemented!()
///     }
/// }
/// ```
#[derive(Debug, Default)]
pub struct Settings {
    /// Configuration for contracts on each chain
    pub chains: HashMap<String, ChainConf>,
    /// Port to listen for prometheus scrape requests
    pub metrics_port: u16,
    /// The tracing configuration
    pub tracing: TracingConfig,
}

impl Settings {
    /// Generate an agent core
    pub fn build_hyperlane_core(&self, metrics: Arc<CoreMetrics>) -> HyperlaneAgentCore {
        HyperlaneAgentCore {
            metrics,
            settings: self.clone(),
        }
    }

    /// Try to get a MultisigIsm
    pub async fn build_multisig_ism(
        &self,
        domain: &HyperlaneDomain,
        address: H256,
        metrics: &CoreMetrics,
    ) -> Result<Box<dyn MultisigIsm>> {
        let setup = self
            .chain_setup(domain)
            .with_context(|| format!("Building multisig ism for {domain}"))?;
        setup.build_multisig_ism(address, metrics).await
    }

    /// Try to get the chain configuration for the given domain.
    pub fn chain_setup(&self, domain: &HyperlaneDomain) -> Result<&ChainConf> {
        self.chains
            .get(domain.name())
            .ok_or_else(|| eyre!("No chain setup found for {domain}"))
    }

    /// Try to get the domain for a given chain by name.
    pub fn lookup_domain(&self, chain_name: &str) -> Result<HyperlaneDomain> {
        self.chains
            .get(chain_name)
            .ok_or_else(|| eyre!("No chain setup found for {chain_name}"))
            .map(|c| c.domain.clone())
    }

    /// Create the core metrics from the settings given the name of the agent.
    pub fn metrics(&self, name: &str) -> Result<Arc<CoreMetrics>> {
        Ok(Arc::new(CoreMetrics::new(
            name,
            self.metrics_port,
            prometheus::Registry::new(),
        )?))
    }

    /// Create the server from the settings given the name of the agent.
    pub fn server(&self, core_metrics: Arc<CoreMetrics>) -> Result<Arc<Server>> {
        Ok(Arc::new(Server::new(self.metrics_port, core_metrics)))
    }

    /// Private to preserve linearity of AgentCore::from_settings -- creating an
    /// agent consumes the settings.
    fn clone(&self) -> Self {
        Self {
            chains: self.chains.clone(),
            metrics_port: self.metrics_port,
            tracing: self.tracing.clone(),
        }
    }
}

/// Generate a call to ChainSetup for the given builder
macro_rules! build_contract_fns {
    ($singular:ident, $plural:ident -> $ret:ty) => {
        /// Delegates building to ChainSetup
        pub async fn $singular(
            &self,
            domain: &HyperlaneDomain,
            metrics: &CoreMetrics,
        ) -> eyre::Result<Box<$ret>> {
            let setup = self.chain_setup(domain)?;
            setup.$singular(metrics).await
        }

        /// Builds a contract for each domain
        pub async fn $plural(
            &self,
            domains: impl Iterator<Item = &HyperlaneDomain>,
            metrics: &CoreMetrics,
        ) -> Result<HashMap<HyperlaneDomain, Arc<$ret>>> {
            try_join_all(domains.map(|d| self.$singular(d, metrics)))
                .await?
                .into_iter()
                .map(|i| Ok((i.domain().clone(), Arc::from(i))))
                .collect()
        }
    };
}

type SequenceIndexer<T> = Arc<dyn SequenceAwareIndexer<T>>;

impl Settings {
    build_contract_fns!(build_interchain_gas_paymaster, build_interchain_gas_paymasters -> dyn InterchainGasPaymaster);
    build_contract_fns!(build_mailbox, build_mailboxes -> dyn Mailbox);
    build_contract_fns!(build_merkle_tree_hook, build_merkle_tree_hooks -> dyn MerkleTreeHook);
    build_contract_fns!(build_validator_announce, build_validator_announces -> dyn ValidatorAnnounce);
    build_contract_fns!(build_provider, build_providers -> dyn HyperlaneProvider);

    /// Build a contract sync for type `T` using indexer `I` and log store `D`
    pub async fn sequenced_contract_sync<T>(
        &self,
        domain: &HyperlaneDomain,
        metrics: &CoreMetrics,
        sync_metrics: &ContractSyncMetrics,
        db: &HyperlaneRocksDB,
    ) -> eyre::Result<Arc<SequencedDataContractSync<T>>>
    where
        T: Sequenced + Debug,
        SequenceIndexer<T>: TryFromWithMetrics<ChainConf>,
        HyperlaneRocksDB: HyperlaneLogStore<T> + HyperlaneSequenceAwareIndexerStoreReader<T>,
    {
        let setup = self.chain_setup(domain)?;
        // Currently, all indexers are of the `SequenceIndexer` type
        let indexer = SequenceIndexer::<T>::try_from_with_metrics(setup, metrics).await?;
        Ok(Arc::new(ContractSync::new(
            domain.clone(),
            Arc::new(db.clone()) as SequenceAwareLogStore<_>,
            indexer,
            sync_metrics.clone(),
        )))
    }

    /// Build a contract sync for type `T` using indexer `I` and log store `D`
    pub async fn watermark_contract_sync<T>(
        &self,
        domain: &HyperlaneDomain,
        metrics: &CoreMetrics,
        sync_metrics: &ContractSyncMetrics,
        db: &HyperlaneRocksDB,
    ) -> eyre::Result<Arc<WatermarkContractSync<T>>>
    where
        T: Sequenced + Debug,
        SequenceIndexer<T>: TryFromWithMetrics<ChainConf>,
        HyperlaneRocksDB: HyperlaneLogStore<T> + HyperlaneSequenceAwareIndexerStoreReader<T>,
    {
        let setup = self.chain_setup(domain)?;
        // Currently, all indexers are of the `SequenceIndexer` type
        let indexer = SequenceIndexer::<T>::try_from_with_metrics(setup, metrics).await?;
        Ok(Arc::new(ContractSync::new(
            domain.clone(),
            Arc::new(db.clone()) as WatermarkLogStore<_>,
            indexer,
            sync_metrics.clone(),
        )))
    }

    /// Build multiple contract syncs.
    /// All contracts are currently implementing both sequenced and
    /// watermark traits
    pub async fn contract_syncs<T>(
        &self,
        domains: impl Iterator<Item = &HyperlaneDomain>,
        metrics: &CoreMetrics,
        sync_metrics: &ContractSyncMetrics,
        dbs: HashMap<HyperlaneDomain, HyperlaneRocksDB>,
    ) -> Result<HashMap<HyperlaneDomain, Arc<dyn ContractSyncer<T>>>>
    where
        T: Sequenced + Debug + Send + Sync + Clone + Eq + Hash + 'static,
        SequenceIndexer<T>: TryFromWithMetrics<ChainConf>,
        HyperlaneRocksDB: HyperlaneLogStore<T>
            + HyperlaneSequenceAwareIndexerStoreReader<T>
            + HyperlaneWatermarkedLogStore<T>,
    {
        // TODO: parallelize these calls again
        let mut syncs = vec![];
        for domain in domains {
            let cursor_type: CursorType = domain.domain_protocol().into();

            let sync = match cursor_type {
                CursorType::SequenceAware => {
                    let res = self
                        .sequenced_contract_sync(
                            &domain,
                            metrics,
                            sync_metrics,
                            dbs.get(domain).unwrap(),
                        )
                        .await
                        .map(|r| r as Arc<dyn ContractSyncer<T>>)?;
                    res
                }
                CursorType::RateLimited => {
                    let res = self
                        .watermark_contract_sync(
                            &domain,
                            metrics,
                            sync_metrics,
                            dbs.get(domain).unwrap(),
                        )
                        .await
                        .map(|r| r as Arc<dyn ContractSyncer<T>>)?;
                    res
                }
            };
            syncs.push(sync);
        }

        syncs
            .into_iter()
            .map(|i| Ok((i.domain().clone(), i)))
            .collect()
    }
}
