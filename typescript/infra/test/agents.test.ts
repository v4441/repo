import { expect } from 'chai';

import { Contexts } from '../config/contexts';
import { AgentAwsKey } from '../src/agents/aws';
import { AgentGCPKey } from '../src/agents/gcp';
import { ReadOnlyCloudAgentKey } from '../src/agents/keys';
import { KeyRole } from '../src/agents/roles';

describe('ReadOnlyCloudAgentKey', () => {
  describe('fromSerializedAddress', () => {
    it('correctly parses identifiers', () => {
      const addressZero = '0x0000000000000000000000000000000000000000';
      const environment = 'test';
      const context = Contexts.Hyperlane;
      const chainName = 'test1';
      // Enough to satisfy the constructor of AgentAwsKey
      const mockAgentConfig: any = {
        aws: {
          region: 'us-east-1',
        },
        runEnv: environment,
        context,
      };

      // AWS and GCP agent keys to get the identifiers from
      // and ensure they can be correctly parsed
      const testKeys = [
        new AgentGCPKey(environment, context, KeyRole.Deployer),
        new AgentGCPKey(environment, context, KeyRole.Relayer, chainName),
        new AgentGCPKey(environment, context, KeyRole.Validator, chainName, 0),
        new AgentAwsKey(mockAgentConfig, KeyRole.Deployer),
        new AgentAwsKey(mockAgentConfig, KeyRole.Relayer, chainName),
        new AgentAwsKey(mockAgentConfig, KeyRole.Validator, chainName, 0),
      ];

      for (const testKey of testKeys) {
        const identifier = testKey.identifier;

        const readOnly = ReadOnlyCloudAgentKey.fromSerializedAddress(
          identifier,
          addressZero,
        );

        expect(readOnly.environment).to.eq(testKey.environment);
        expect(readOnly.context).to.eq(testKey.context);
        expect(readOnly.role).to.eq(testKey.role);
        expect(readOnly.chainName).to.eq(testKey.chainName);
        expect(readOnly.index).to.eq(testKey.index);
      }
    });
  });
});
