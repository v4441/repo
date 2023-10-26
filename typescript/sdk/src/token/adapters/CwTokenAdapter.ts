import { ExecuteInstruction } from '@cosmjs/cosmwasm-stargate';

import { Address } from '@hyperlane-xyz/utils';

import { BaseCwAdapter } from '../../app/MultiProtocolApp';
import { MultiProtocolProvider } from '../../providers/MultiProtocolProvider';

import { ITokenAdapter, TransferParams } from './ITokenAdapter';

// Interacts with IBC denom tokens
export class NativeTokenAdapter extends BaseCwAdapter implements ITokenAdapter {
  constructor(
    chainName: string,
    multiProvider: MultiProtocolProvider,
    addresses: any,
    public readonly ibcDenom: string,
  ) {
    super(chainName, multiProvider, addresses);
  }

  async getBalance(address: Address): Promise<string> {
    const balance = await this.getProvider().getBalance(address, this.ibcDenom);
    return balance.amount;
  }

  async getMetadata(): Promise<CW20Metadata> {
    throw new Error('Metadata not available to native tokens');
  }

  async populateApproveTx(
    _params: TransferParams,
  ): Promise<ExecuteInstruction> {
    throw new Error('Approve not required for native tokens');
  }

  async populateTransferTx({
    recipient,
    weiAmountOrId,
  }: TransferParams): Promise<ExecuteInstruction> {
    // TODO: check if this works with execute instruction? (contract type, empty message)
    return {
      contractAddress: recipient,
      msg: {},
      funds: [
        {
          amount: weiAmountOrId.toString(),
          denom: this.ibcDenom,
        },
      ],
    };
  }
}

export type CW20Metadata = ERC20Metadata;

// TODO: import from cw20 bindings
type TokenInfoResponse = {
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
};

type BalanceResponse = {
  balance: string;
};

// https://github.com/CosmWasm/cw-plus/blob/main/packages/cw20/README.md
// Interacts with CW20/721 contracts
export class Cw20TokenAdapter extends BaseCwAdapter implements ITokenAdapter {
  // public readonly contract: CW20QueryClient;
  public readonly contractAddress: string;

  constructor(
    chainName: string,
    multiProvider: MultiProtocolProvider,
    addresses: { token: Address },
  ) {
    super(chainName, multiProvider, addresses);
    this.contractAddress = addresses.token;
  }

  async getBalance(address: Address): Promise<string> {
    const balanceResponse: BalanceResponse =
      await this.getProvider().queryContractSmart(this.contractAddress, {
        balance: {
          address,
        },
      });
    return balanceResponse.balance;
  }

  async getMetadata(): Promise<CW20Metadata> {
    const tokenInfo: TokenInfoResponse =
      await this.getProvider().queryContractSmart(this.contractAddress, {
        token_info: {},
      });
    return {
      ...tokenInfo,
      totalSupply: tokenInfo.total_supply,
    };
  }

  async populateApproveTx({
    weiAmountOrId,
    recipient,
  }: TransferParams): Promise<ExecuteInstruction> {
    // TODO: check existing allowance
    return {
      contractAddress: this.contractAddress,
      msg: {
        increase_allowance: {
          spender: recipient,
          amount: weiAmountOrId,
          expires: {
            never: {},
          },
        },
      },
    };
  }

  async populateTransferTx({
    weiAmountOrId,
    recipient,
  }: TransferParams): Promise<ExecuteInstruction> {
    return {
      contractAddress: this.contractAddress,
      msg: {
        transfer: {
          recipient,
          amount: weiAmountOrId.toString(),
        },
      },
    };
  }
}
