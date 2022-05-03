import '@nomiclabs/hardhat-waffle';
import { ethers } from 'hardhat';
import path from 'path';

import { AbacusGovernance } from '@abacus-network/sdk';
import { types } from '@abacus-network/utils';

import {
  governance as governanceConfig,
  registerMultiProviderTest,
} from '../config/environments/test';
import {
  AbacusGovernanceChecker,
  AbacusGovernanceDeployer,
} from '../src/governance';

describe('governance', async () => {
  const deployer = new AbacusGovernanceDeployer();
  const owners: Record<types.Domain, types.Address> = {};

  before(async () => {
    const [signer] = await ethers.getSigners();
    registerMultiProviderTest(deployer, signer);

    deployer.domainNumbers.map((domain) => {
      const name = deployer.mustResolveDomainName(domain);
      const addresses = governanceConfig.addresses[name];
      if (!addresses) throw new Error('could not find addresses');
      const owner = addresses.governor;
      owners[domain] = owner ? owner : ethers.constants.AddressZero;
    });

    // abacusConnectionManager can be set to anything for these tests.
    if (!governanceConfig.abacusConnectionManager) {
      governanceConfig.abacusConnectionManager = {};
      deployer.domainNames.map((name) => {
        governanceConfig.abacusConnectionManager![name] = signer.address;
      });
    }
  });

  it('deploys', async () => {
    await deployer.deploy(governanceConfig);
  });

  it('writes', async () => {
    const base = './test/outputs/governance';
    deployer.writeVerification(path.join(base, 'verification'));
    deployer.writeContracts(path.join(base, 'contracts.ts'));
  });

  it('checks', async () => {
    const governance = new AbacusGovernance(deployer.addressesRecord);
    const [signer] = await ethers.getSigners();
    registerMultiProviderTest(governance, signer);

    const checker = new AbacusGovernanceChecker(governance, governanceConfig);
    await checker.check(owners);
  });
});
