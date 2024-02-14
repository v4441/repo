import { Address, Domain } from '@hyperlane-xyz/utils';

import { TokenAmount } from '../TokenAmount';
import { MinimalTokenMetadata } from '../config';

export interface TransferParams {
  weiAmountOrId: string | number | bigint;
  recipient: Address;

  // Solana-specific params
  // Included here optionally to keep Adapter types simple
  fromTokenAccount?: Address;
  fromAccountOwner?: Address;
}

export interface TransferRemoteParams extends TransferParams {
  destination: Domain;
  interchainGas?: TokenAmount;
}

export interface ITokenAdapter {
  getBalance(address: Address): Promise<bigint>;
  getMetadata(isNft?: boolean): Promise<MinimalTokenMetadata>;
  populateApproveTx(TransferParams: TransferParams): unknown | Promise<unknown>;
  populateTransferTx(
    TransferParams: TransferParams,
  ): unknown | Promise<unknown>;
}

export interface IHypTokenAdapter extends ITokenAdapter {
  getDomains(): Promise<Domain[]>;
  getRouterAddress(domain: Domain): Promise<Buffer>;
  getAllRouters(): Promise<Array<{ domain: Domain; address: Buffer }>>;
  quoteGasPayment(destination: Domain): Promise<bigint>;
  populateTransferRemoteTx(
    TransferParams: TransferRemoteParams,
  ): unknown | Promise<unknown>;
}
