import {
  AgentConnection,
  AgentConnectionType,
  ChainMap,
  ChainName,
} from '@hyperlane-xyz/sdk';
import { utils } from '@hyperlane-xyz/utils';

import { Contexts } from '../../config/contexts';
import { AgentConfig, DeployEnvironment } from '../config';
import {
  CheckpointSyncerType,
  KeyConfig,
  RelayerConfigHelper,
  ScraperConfigHelper,
  ValidatorConfigHelper,
} from '../config/agent';
import { fetchGCPSecret } from '../utils/gcloud';
import {
  HelmCommand,
  buildHelmChartDependencies,
  helmifyValues,
} from '../utils/helm';
import { execCmd } from '../utils/utils';

import { keyIdentifier } from './agent';
import { AgentAwsUser, ValidatorAgentAwsUser } from './aws';
import { AgentAwsKey } from './aws/key';
import { AgentGCPKey } from './gcp';
import { fetchKeysForChain } from './key-utils';
import { ALL_AGENT_ROLES, KEY_ROLE_ENUM } from './roles';

const HELM_CHART_PATH = '../../rust/helm/hyperlane-agent/';
/** Roles which do not need deployments per chain */
const OMNISCIENT_ROLES = [KEY_ROLE_ENUM.Relayer, KEY_ROLE_ENUM.Scraper];

export async function runAgentHelmCommandsForRoles(
  action: HelmCommand,
  agentConfig: AgentConfig,
  roles: KEY_ROLE_ENUM[],
  originChainNames: ChainName[] = [],
): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const role of roles) {
    if (!ALL_AGENT_ROLES.includes(role)) {
      console.warn(`Skipping unknown agent role ${role}`);
      continue;
    }

    if (OMNISCIENT_ROLES.includes(role)) {
      promises.push(runAgentHelmCommand(action, agentConfig, role));
      continue;
    }

    for (const chainName of originChainNames) {
      promises.push(runAgentHelmCommand(action, agentConfig, role, chainName));
    }
  }
  await Promise.all(promises);
}

async function runAgentHelmCommand(
  action: HelmCommand,
  agentConfig: AgentConfig,
  role: KEY_ROLE_ENUM,
  originChainName?: ChainName,
): Promise<void> {
  const helmReleaseName = getHelmReleaseName(agentConfig, originChainName);
  const namespace = `--namespace ${agentConfig.namespace}`;

  if (action === HelmCommand.Remove) {
    const cmd = ['helm', action, helmReleaseName, namespace];
    await execCmd(cmd.join(' '), {}, false, true);
    return;
  }

  const valueDict = await helmValuesForAgent(
    agentConfig,
    role,
    originChainName,
  );
  const values = helmifyValues(valueDict);

  if (action === HelmCommand.InstallOrUpgrade) {
    // Delete secrets to avoid them being stale
    const cmd = [
      'kubectl',
      'delete',
      'secrets',
      namespace,
      '--selector',
      `app.kubernetes.io/instance=${helmReleaseName}`,
    ];
    try {
      await execCmd(cmd.join(' '), {}, false, false);
    } catch (e) {
      console.error(e);
    }
  }

  // Build the chart dependencies
  await buildHelmChartDependencies(HELM_CHART_PATH);

  const cmd = [
    'helm',
    action,
    helmReleaseName,
    HELM_CHART_PATH,
    '--create-namespace',
    namespace,
    ...values,
  ];
  if (action === HelmCommand.UpgradeDiff) {
    cmd.push(
      `| kubectl diff ${namespace} --field-manager="Go-http-client" -f - || true`,
    );
  }
  await execCmd(cmd.join(' '), {}, false, true);
}

