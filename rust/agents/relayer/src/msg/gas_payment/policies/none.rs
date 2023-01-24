use async_trait::async_trait;
use eyre::Result;

use hyperlane_core::{HyperlaneMessage, InterchainGasPayment, TxCostEstimate, U256};

use crate::msg::gas_payment::GasPaymentPolicy;

#[derive(Debug)]
pub struct GasPaymentPolicyNone {}

impl GasPaymentPolicyNone {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl GasPaymentPolicy for GasPaymentPolicyNone {
    async fn message_meets_gas_payment_requirement(
        &self,
        _message: &HyperlaneMessage,
        _current_payment: &InterchainGasPayment,
        tx_cost_estimate: &TxCostEstimate,
    ) -> Result<Option<U256>> {
        Ok(Some(tx_cost_estimate.gas_limit))
    }
}

#[tokio::test]
async fn test_gas_payment_policy_none() {
    use hyperlane_core::{HyperlaneMessage, H256, U256};

    let policy = GasPaymentPolicyNone::new();

    let message = HyperlaneMessage::default();

    // Always returns true
    assert_eq!(
        policy
            .message_meets_gas_payment_requirement(
                &message,
                &InterchainGasPayment {
                    message_id: H256::zero(),
                    payment: U256::zero(),
                    gas_amount: U256::zero(),
                },
                &TxCostEstimate {
                    gas_limit: U256::from(100000u32),
                    gas_price: U256::from(100001u32),
                },
            )
            .await
            .unwrap(),
        Some(U256::from(100000u32))
    );
}
