import fs from 'fs';
import path from 'path';

import {
  ChainMap,
  ChainName,
  MultisigConfig,
  defaultMultisigConfigs,
} from '@hyperlane-xyz/sdk';
import { Address, objMap } from '@hyperlane-xyz/utils';

import { Contexts } from '../../config/contexts';
import { helloworld } from '../../config/environments/helloworld';
import relayerAddresses from '../../config/relayer.json';
import { getJustHelloWorldConfig } from '../../scripts/helloworld/utils';
import {
  AgentContextConfig,
  DeployEnvironment,
  RootAgentConfig,
} from '../config';
import { Role } from '../roles';
import { fetchGCPSecret, setGCPSecret } from '../utils/gcloud';
import { execCmd, isEthereumProtocolChain } from '../utils/utils';

import { AgentAwsKey } from './aws/key';
import { AgentGCPKey } from './gcp';
import { CloudAgentKey } from './keys';

export interface KeyAsAddress {
  identifier: string;
  address: string;
}

// ==================
// Functions for getting keys
// ==================

// Returns a nested object of the shape:
// {
//   [chain]: {
//     [role]: keys[],
//   }
// }
//
// Note that some types of keys are used on multiple different chains
// and may be duplicated in the returned object. E.g. the deployer key
// or the relayer key, etc
export function getRoleKeysPerChain(
  agentConfig: RootAgentConfig,
): ChainMap<Record<Role, CloudAgentKey[]>> {
  return objMap(getRoleKeyMapPerChain(agentConfig), (_chain, roleKeys) => {
    return objMap(roleKeys, (_role, keys) => {
      return Object.values(keys);
    });
  });
}

// Returns a nested object of the shape:
// {
//   [chain]: {
//     [role]: {
//       // To guarantee no key duplicates, the key identifier is used as the key
//       [key identifier]: key
//     }
//   }
// }
function getRoleKeyMapPerChain(
  agentConfig: RootAgentConfig,
): ChainMap<Record<Role, Record<string, CloudAgentKey>>> {
  const keysPerChain: ChainMap<Record<Role, Record<string, CloudAgentKey>>> =
    {};

  const setValidatorKeys = () => {
    const validators = agentConfig.validators;
    for (const chainName of agentConfig.contextChainNames.validator) {
      let chainValidatorKeys = {};
      const validatorCount =
        validators?.chains[chainName]?.validators.length ?? 1;
      for (let index = 0; index < validatorCount; index++) {
        const { validator, chainSigner } = getValidatorKeysForChain(
          agentConfig,
          chainName,
          index,
        );
        chainValidatorKeys = {
          ...chainValidatorKeys,
          [validator.identifier]: validator,
          [chainSigner.identifier]: chainSigner,
        };
      }
      keysPerChain[chainName] = {
        ...keysPerChain[chainName],
        [Role.Validator]: chainValidatorKeys,
      };
    }
  };

  const setRelayerKeys = () => {
    for (const chainName of agentConfig.contextChainNames.relayer) {
      const relayerKey = getRelayerKeyForChain(agentConfig, chainName);
      keysPerChain[chainName] = {
        ...keysPerChain[chainName],
        [Role.Relayer]: {
          [relayerKey.identifier]: relayerKey,
        },
      };
    }
  };

  const setKathyKeys = () => {
    const helloWorldConfig = getJustHelloWorldConfig(
      helloworld[agentConfig.runEnv as 'mainnet3' | 'testnet4'], // test doesn't have hello world configs
      agentConfig.context,
    );
    // Kathy is only needed on chains where the hello world contracts are deployed.
    for (const chainName of Object.keys(helloWorldConfig.addresses)) {
      const kathyKey = getKathyKeyForChain(agentConfig, chainName);
      keysPerChain[chainName] = {
        ...keysPerChain[chainName],
        [Role.Kathy]: {
          [kathyKey.identifier]: kathyKey,
        },
      };
    }
  };

  const setDeployerKeys = () => {
    const deployerKey = getDeployerKey(agentConfig);
    // Default to using the relayer keys for the deployer keys
    for (const chainName of agentConfig.contextChainNames.relayer) {
      keysPerChain[chainName] = {
        ...keysPerChain[chainName],
        [Role.Deployer]: {
          [deployerKey.identifier]: deployerKey,
        },
      };
    }
  };

  for (const role of agentConfig.rolesWithKeys) {
    switch (role) {
      case Role.Validator:
        setValidatorKeys();
        break;
      case Role.Relayer:
        setRelayerKeys();
        break;
      case Role.Kathy:
        setKathyKeys();
        break;
      case Role.Deployer:
        setDeployerKeys();
        break;
      default:
        throw Error(`Unsupported role with keys ${role}`);
    }
  }

  return keysPerChain;
}

