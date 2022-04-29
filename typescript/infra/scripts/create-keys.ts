import { createAgentKeysIfNotExists } from '../src/agents/gcp';
import { getAgentConfig, getEnvironment } from './utils';

async function main() {
  const environment = await getEnvironment();
  const agentConfig = await getAgentConfig(environment);

  return createAgentKeysIfNotExists(agentConfig);
}

main().then(console.log).catch(console.error);
