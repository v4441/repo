import debug from 'debug';

import { TestRecipient, TestRecipient__factory } from '@hyperlane-xyz/core';
import { Address, eqAddress } from '@hyperlane-xyz/utils';

import { HyperlaneDeployer } from '../deploy/HyperlaneDeployer';
import { MultiProvider } from '../providers/MultiProvider';
import { ChainName } from '../types';

export type TestRecipientConfig = {
  interchainSecurityModule: Address;
};

export type TestRecipientContracts = {
  testRecipient: TestRecipient;
};

export type TestRecipientAddresses = {
  testRecipient: Address;
};

export const testRecipientFactories = {
  testRecipient: new TestRecipient__factory(),
};

// TODO move this and related configs to the SDK
export class TestRecipientDeployer extends HyperlaneDeployer<
  TestRecipientConfig,
  typeof testRecipientFactories
> {
  constructor(multiProvider: MultiProvider) {
    super(multiProvider, testRecipientFactories, {
      logger: debug('hyperlane:TestRecipientDeployer'),
    });
  }

  async deployContracts(
    chain: ChainName,
    config: TestRecipientConfig,
  ): Promise<TestRecipientContracts> {
    const testRecipient = await this.deployContract(
      chain,
      'testRecipient',
      [],
      undefined,
      false,
    );
    try {
      this.logger(`Checking ISM ${chain}`);
      const ism = await testRecipient.interchainSecurityModule();
      this.logger(`Found ISM for on ${chain}: ${ism}`);
      if (!eqAddress(ism, config.interchainSecurityModule)) {
        this.logger(
          `Current ISM does not match config. Updating to ${config.interchainSecurityModule}`,
        );
        const tx = testRecipient.setInterchainSecurityModule(
          config.interchainSecurityModule,
        );
        await this.runIfOwner(
          chain,
          testRecipient,
          async () => await this.multiProvider.handleTx(chain, tx),
        );
      }
    } catch (error) {
      this.logger(`Failed to check/update ISM for ${chain}: ${error}`);
      this.logger('Leaving ISM as is and continuing.');
    }
    return {
      testRecipient,
    };
  }
}
