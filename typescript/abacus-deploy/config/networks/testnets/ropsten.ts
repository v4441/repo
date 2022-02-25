import { BigNumber } from 'ethers';
import { getSecretRpcEndpoint } from '../../../src/agents';
import {
  ChainName,
  ChainConfig,
  ChainConfigJson,
} from '../../../src/config/chain';
import { fetchGCPSecret } from '../../../src/utils/gcloud';

export async function getChain(environment: string, deployerKeySecretName: string) {
  const name = ChainName.ROPSTEN;
  const chainJson: ChainConfigJson = {
    name,
    rpc: await getSecretRpcEndpoint(environment, name),
    deployerKey: await fetchGCPSecret(deployerKeySecretName, false),
    domain: 3,
    confirmations: 3,
    gasPrice: BigNumber.from(10_000_000_000),
    weth: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
  };
  return new ChainConfig(chainJson);
}