// Gets a big array of all keys.
export function getAllCloudAgentKeys(
  agentConfig: RootAgentConfig,
): Array<CloudAgentKey> {
  const keysPerChain = getRoleKeyMapPerChain(agentConfig);

  const keysByIdentifier = Object.keys(keysPerChain).reduce(
    (acc, chainName) => {
      const chainKeyRoles = keysPerChain[chainName];
      // All keys regardless of role
      const chainKeys = Object.keys(chainKeyRoles).reduce((acc, role) => {
        const roleKeys = chainKeyRoles[role as Role];
        return {
          ...acc,
          ...roleKeys,
        };
      }, {});

      return {
        ...acc,
        ...chainKeys,
      };
    },
    {},
  );

  return Object.values(keysByIdentifier);
}

// Gets a specific key. The chain name or index is required depending on the role.
// For this reason, using this function is only encouraged if the caller
// knows they want a specific key relating to a specific role.
export function getCloudAgentKey(
  agentConfig: AgentContextConfig,
  role: Role,
  chainName?: ChainName,
  index?: number,
): CloudAgentKey {
  switch (role) {
    case Role.Validator:
      if (chainName === undefined || index === undefined) {
        throw Error(`Must provide chainName and index for validator key`);
      }
      // For now just get the validator key, and not the chain signer.
      return getValidatorKeysForChain(agentConfig, chainName, index).validator;
    case Role.Relayer:
      if (chainName === undefined) {
        throw Error(`Must provide chainName for relayer key`);
      }
      return getRelayerKeyForChain(agentConfig, chainName);
    case Role.Kathy:
      if (chainName === undefined) {
        throw Error(`Must provide chainName for kathy key`);
      }
      return getKathyKeyForChain(agentConfig, chainName);
    case Role.Deployer:
      return getDeployerKey(agentConfig);
    default:
      throw Error(`Unsupported role ${role}`);
  }
}

// ==================
// Keys for specific roles
// ==================

// Gets the relayer key used for signing txs to the provided chain.
export function getRelayerKeyForChain(
  agentConfig: AgentContextConfig,
  chainName: ChainName,
): CloudAgentKey {
  // If AWS is enabled and the chain is an Ethereum-based chain, we want to use
  // an AWS key.
  if (agentConfig.aws && isEthereumProtocolChain(chainName)) {
    return new AgentAwsKey(agentConfig, Role.Relayer);
  }

  return new AgentGCPKey(agentConfig.runEnv, agentConfig.context, Role.Relayer);
}

// Gets the kathy key used for signing txs to the provided chain.
// Note this is basically a dupe of getRelayerKeyForChain, but to encourage
// consumers to be aware of what role they're using, and to keep the door open
// for future per-role deviations, we have separate functions.
export function getKathyKeyForChain(
  agentConfig: AgentContextConfig,
  chainName: ChainName,
): CloudAgentKey {
  // If AWS is enabled and the chain is an Ethereum-based chain, we want to use
  // an AWS key.
  if (agentConfig.aws && isEthereumProtocolChain(chainName)) {
    return new AgentAwsKey(agentConfig, Role.Kathy);
  }

  return new AgentGCPKey(agentConfig.runEnv, agentConfig.context, Role.Kathy);
}

// Returns the deployer key. This is always a GCP key, not chain specific,
// and in the Hyperlane context.
export function getDeployerKey(agentConfig: AgentContextConfig): CloudAgentKey {
  return new AgentGCPKey(agentConfig.runEnv, Contexts.Hyperlane, Role.Deployer);
}

// Returns the validator signer key and the chain signer key for the given validator for
// the given chain and index.
// The validator signer key is used to sign checkpoints and can be AWS regardless of the
// chain protocol type. The chain signer is dependent on the chain protocol type.
export function getValidatorKeysForChain(
  agentConfig: AgentContextConfig,
  chainName: ChainName,
  index: number,
): {
  validator: CloudAgentKey;
  chainSigner: CloudAgentKey;
} {
  const validator = agentConfig.aws
    ? new AgentAwsKey(agentConfig, Role.Validator, chainName, index)
    : new AgentGCPKey(
        agentConfig.runEnv,
        agentConfig.context,
        Role.Validator,
        chainName,
        index,
      );

  // If the chain is Ethereum-based, we can just use the validator key (even if it's AWS-based)
  // as the chain signer. Otherwise, we need to use a GCP key.
  const chainSigner = isEthereumProtocolChain(chainName)
    ? validator
    : new AgentGCPKey(
        agentConfig.runEnv,
        agentConfig.context,
        Role.Validator,
        chainName,
        index,
      );

  return {
    validator,
    chainSigner,
  };
}

