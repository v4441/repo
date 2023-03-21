//! Hyperlane Sealevel Mailbox data account layouts.

use std::{collections::HashSet, str::FromStr as _};

use borsh::{BorshDeserialize, BorshSerialize};
use hyperlane_core::{accumulator::incremental::IncrementalMerkle as MerkleTree, H256};
use solana_program::{
    account_info::AccountInfo,
    program_error::ProgramError,
    // Note: Not convinced program_pack::{IsInitialized, Pack} add value here.
    pubkey::Pubkey,
};

use crate::{error::Error, DEFAULT_ISM, DEFAULT_ISM_ACCOUNTS};

pub trait Data: BorshDeserialize + BorshSerialize + Default {}
impl<T> Data for T where T: BorshDeserialize + BorshSerialize + Default {}

/// Account data structure wrapper type that handles initialization and (de)serialization.
///
/// (De)serialization is done with borsh and the "on-disk" format is as follows:
/// {
///     initialized: bool,
///     data: T,
/// }
#[derive(Debug, Default)]
pub struct AccountData<T> {
    data: T,
}

impl<T> From<T> for AccountData<T> {
    fn from(data: T) -> Self {
        Self { data }
    }
}

impl<T> AccountData<T>
where
    T: Data,
{
    pub fn into_inner(self) -> T {
        self.data
    }

    pub fn fetch(buf: &mut &[u8]) -> Result<Self, ProgramError> {
        // Account data is zero initialized.
        let initialized = bool::deserialize(buf)?;
        let data = if initialized {
            T::deserialize(buf)?
        } else {
            T::default()
        };
        Ok(Self { data })
    }

    // Optimisically write then realloc on failure.
    // If we serialize and calculate len before realloc we will waste heap space as there is no
    // free(). Tradeoff between heap usage and compute budget.
    pub fn store<'a>(
        &self,
        account: &AccountInfo<'a>,
        allow_realloc: bool,
    ) -> Result<(), ProgramError> {
        if !account.is_writable || account.executable {
            return Err(ProgramError::from(Error::AccountReadOnly));
        }
        let realloc_increment = 1024;
        loop {
            let mut guard = account.try_borrow_mut_data()?;
            let data = &mut *guard;
            let data_len = data.len();
            match true.serialize(data).and_then(|_| self.data.serialize(data)) {
                Ok(_) => break,
                Err(err) => match err.kind() {
                    std::io::ErrorKind::WriteZero => {
                        if !allow_realloc {
                            return Err(ProgramError::BorshIoError(err.to_string()));
                        }
                    }
                    _ => return Err(ProgramError::BorshIoError(err.to_string())),
                },
            };
            drop(guard);
            if cfg!(target_os = "solana") {
                account.realloc(data_len + realloc_increment, false)?;
            } else {
                panic!("realloc() is only supported on the SVM");
            }
        }
        Ok(())
    }
}

pub type InboxAccount = AccountData<Inbox>;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Inbox {
    pub local_domain: u32,
    pub auth_bump_seed: u8,
    pub inbox_bump_seed: u8,
    // Note: 10MB account limit is around ~300k entries.
    pub delivered: HashSet<H256>,
    pub ism: Pubkey,
    pub ism_accounts: Vec<Pubkey>,
}

impl Default for Inbox {
    fn default() -> Self {
        Self {
            local_domain: 0,
            auth_bump_seed: 0,
            inbox_bump_seed: 0,
            delivered: Default::default(),
            // TODO can declare_id!() or similar be used for these to compute at compile time?
            ism: Pubkey::from_str(DEFAULT_ISM).unwrap(),
            ism_accounts: DEFAULT_ISM_ACCOUNTS
                .iter()
                .map(|account| Pubkey::from_str(account).unwrap())
                .collect(),
        }
    }
}

pub type OutboxAccount = AccountData<Outbox>;

#[derive(BorshSerialize, BorshDeserialize, Debug, Default)]
pub struct Outbox {
    pub local_domain: u32,
    pub auth_bump_seed: u8,
    pub outbox_bump_seed: u8,
    pub tree: MerkleTree,
}