export async function getAgentEnvVars(
  agentConfig: AgentConfig,
  role: KEY_ROLE_ENUM,
  originChainName: ChainName,
  index?: number,
) {
  const chainNames = agentConfig.contextChainNames;
  if (role === KEY_ROLE_ENUM.Validator && index === undefined) {
    throw Error('Expected index for validator role');
  }

  const valueDict = await helmValuesForAgent(
    agentConfig,
    role,
    originChainName,
  );
  let envVars: string[] = [];
  // // TODO: Where are we setting the urls for the fallback/quorum providers?
  // const rpcEndpoints = await getSecretRpcEndpoints(agentConfig);
  // for (const chain of valueDict.hyperlane.chains) {
  //   const name = chain.name.toUpperCase();
  //   const url = rpcEndpoints[chain.name];
  //   envVars.push(`HYP_BASE_CHAINS_${name}_CONNECTION_URL=${url}`);
  // }

  // Base vars from config map
  envVars.push(`HYP_BASE_METRICS=9090`);
  envVars.push(`HYP_BASE_TRACING_LEVEL=info`);
  envVars.push(
    `HYP_BASE_DB=/tmp/${agentConfig.runEnv}-${role}-${originChainName}${
      role === KEY_ROLE_ENUM.Validator ? `-${index}` : ''
    }-db`,
  );

  // GCP keys
  if (!agentConfig.aws) {
    const gcpKeys = (await fetchKeysForChain(
      agentConfig,
      originChainName,
    )) as Record<string, AgentGCPKey>;

    const keyId = keyIdentifier(
      agentConfig.runEnv,
      agentConfig.context,
      role,
      originChainName,
      index,
    );

    // Only the relayer needs to sign txs
    if (role === KEY_ROLE_ENUM.Relayer) {
      chainNames.forEach((name) => {
        envVars.push(
          `HYP_BASE_CHAINS_${name.toUpperCase()}_SIGNER_KEY=${utils.strip0x(
            gcpKeys[keyId].privateKey,
          )}`,
        );
        envVars.push(
          `HYP_BASE_CHAINS_${name.toUpperCase()}_SIGNER_TYPE=hexKey`,
        );
      });
    } else if (role === KEY_ROLE_ENUM.Validator) {
      const privateKey = gcpKeys[keyId].privateKey;

      envVars.push(
        `HYP_BASE_VALIDATOR_KEY=${utils.strip0x(privateKey)}`,
        `HYP_BASE_VALIDATOR_TYPE=hexKey`,
      );
    }
  } else {
    // AWS keys

    let user: AgentAwsUser;

    if (role === KEY_ROLE_ENUM.Validator && agentConfig.validators) {
      const checkpointSyncer =
        agentConfig.validators[originChainName].validators[index!]
          .checkpointSyncer;
      if (checkpointSyncer.type !== CheckpointSyncerType.S3) {
        throw Error(
          'Expected S3 checkpoint syncer for validator with AWS keys',
        );
      }
      user = new ValidatorAgentAwsUser(
        agentConfig.runEnv,
        agentConfig.context,
        originChainName,
        index!,
        checkpointSyncer.region,
        checkpointSyncer.bucket,
      );
    } else {
      user = new AgentAwsUser(
        agentConfig.runEnv,
        agentConfig.context,
        role,
        agentConfig.aws!.region,
        originChainName,
      );
    }

    const accessKeys = await user.getAccessKeys();

    envVars.push(`AWS_ACCESS_KEY_ID=${accessKeys.accessKeyId}`);
    envVars.push(`AWS_SECRET_ACCESS_KEY=${accessKeys.secretAccessKey}`);

    // Only the relayer needs to sign txs
    if (role === KEY_ROLE_ENUM.Relayer) {
      chainNames.forEach((chainName) => {
        const key = new AgentAwsKey(agentConfig, role, originChainName);
        envVars = envVars.concat(
          configEnvVars(
            key.keyConfig,
            `CHAINS_${chainName.toUpperCase()}_SIGNER_`,
          ),
        );
      });
    }
  }

  let configToSerialize: any;
  switch (role) {
    case KEY_ROLE_ENUM.Validator:
      configToSerialize = valueDict.hyperlane.validator.configs[index!];
      break;
    case KEY_ROLE_ENUM.Relayer:
      configToSerialize = valueDict.hyperlane.relayer.config;
      break;
    case KEY_ROLE_ENUM.Scraper:
      configToSerialize = valueDict.hyperlane.scraper.config;
      break;
    default:
  }
  if (configToSerialize) {
    envVars.concat(configEnvVars(configToSerialize));
  }

  // switch (role) {
  //   case KEY_ROLE_ENUM.Validator:
  //     if (valueDict.hyperlane.validator.configs) {
  //       envVars = envVars.concat(
  //         configEnvVars(
  //           valueDict.hyperlane.validator.configs[index!],
  //           KEY_ROLE_ENUM.Validator,
  //         ),
  //       );
  //     }
  //     break;
  //   case KEY_ROLE_ENUM.Relayer:
  //     if (valueDict.hyperlane.relayer.config) {
  //       envVars = envVars.concat(
  //         configEnvVars(
  //           valueDict.hyperlane.relayer.config,
  //           KEY_ROLE_ENUM.Relayer,
  //         ),
  //       );
  //     }
  //     break;
  // }

  return envVars;
}

