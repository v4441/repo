import { CommandModule, Options } from 'yargs';

import { createAgentConfig } from '../config/agent.js';
import { CommandModuleWithContext } from '../context/types.js';
import { log, logBlue, logGray, logRed, logTable } from '../logger.js';

import { outputFileCommandOption } from './options.js';

export const ChainTypes = ['mainnet', 'testnet'];
export type ChainType = (typeof ChainTypes)[number];

/**
 * Parent command
 */
export const registryCommand: CommandModule = {
  command: 'registry',
  describe: 'View information about Hyperlane chains in a registry',
  builder: (yargs) =>
    yargs
      .command(listCommand)
      .command(addressesCommand)
      .command(createAgentConfigCommand)
      .version(false)
      .demandCommand(),
  handler: () => log('Command required'),
};

/**
 * List command
 */
const listCommand: CommandModuleWithContext<{ type: ChainType }> = {
  command: 'list',
  describe: 'List all chains included in a registry',
  builder: {
    type: {
      describe: 'Specify the type of chains',
      choices: ChainTypes,
    },
  },
  handler: async ({ type, context }) => {
    const logChainsForType = (type: ChainType) => {
      logBlue(`\nHyperlane ${type} chains:`);
      logGray('------------------------------');
      const chains = Object.values(context.chainMetadata).filter((c) => {
        if (type === 'mainnet') return !c.isTestnet;
        else return !!c.isTestnet;
      });
      const tableData = chains.reduce<any>((result, chain) => {
        const { chainId, displayName } = chain;
        result[chain.name] = {
          'Display Name': displayName,
          'Chain Id': chainId,
        };
        return result;
      }, {});
      logTable(tableData);
    };

    if (type) {
      logChainsForType(type);
    } else {
      logChainsForType('mainnet');
      logChainsForType('testnet');
    }
  },
};

/**
 * Addresses command
 */
const addressesCommand: CommandModuleWithContext<{ name: string }> = {
  command: 'addresses',
  describe: 'Display the addresses of core Hyperlane contracts',
  builder: {
    name: {
      type: 'string',
      description: 'Chain to display addresses for',
      alias: 'chain',
    },
  },
  handler: async ({ name, context }) => {
    if (name) {
      const result = await context.registry.getChainAddresses(name);
      logBlue('Hyperlane contract addresses for:', name);
      logGray('---------------------------------');
      log(JSON.stringify(result, null, 2));
    } else {
      const result = await context.registry.getAddresses();
      logBlue('Hyperlane contract addresses:');
      logGray('----------------------------------');
      log(JSON.stringify(result, null, 2));
    }
  },
};

const chainTargetsCommandOption: Options = {
  type: 'string',
  description: 'Comma-separated list of chain names',
  alias: 'c',
  // TODO choices: ... can we configure this so that it's a list of chain names including any new chains added to the local registry
};

const environmentCommandOption: Options = {
  type: 'string',
  description: 'The name of the environment to deploy to',
  alias: 'e',
  choices: ChainTypes,
};

const createAgentConfigCommand: CommandModuleWithContext<{
  chains?: string;
  environment?: string;
  out: string;
}> = {
  command: 'agent-config',
  describe: 'Create a new agent config',
  builder: {
    chains: chainTargetsCommandOption,
    environment: environmentCommandOption,
    out: outputFileCommandOption(
      './configs/agent-config.json',
      false,
      'The path to output an agent config JSON file.',
    ),
  },
  // TODO: make chains and environment mutually exclusive, but require one of them
  // builder: (yargs: Argv<{}>) =>
  //   yargs
  //     .option('chains', chainTargetsCommandOption)
  //     .option('environment', environmentCommandOption)
  //     .option(
  //       'config',
  //       outputFileCommandOption(
  //         './configs/agent-config.json',
  //         false,
  //         'The path to output an agent config JSON file.',
  //       ),
  //     )
  //     .check((argv) => {
  //       if (!argv.chains && !argv.environment) {
  //         throw new Error(
  //           'Either --chains or --environment must be specified.',
  //         );
  //       }
  //       return true;
  //     })
  //     .check((argv) => {
  //       if (argv.chains && argv.environment) {
  //         throw new Error(
  //           '--chains and --environment cannot be specified together.',
  //         );
  //       }
  //       return true;
  //     }),
  handler: async ({ context, chains, environment, out }) => {
    const { registry } = context;

    let chainNames;
    if (chains) {
      chainNames = chains.split(',');
      const validChainNames = await registry.getChains();

      const invalidChainNames = chainNames.filter(
        (chainName) => !validChainNames.includes(chainName),
      );
      if (invalidChainNames.length > 0) {
        logRed(
          `Invalid chain names: ${invalidChainNames
            .join(', ')
            .replace(/, $/, '')}`,
        );
        process.exit(1);
      }
    }

    await createAgentConfig({ context, chains: chainNames, environment, out });
    process.exit(0);
  },
};
