import { AgentConnectionType } from '@hyperlane-xyz/sdk';

import { Contexts } from '../../config/contexts';
import { KeyRole } from '../agents/roles';

import { DockerConfig } from './agent';

export interface ContextAndRoles {
  context: Contexts;
  roles: KeyRole[];
}

export type ContextAndRolesMap = Partial<Record<Contexts, KeyRole[]>>;

export interface KeyFunderConfig {
  docker: DockerConfig;
  cronSchedule: string;
  namespace: string;
  contextFundingFrom: Contexts;
  contextsAndRolesToFund: ContextAndRolesMap;
  cyclesBetweenEthereumMessages?: number;
  prometheusPushGateway: string;
  connectionType: AgentConnectionType.Http | AgentConnectionType.HttpQuorum;
}