export async function getSecretAwsCredentials(agentConfig: AgentConfig) {
  return {
    accessKeyId: await fetchGCPSecret(
      `${agentConfig.runEnv}-aws-access-key-id`,
      false,
    ),
    secretAccessKey: await fetchGCPSecret(
      `${agentConfig.runEnv}-aws-secret-access-key`,
      false,
    ),
  };
}

export async function getSecretRpcEndpoint(
  environment: string,
  chainName: ChainName,
  quorum = false,
): Promise<string[]> {
  const secret = await fetchGCPSecret(
    `${environment}-rpc-endpoint${quorum ? 's' : ''}-${chainName}`,
    quorum,
  );
  if (typeof secret != 'string' && !Array.isArray(secret)) {
    throw Error(`Expected secret for ${chainName} rpc endpoint`);
  }
  if (!Array.isArray(secret)) {
    return [secret];
  }

  secret.forEach((i) => {
    if (typeof i != 'string')
      throw new Error(`Expected string in rpc endpoint array for ${chainName}`);
  });

  return secret as string[];
}

export async function getSecretDeployerKey(
  environment: DeployEnvironment,
  context: Contexts,
  chainName: ChainName,
) {
  const key = new AgentGCPKey(
    environment,
    context,
    KEY_ROLE_ENUM.Deployer,
    chainName,
  );
  await key.fetch();
  return key.privateKey;
}

export async function doesAgentReleaseExist(
  agentConfig: AgentConfig,
  originChainName: ChainName,
) {
  try {
    await execCmd(
      `helm status ${getHelmReleaseName(
        agentConfig,
        originChainName,
      )} --namespace ${agentConfig.namespace}`,
      {},
      false,
      false,
    );
    return true;
  } catch (error) {
    return false;
  }
}

