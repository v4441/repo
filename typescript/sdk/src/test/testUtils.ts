import { BigNumber, ethers } from 'ethers';

import { Address, exclude, objMap } from '@hyperlane-xyz/utils';

import { chainMetadata } from '../consts/chainMetadata';
import { HyperlaneContractsMap } from '../contracts/types';
import { CoreFactories } from '../core/contracts';
import { CoreConfig } from '../core/types';
import { IgpFactories } from '../gas/contracts';
import {
  CoinGeckoInterface,
  CoinGeckoResponse,
  CoinGeckoSimpleInterface,
  CoinGeckoSimplePriceParams,
} from '../gas/token-prices';
import { IgpConfig } from '../gas/types';
import { HookType } from '../hook/types';
import { IsmType } from '../ism/types';
import { RouterConfig } from '../router/types';
import { ChainMap, ChainName } from '../types';

export function randomInt(max: number, min = 0): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

export function randomAddress(): Address {
  return ethers.utils.hexlify(ethers.utils.randomBytes(20));
}

export function createRouterConfigMap(
  owner: Address,
  coreContracts: HyperlaneContractsMap<CoreFactories>,
  igpContracts: HyperlaneContractsMap<IgpFactories>,
): ChainMap<RouterConfig> {
  return objMap(coreContracts, (chain, contracts) => {
    return {
      owner,
      mailbox: contracts.mailbox.address,
      interchainGasPaymaster:
        igpContracts[chain].interchainGasPaymaster.address,
    };
  });
}

const nonZeroAddress = ethers.constants.AddressZero.replace('00', '01');

// dummy config as TestInbox and TestOutbox do not use deployed ISM
export function testCoreConfig(
  chains: ChainName[],
  owner = nonZeroAddress,
): ChainMap<CoreConfig> {
  const chainConfig: CoreConfig = {
    owner,
    defaultIsm: {
      type: IsmType.TEST_ISM,
    },
    defaultHook: {
      type: HookType.MERKLE_TREE,
    },
    requiredHook: {
      type: HookType.PROTOCOL_FEE,
      maxProtocolFee: ethers.utils.parseUnits('1', 'gwei').toString(), // 1 gwei of native token
      protocolFee: BigNumber.from(1).toString(), // 1 wei
      beneficiary: nonZeroAddress,
      owner,
    },
  };

  return Object.fromEntries(chains.map((local) => [local, chainConfig]));
}

const TEST_ORACLE_CONFIG = {
  gasPrice: ethers.utils.parseUnits('1', 'gwei'),
  tokenExchangeRate: ethers.utils.parseUnits('1', 10),
};

export function testIgpConfig(
  chains: ChainName[],
  owner = nonZeroAddress,
): ChainMap<IgpConfig> {
  return Object.fromEntries(
    chains.map((local) => [
      local,
      {
        owner,
        ownerOverrides: {
          storageGasOracle: owner,
        },
        beneficiary: owner,
        // TODO: these should be one map
        overhead: Object.fromEntries(
          exclude(local, chains).map((remote) => [remote, 60000]),
        ),
        oracleConfig: Object.fromEntries(
          exclude(local, chains).map((remote) => [remote, TEST_ORACLE_CONFIG]),
        ),
      },
    ]),
  );
}

// A mock CoinGecko intended to be used by tests
export class MockCoinGecko implements CoinGeckoInterface {
  // Prices keyed by coingecko id
  private tokenPrices: Record<string, number>;
  // Whether or not to fail to return a response, keyed by coingecko id
  private fail: Record<string, boolean>;

  constructor() {
    this.tokenPrices = {};
    this.fail = {};
  }

  price(params: CoinGeckoSimplePriceParams): CoinGeckoResponse {
    const data: any = {};
    for (const id of params.ids) {
      if (this.fail[id]) {
        return Promise.reject(`Failed to fetch price for ${id}`);
      }
      data[id] = {
        usd: this.tokenPrices[id],
      };
    }
    return Promise.resolve({
      success: true,
      message: '',
      code: 200,
      data,
    });
  }

  get simple(): CoinGeckoSimpleInterface {
    return this;
  }

  setTokenPrice(chain: ChainName, price: number): void {
    const id = chainMetadata[chain].gasCurrencyCoinGeckoId || chain;
    this.tokenPrices[id] = price;
  }

  setFail(chain: ChainName, fail: boolean): void {
    const id = chainMetadata[chain].gasCurrencyCoinGeckoId || chain;
    this.fail[id] = fail;
  }
}
