import {
  ChainMap,
  RouterConfig,
  TokenRouterConfig,
  TokenType,
} from '@hyperlane-xyz/sdk';

export const getInevmInjectiveINJWarpConfig = async (
  routerConfig: ChainMap<RouterConfig>,
): Promise<ChainMap<TokenRouterConfig>> => {
  const injectiveRouter = 'inj1mv9tjvkaw7x8w8y9vds8pkfq46g2vcfkjehc6k';
  const injective: TokenRouterConfig = {
    ...routerConfig.injective,
    type: TokenType.native,
    foreignDeployment: injectiveRouter,
  };

  const inevm: TokenRouterConfig = {
    ...routerConfig.inevm,
    type: TokenType.native,
  };

  return {
    injective,
    inevm,
  };
};
