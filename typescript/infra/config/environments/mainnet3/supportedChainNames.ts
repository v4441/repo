// These chains may be any protocol type.
// Placing them here instead of adjacent chains file to avoid circular dep
export const mainnet3SupportedChainNames = [
  'arbitrum',
  'ancient8',
  'avalanche',
  'base',
  'blast',
  'bob',
  'bsc',
  'celo',
  'cheesechain',
  'eclipse',
  'endurance',
  'ethereum',
  'fraxtal',
  'fusemainnet',
  'gnosis',
  'inevm',
  'injective',
  'linea',
  'mantapacific',
  'mantle',
  'mode',
  'moonbeam',
  'neutron',
  'optimism',
  'osmosis',
  'polygon',
  'polygonzkevm',
  'redstone',
  'scroll',
  'sei',
  'solana',
  'taiko',
  'viction',
  'worldchain',
  'xlayer',
  'zetachain',
  'zircuit',
  'zoramainnet',
] as const;

export const supportedChainNames = [...mainnet3SupportedChainNames];