// ==================
// Functions for managing keys
// ==================

export async function createAgentKeysIfNotExists(
  agentConfig: AgentContextConfig,
  newThresholds?: ChainMap<number>,
) {
  const keys = getAllCloudAgentKeys(agentConfig);

  await Promise.all(
    keys.map(async (key) => {
      return key.createIfNotExists();
    }),
  );

  // recent keys fetched from aws saved to sdk artifacts
  const multisigValidatorKeys: ChainMap<MultisigConfig> = {};
  let relayer: Address = '';

  for (const key of keys) {
    if (key.role === Role.Relayer) {
      relayer = key.address;
    }
    if (!key.chainName) continue;
    if (!multisigValidatorKeys[key.chainName]) {
      console.log(
        `for chain ${key.chainName} key is ${
          defaultMultisigConfigs[key.chainName].threshold
        }`,
      );
      multisigValidatorKeys[key.chainName] = {
        threshold:
          newThresholds?.[key.chainName] ??
          defaultMultisigConfigs[key.chainName].threshold ??
          1,
        validators: [],
      };
      console.log(
        'after change: ',
        multisigValidatorKeys[key.chainName].threshold,
      );
    }
    if (key.chainName)
      multisigValidatorKeys[key.chainName].validators.push(key.address);
  }
  await persistRelayerAddressesToSDKArtifacts(
    relayer,
    agentConfig.runEnv,
    agentConfig.context,
  );
  await persistValidatorAddressesToSDKArtifacts(multisigValidatorKeys);
  await persistAddressesToGcp(
    agentConfig.runEnv,
    agentConfig.context,
    keys.map((key) => key.serializeAsAddress()),
  );

  return;
}

export async function deleteAgentKeys(agentConfig: AgentContextConfig) {
  const keys = getAllCloudAgentKeys(agentConfig);
  await Promise.all(keys.map((key) => key.delete()));
  await execCmd(
    `gcloud secrets delete ${addressesIdentifier(
      agentConfig.runEnv,
      agentConfig.context,
    )} --quiet`,
  );
}

export async function rotateKey(
  agentConfig: AgentContextConfig,
  role: Role,
  chainName: ChainName,
) {
  const key = getCloudAgentKey(agentConfig, role, chainName);
  await key.update();
  const keyIdentifier = key.identifier;
  const addresses = await fetchGCPKeyAddresses(
    agentConfig.runEnv,
    agentConfig.context,
  );
  const filteredAddresses = addresses.filter((_) => {
    return _.identifier !== keyIdentifier;
  });

  filteredAddresses.push(key.serializeAsAddress());
  await persistAddressesToGcp(
    agentConfig.runEnv,
    agentConfig.context,
    filteredAddresses,
  );
}

async function persistAddressesToGcp(
  environment: DeployEnvironment,
  context: Contexts,
  keys: KeyAsAddress[],
) {
  await setGCPSecret(
    addressesIdentifier(environment, context),
    JSON.stringify(keys),
    {
      environment,
      context,
    },
  );
}

export async function persistRelayerAddressesToSDKArtifacts(
  fetchRelayerAddress: Address,
  environment: DeployEnvironment,
  context: Contexts,
) {
  relayerAddresses[environment][context] = fetchRelayerAddress;
  console.log('relayerAddresses===', JSON.stringify(relayerAddresses, null, 2));

  // Resolve the relative path
  const filePath = path.resolve(__dirname, '../../config/relayer.json');

  fs.writeFileSync(filePath, JSON.stringify(relayerAddresses, null, 2));
}

export async function persistValidatorAddressesToSDKArtifacts(
  fetchedValidatorAddresses: ChainMap<MultisigConfig>,
) {
  for (const chain of Object.keys(fetchedValidatorAddresses)) {
    defaultMultisigConfigs[chain] = {
      ...fetchedValidatorAddresses[chain], // fresh from aws
    };
  }

  // Resolve the relative path
  const filePath = path.resolve(
    __dirname,
    '../../../sdk/src/consts/multisigIsm.json',
  );

  // Write the updated object back to the file
  fs.writeFileSync(filePath, JSON.stringify(defaultMultisigConfigs, null, 2));
}

async function fetchGCPKeyAddresses(
  environment: DeployEnvironment,
  context: Contexts,
) {
  const addresses = await fetchGCPSecret(
    addressesIdentifier(environment, context),
  );
  return addresses as KeyAsAddress[];
}

function addressesIdentifier(
  environment: DeployEnvironment,
  context: Contexts,
) {
  return `${context}-${environment}-key-addresses`;
}
