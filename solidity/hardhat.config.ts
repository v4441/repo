import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'solidity-coverage';

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.21',
      },
      {
        // for @eth-optimism
        version: '0.8.15',
      },
    ],
    settings: {
      optimizer: {
        enabled: true,
        runs: 999_999,
      },
    },
  },
  gasReporter: {
    currency: 'USD',
  },
  typechain: {
    outDir: './types',
    target: 'ethers-v5',
    alwaysGenerateOverloads: false,
  },
  mocha: {
    bail: true,
  },
};
