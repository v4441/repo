import { AgentConnectionType } from '@hyperlane-xyz/sdk';

import {
  AgentConfig,
  GasPaymentEnforcementPolicyType,
} from '../../../src/config';
import { ALL_KEY_ROLES } from '../../../src/roles';
import { Contexts } from '../../contexts';

import { chainNames } from './chains';
import { validators } from './validators';

const hyperlane: AgentConfig = {
  namespace: 'test',
  runEnv: 'test',
  context: Contexts.Hyperlane,
  docker: {
    repo: 'gcr.io/abacus-labs-dev/hyperlane-agent',
    tag: '8852db3d88e87549269487da6da4ea5d67fdbfed',
  },
  environmentChainNames: chainNames,
  contextChainNames: chainNames,
  connectionType: AgentConnectionType.Http,
  validators,
  relayer: {
    gasPaymentEnforcement: [
      {
        type: GasPaymentEnforcementPolicyType.None,
      },
    ],
  },
  rolesWithKeys: ALL_KEY_ROLES,
};

export const agents = {
  [Contexts.Hyperlane]: hyperlane,
};
