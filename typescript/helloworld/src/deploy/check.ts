import { AbacusRouterChecker, ChainName } from '@hyperlane-xyz/sdk';

import { HelloWorldApp } from '../app/app';
import { HelloWorldContracts } from '../app/contracts';

import { HelloWorldConfig } from './config';

export class HelloWorldChecker<
  Chain extends ChainName,
> extends AbacusRouterChecker<
  Chain,
  HelloWorldApp<Chain>,
  HelloWorldConfig,
  HelloWorldContracts
> {}
