import { ethers } from 'ethers';
import { CommandModule, Options } from 'yargs';

import { CommandModuleWithWriteContext } from '../context/types.js';
import { log } from '../logger.js';
import { sendTestMessage } from '../send/message.js';
import { sendTestTransfer } from '../send/transfer.js';

import { warpConfigOption } from './options.js';

/**
 * Parent command
 */
export const sendCommand: CommandModule = {
  command: 'send',
  describe: 'Send a test message or transfer',
  builder: (yargs) =>
    yargs
      .command(messageCommand)
      .command(transferCommand)
      .version(false)
      .demandCommand(),
  handler: () => log('Command required'),
};

/**
 * Message command
 */
export const messageOptions: { [k: string]: Options } = {
  origin: {
    type: 'string',
    description: 'Origin chain to send message from',
  },
  destination: {
    type: 'string',
    description: 'Destination chain to send message to',
  },
  timeout: {
    type: 'number',
    description: 'Timeout in seconds',
    default: 5 * 60,
  },
  quick: {
    type: 'boolean',
    description: 'Skip wait for message to be delivered',
    default: false,
  },
  relay: {
    type: 'boolean',
    description: 'Handle self-relay of message on destination chain',
    default: false,
  },
};

export interface MessageOptionsArgTypes {
  origin?: string;
  destination?: string;
  timeout: number;
  quick: boolean;
  relay: boolean;
}

const messageCommand: CommandModuleWithWriteContext<
  MessageOptionsArgTypes & { body: string }
> = {
  command: 'message',
  describe: 'Send a test message to a remote chain',
  builder: {
    ...messageOptions,
    body: {
      type: 'string',
      description: 'Optional Message body',
      default: 'Hello!',
    },
  },
  handler: async ({
    context,
    origin,
    destination,
    timeout,
    quick,
    relay,
    body,
  }) => {
    await sendTestMessage({
      context,
      origin,
      destination,
      messageBody: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(body)),
      timeoutSec: timeout,
      skipWaitForDelivery: quick,
      selfRelay: relay,
    });
    process.exit(0);
  },
};

/**
 * Transfer command
 */
const transferCommand: CommandModuleWithWriteContext<
  MessageOptionsArgTypes & {
    warp: string;
    router?: string;
    wei: string;
    recipient?: string;
  }
> = {
  command: 'transfer',
  describe: 'Send a test token transfer on a warp route',
  builder: {
    ...messageOptions,
    warp: warpConfigOption,
    wei: {
      type: 'string',
      description: 'Amount in wei to send',
      default: 1,
    },
    recipient: {
      type: 'string',
      description: 'Token recipient address (defaults to sender)',
    },
  },
  handler: async ({
    context,
    origin,
    destination,
    timeout,
    quick,
    relay,
    warp,
    wei,
    recipient,
  }) => {
    await sendTestTransfer({
      context,
      warpConfigPath: warp,
      origin,
      destination,
      wei,
      recipient,
      timeoutSec: timeout,
      skipWaitForDelivery: quick,
      selfRelay: relay,
    });
    process.exit(0);
  },
};
