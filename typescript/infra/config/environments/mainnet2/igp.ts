import {
  ChainMap,
  GasOracleContractType,
  IgpConfig,
  defaultMultisigIsmConfigs,
  multisigIsmVerificationCost,
} from '@hyperlane-xyz/sdk';
import { exclude, objMap } from '@hyperlane-xyz/utils';

import { MainnetChains, supportedChainNames } from './chains';
import { owners } from './owners';

// TODO: make this generic
const KEY_FUNDER_ADDRESS = '0xa7ECcdb9Be08178f896c26b7BbD8C3D4E844d9Ba';
const DEPLOYER_ADDRESS = '0xa7ECcdb9Be08178f896c26b7BbD8C3D4E844d9Ba';

function getGasOracles(local: MainnetChains) {
  return Object.fromEntries(
    exclude(local, supportedChainNames).map((name) => [
      name,
      GasOracleContractType.StorageGasOracle,
    ]),
  );
}

export const igp: ChainMap<IgpConfig> = objMap(owners, (chain, owner) => {
  const overhead = Object.fromEntries(
    exclude(chain, supportedChainNames).map((remote) => [
      remote,
      multisigIsmVerificationCost(
        defaultMultisigIsmConfigs[remote].threshold,
        defaultMultisigIsmConfigs[remote].validators.length,
      ),
    ]),
  );

  return {
    owner,
    oracleKey: DEPLOYER_ADDRESS,
    beneficiary: KEY_FUNDER_ADDRESS,
    gasOracleType: getGasOracles(chain),
    overhead,
  };
});
