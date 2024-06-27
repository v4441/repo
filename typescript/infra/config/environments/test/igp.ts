import {
  ChainMap,
  HookType,
  IgpConfig,
  TestChainName,
  multisigIsmVerificationCost,
} from '@hyperlane-xyz/sdk';
import { Address, exclude, objMap } from '@hyperlane-xyz/utils';

import { testChainNames } from './chains.js';
import { multisigIsm } from './multisigIsm.js';
import { owners } from './owners.js';

export const igp: ChainMap<IgpConfig> = objMap(
  owners,
  (chain, ownerConfig): IgpConfig => {
    const overhead = Object.fromEntries(
      exclude(chain, testChainNames)
        .filter((chain) => chain !== TestChainName.test4)
        .map((remote) => [
          remote,
          multisigIsmVerificationCost(
            multisigIsm[remote].threshold,
            multisigIsm[remote].validators.length,
          ),
        ]),
    );
    return {
      type: HookType.INTERCHAIN_GAS_PAYMASTER,
      oracleKey: ownerConfig.owner as Address, // owner can be AccountConfig
      beneficiary: ownerConfig.owner as Address, // same as above
      overhead,
      oracleConfig: {},
      ...ownerConfig,
    };
  },
);