async function helmValuesForAgent(
  agentConfig: AgentConfig,
  role: KEY_ROLE_ENUM,
  chainName?: ChainName,
) {
  // // TODO: This can't be in use because it would break when fallback is used, so where are we actually getting the values from?
  // // By default, if a context only enables a subset of chains, the
  // // connection url (or urls, when HttpQuorum is used) are not fetched
  // // from GCP secret manager. For Http/Ws, the `url` param is expected,
  // // which is set by default to "" in the agent json configs. For HttpQuorum,
  // // no default is present in those configs, so we make sure to pass in urls
  // // as "" to avoid startup configuration issues.
  // let baseConnectionConfig: Record<string, string> = {
  //   type: agentConfig.connectionType,
  // };
  // if (baseConnectionConfig.type == AgentConnectionType.HttpQuorum) {
  //   baseConnectionConfig = {
  //     ...baseConnectionConfig,
  //     urls: '',
  //   };
  // } else {
  //   baseConnectionConfig = {
  //     ...baseConnectionConfig,
  //     url: '',
  //   };
  // }

  let validator: Record<string, unknown> = { enabled: false };
  if (role == KEY_ROLE_ENUM.Validator) {
    if (!chainName) {
      throw new Error('chainName is required for validator configs');
    }
    const validatorHelper = new ValidatorConfigHelper(agentConfig, chainName);
    if (!validatorHelper.isDefined) {
      throw new Error(
        `Validator config is not enabled for ${chainName} validator`,
      );
    }
    validator = {
      enabled: true,
      configs: await validatorHelper.buildConfig(),
    };
  }

  let relayer: Record<string, unknown> = { enabled: false };
  let relayerChains: Array<{ name: string; signer: KeyConfig }> = [];
  if (role == KEY_ROLE_ENUM.Relayer) {
    const relayerHelper = new RelayerConfigHelper(agentConfig);
    if (!relayerHelper.isDefined) {
      throw new Error(`Relayer config is not enabled`);
    }
    relayer = {
      enabled: true,
      // TODO: merge this aws true/false with the one in the root of the config (hyperlane.aws)
      aws: relayerHelper.requiresAwsCredentials,
      config: await relayerHelper.buildConfig(),
    };
    const signers = await relayerHelper.signers();
    relayerChains = agentConfig.environmentChainNames.map((envChainName) => ({
      name: envChainName,
      signer: signers[envChainName],
    }));
  }

  let scraper: Record<string, unknown> = { enabled: false };
  if (role == KEY_ROLE_ENUM.Scraper) {
    const scraperHelper = new ScraperConfigHelper(agentConfig);
    if (!scraperHelper.isDefined) {
      throw new Error(`Scraper config is not enabled`);
    }
    scraper = {
      enabled: true,
      config: await scraperHelper.buildConfig(),
    };
  }

  return {
    image: {
      repository: agentConfig.docker.repo,
      tag: agentConfig.docker.tag,
    },
    hyperlane: {
      runEnv: agentConfig.runEnv,
      context: agentConfig.context,
      aws: !!agentConfig.aws,
      chains: agentConfig.environmentChainNames.map((envChainName) => ({
        name: envChainName,
        disabled: !agentConfig.contextChainNames.includes(envChainName),
        connection: { type: agentConfig.connectionType },
      })),
      // Only the relayer has the signers on the chains config object
      // TODO: why is this not under the "relayer" object?
      relayerChains,
      scraper,
      validator,
      relayer,
    },
  };
}

// Recursively converts a config object into environment variables than can
// be parsed by rust. For example, a config of { foo: { bar: { baz: 420 }, boo: 421 } } will
// be: HYP_FOO_BAR_BAZ=420 and HYP_FOO_BOO=421
function configEnvVars(config: Record<string, any>, key_name_prefix = '') {
  let envVars: string[] = [];
  for (const key of Object.keys(config)) {
    const value = config[key];
    if (typeof value === 'object') {
      envVars = [
        ...envVars,
        ...configEnvVars(value, `${key_name_prefix}${key.toUpperCase()}_`),
      ];
    } else {
      envVars.push(
        `HYP_BASE_${key_name_prefix}${key.toUpperCase()}=${config[key]}`,
      );
    }
  }
  return envVars;
}

// async function getSecretRpcEndpoints(agentConfig: AgentConfig, quorum = false): Promise<ChainMap<string>> {
//   const environment = agentConfig.runEnv;
//   return Object.fromEntries(await Promise.all(
//     agentConfig.contextChainNames.map(async (chainName) => [
//       chainName,
//       await getSecretRpcEndpoint(environment, chainName, quorum),
//     ]),
//   ));
// }

function getHelmReleaseName(
  agentConfig: AgentConfig,
  originChainName?: ChainName,
): string {
  // For backward compatibility reasons, don't include the context
  // in the name of the helm release if the context is the default "hyperlane"

  const nameParts = [originChainName ?? 'omniscient'];
  if (agentConfig.context !== 'hyperlane') {
    nameParts.push(agentConfig.context);
  }
  return nameParts.join('-');
}

export async function getCurrentKubernetesContext(): Promise<string> {
  const [stdout] = await execCmd(
    `kubectl config current-context`,
    { encoding: 'utf8' },
    false,
    false,
  );
  return stdout.trimEnd();
}
