//! The relayer forwards signed checkpoints from the outbox to chain to inboxes
//!
//! At a regular interval, the relayer polls Outbox for signed checkpoints and
//! submits them as checkpoints on the inbox.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(unused_extern_crates)]

mod checkpoint_relayer;
mod merkle_tree_builder;
mod message_processor;
mod prover;
mod relayer;
mod settings;

use color_eyre::Result;

use abacus_base::Agent;

use crate::{relayer::Relayer, settings::RelayerSettings as Settings};

async fn _main() -> Result<()> {
    color_eyre::install()?;
    let settings = Settings::new()?;

    let agent = Relayer::from_settings(settings).await?;

    agent
        .as_ref()
        .settings
        .tracing
        .start_tracing(agent.metrics().span_duration())?;

    let _ = agent.metrics().run_http_server();

    agent.run().await??;
    Ok(())
}

fn main() -> Result<()> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(_main())
}
