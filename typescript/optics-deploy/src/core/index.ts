import * as ethers from 'ethers';
import { assert } from 'console';
import fs from 'fs';

import * as proxyUtils from '../proxyUtils';
import { CoreDeploy } from './CoreDeploy';
import * as contracts from 'optics-ts-interface/dist/optics-core';
import { CoreInvariantChecker } from './checks';
import { log, warn, toBytes32 } from '../utils';

export async function deployUpgradeBeaconController(deploy: CoreDeploy) {
  let factory = new contracts.UpgradeBeaconController__factory(deploy.signer);
  deploy.contracts.upgradeBeaconController = await factory.deploy(
    deploy.overrides,
  );
  assert(deploy.contracts.upgradeBeaconController);
  await deploy.contracts.upgradeBeaconController.deployTransaction.wait(
    deploy.chainConfig.confirmations,
  );

  // add contract information to Etherscan verification array
  deploy.verificationInput.push({
    name: 'UpgradeBeaconController',
    address: deploy.contracts.upgradeBeaconController.address,
    constructorArguments: [],
  });
}

/**
 * Deploys the UpdaterManager on the chain of the given deploy and updates
 * the deploy instance with the new contract.
 *
 * @param deploy - The deploy instance
 */
export async function deployUpdaterManager(deploy: CoreDeploy) {
  let factory = new contracts.UpdaterManager__factory(deploy.signer);
  deploy.contracts.updaterManager = await factory.deploy(
    deploy.updater,
    deploy.overrides,
  );
  await deploy.contracts.updaterManager.deployTransaction.wait(
    deploy.chainConfig.confirmations,
  );

  // add contract information to Etherscan verification array
  deploy.verificationInput.push({
    name: 'UpdaterManager',
    address: deploy.contracts.updaterManager!.address,
    constructorArguments: [deploy.updater],
  });
}

/**
 * Deploys the XAppConnectionManager on the chain of the given deploy and updates
 * the deploy instance with the new contract.
 *
 * @param deploy - The deploy instance
 */
export async function deployXAppConnectionManager(deploy: CoreDeploy) {
  const isTestDeploy: boolean = deploy.test;
  if (isTestDeploy) warn('deploying test XAppConnectionManager');

  const signer = deploy.signer;
  const factory = isTestDeploy
    ? new contracts.TestXAppConnectionManager__factory(signer)
    : new contracts.XAppConnectionManager__factory(signer);

  deploy.contracts.xAppConnectionManager = await factory.deploy(
    deploy.overrides,
  );
  await deploy.contracts.xAppConnectionManager.deployTransaction.wait(
    deploy.chainConfig.confirmations,
  );

  // add contract information to Etherscan verification array
  deploy.verificationInput.push({
    name: 'XAppConnectionManager',
    address: deploy.contracts.xAppConnectionManager!.address,
    constructorArguments: [],
  });
}

/**
 * Deploys the Home proxy on the chain of the given deploy and updates
 * the deploy instance with the new contract.
 *
 * @param deploy - The deploy instance
 */
export async function deployHome(deploy: CoreDeploy) {
  const isTestDeploy: boolean = deploy.test;
  if (isTestDeploy) warn('deploying test Home');
  const homeFactory = isTestDeploy
    ? contracts.TestHome__factory
    : contracts.Home__factory;

  let { updaterManager } = deploy.contracts;
  let initData = homeFactory
    .createInterface()
    .encodeFunctionData('initialize', [updaterManager!.address]);

  deploy.contracts.home = await proxyUtils.deployProxy<contracts.Home>(
    'Home',
    deploy,
    new homeFactory(deploy.signer),
    initData,
    deploy.chainConfig.domain,
  );
}

/**
 * Deploys the GovernanceRouter proxy on the chain of the given deploy and updates
 * the deploy instance with the new contract.
 *
 * @param deploy - The deploy instance
 */
export async function deployGovernanceRouter(deploy: CoreDeploy) {
  const isTestDeploy: boolean = deploy.test;
  if (isTestDeploy) warn('deploying test GovernanceRouter');
  const governanceRouter = isTestDeploy
    ? contracts.TestGovernanceRouter__factory
    : contracts.GovernanceRouter__factory;

  let { xAppConnectionManager } = deploy.contracts;
  const recoveryTimelock = deploy.config.recoveryTimelock;

  let initData = governanceRouter
    .createInterface()
    .encodeFunctionData('initialize', [
      xAppConnectionManager!.address,
      deploy.recoveryManager,
    ]);

  deploy.contracts.governanceRouter =
    await proxyUtils.deployProxy<contracts.GovernanceRouter>(
      'Governance',
      deploy,
      new governanceRouter(deploy.signer),
      initData,
      deploy.chainConfig.domain,
      recoveryTimelock,
    );
}

/**
 * Deploys an unenrolled Replica proxy on the local chain and updates the local
 * deploy instance with the new contract.
 *
 * @param local - The local deploy instance
 * @param remote - The remote deploy instance
 */
export async function deployUnenrolledReplica(
  local: CoreDeploy,
  remote: CoreDeploy,
) {
  const isTestDeploy: boolean = remote.test;
  if (isTestDeploy) warn('deploying test Replica');

  const replica = isTestDeploy
    ? contracts.TestReplica__factory
    : contracts.Replica__factory;

  let initData = replica.createInterface().encodeFunctionData('initialize', [
    remote.chainConfig.domain,
    remote.updater,
    ethers.constants.HashZero, // TODO: allow configuration
    remote.config.optimisticSeconds,
  ]);

  // if we have no replicas, deploy the whole setup.
  // otherwise just deploy a fresh proxy
  let proxy;
  if (Object.keys(local.contracts.replicas).length === 0) {
    log(
      isTestDeploy,
      `${local.chainConfig.name}: deploying initial Replica for ${remote.chainConfig.name}`,
    );
    proxy = await proxyUtils.deployProxy<contracts.Replica>(
      'Replica',
      local,
      new replica(local.signer),
      initData,
      local.chainConfig.domain,
      local.config.processGas,
      local.config.reserveGas,
    );
  } else {
    log(
      isTestDeploy,
      `${local.chainConfig.name}: deploying additional Replica for ${remote.chainConfig.name}`,
    );
    const prev = Object.entries(local.contracts.replicas)[0][1];
    proxy = await proxyUtils.duplicate<contracts.Replica>(
      'Replica',
      local,
      prev,
      initData,
    );
  }
  local.contracts.replicas[remote.chainConfig.domain] = proxy;
  log(
    isTestDeploy,
    `${local.chainConfig.name}: replica deployed for ${remote.chainConfig.name}`,
  );
}

/**
 * Deploys the entire optics suite of contracts on the chain of the given deploy
 * and updates the deploy instance with the new contracts.
 *
 * @param deploy - The deploy instance
 */
export async function deployOptics(deploy: CoreDeploy) {
  const isTestDeploy: boolean = deploy.test;
  if (isTestDeploy) {
    warn('deploying test contracts', true);
  }

  log(isTestDeploy, `${deploy.chainConfig.name}: awaiting deploy UBC(deploy);`);
  await deployUpgradeBeaconController(deploy);

  log(
    isTestDeploy,
    `${deploy.chainConfig.name}: awaiting deploy UpdaterManager(deploy);`,
  );
  await deployUpdaterManager(deploy);

  log(
    isTestDeploy,
    `${deploy.chainConfig.name}: awaiting deploy XappConnectionManager(deploy);`,
  );
  await deployXAppConnectionManager(deploy);

  log(isTestDeploy, `${deploy.chainConfig.name}: awaiting deploy Home(deploy);`);
  await deployHome(deploy);

  log(
    isTestDeploy,
    `${deploy.chainConfig.name}: awaiting XAppConnectionManager.setHome(...);`,
  );
  await deploy.contracts.xAppConnectionManager!.setHome(
    deploy.contracts.home!.proxy.address,
    deploy.overrides,
  );

  log(
    isTestDeploy,
    `${deploy.chainConfig.name}: awaiting updaterManager.setHome(...);`,
  );
  await deploy.contracts.updaterManager!.setHome(
    deploy.contracts.home!.proxy.address,
    deploy.overrides,
  );

  log(
    isTestDeploy,
    `${deploy.chainConfig.name}: awaiting deploy GovernanceRouter(deploy);`,
  );
  await deployGovernanceRouter(deploy);

  log(isTestDeploy, `${deploy.chainConfig.name}: initial chain deploy completed`);
}

/**
 * Transfers ownership to the GovernanceRouter.
 *
 * @param deploy - The deploy instance
 */
export async function relinquish(deploy: CoreDeploy) {
  const isTestDeploy = deploy.test;
  const govRouter = await deploy.contracts.governanceRouter!.proxy.address;

  log(isTestDeploy, `${deploy.chainConfig.name}: Relinquishing control`);
  await deploy.contracts.updaterManager!.transferOwnership(
    govRouter,
    deploy.overrides,
  );

  log(
    isTestDeploy,
    `${deploy.chainConfig.name}: Dispatched relinquish updatermanager`,
  );

  await deploy.contracts.xAppConnectionManager!.transferOwnership(
    govRouter,
    deploy.overrides,
  );

  log(
    isTestDeploy,
    `${deploy.chainConfig.name}: Dispatched relinquish XAppConnectionManager`,
  );

  await deploy.contracts.upgradeBeaconController!.transferOwnership(
    govRouter,
    deploy.overrides,
  );

  log(
    isTestDeploy,
    `${deploy.chainConfig.name}: Dispatched relinquish upgradeBeaconController`,
  );

  Object.entries(deploy.contracts.replicas).forEach(
    async ([domain, replica]) => {
      await replica.proxy.transferOwnership(govRouter, deploy.overrides);
      log(
        isTestDeploy,
        `${deploy.chainConfig.name}: Dispatched relinquish Replica for domain ${domain}`,
      );
    },
  );

  let tx = await deploy.contracts.home!.proxy.transferOwnership(
    govRouter,
    deploy.overrides,
  );

  log(isTestDeploy, `${deploy.chainConfig.name}: Dispatched relinquish home`);

  await tx.wait(deploy.chainConfig.confirmations);
  log(isTestDeploy, `${deploy.chainConfig.name}: Control relinquished`);
}

/**
 * Enrolls a remote replica on the local chain.
 *
 * @param local - The local deploy instance
 * @param remote - The remote deploy instance
 */
export async function enrollReplica(local: CoreDeploy, remote: CoreDeploy) {
  const isTestDeploy = local.test;
  log(isTestDeploy, `${local.chainConfig.name}: starting replica enrollment`);

  let tx = await local.contracts.xAppConnectionManager!.ownerEnrollReplica(
    local.contracts.replicas[remote.chainConfig.domain].proxy.address,
    remote.chainConfig.domain,
    local.overrides,
  );
  await tx.wait(local.chainConfig.confirmations);

  log(isTestDeploy, `${local.chainConfig.name}: replica enrollment done`);
}

/**
 * Enrolls a remote watcher on the local chain.
 *
 * @param local - The local deploy instance
 * @param remote - The remote deploy instance
 */
export async function enrollWatchers(left: CoreDeploy, right: CoreDeploy) {
  const isTestDeploy = left.test;
  log(isTestDeploy, `${left.chainConfig.name}: starting watcher enrollment`);

  await Promise.all(
    left.watchers.map(async (watcher) => {
      const tx =
        await left.contracts.xAppConnectionManager!.setWatcherPermission(
          watcher,
          right.chainConfig.domain,
          true,
          left.overrides,
        );
      await tx.wait(left.chainConfig.confirmations);
    }),
  );

  log(isTestDeploy, `${left.chainConfig.name}: watcher enrollment done`);
}

/**
 * Enrolls a remote GovernanceRouter on the local chain.
 *
 * @param local - The local deploy instance
 * @param remote - The remote deploy instance
 */
export async function enrollGovernanceRouter(
  local: CoreDeploy,
  remote: CoreDeploy,
) {
  const isTestDeploy = local.test;
  log(
    isTestDeploy,
    `${local.chainConfig.name}: starting enroll ${remote.chainConfig.name} governance router`,
  );
  let tx = await local.contracts.governanceRouter!.proxy.setRouter(
    remote.chainConfig.domain,
    toBytes32(remote.contracts.governanceRouter!.proxy.address),
    local.overrides,
  );
  await tx.wait(local.chainConfig.confirmations);
  log(
    isTestDeploy,
    `${local.chainConfig.name}: enrolled ${remote.chainConfig.name} governance router`,
  );
}

/**
 * Enrolls a remote Replica, GovernanceRouter and Watchers on the local chain.
 *
 * @param local - The local deploy instance
 * @param remote - The remote deploy instance
 */
export async function enrollRemote(local: CoreDeploy, remote: CoreDeploy) {
  await deployUnenrolledReplica(local, remote);
  await enrollReplica(local, remote);
  await enrollWatchers(local, remote);
  await enrollGovernanceRouter(local, remote);
}

/**
 * Transfers governorship to the governing chain's GovernanceRouter.
 *
 * @param gov - The governor chain deploy instance
 * @param non - The non-governor chain deploy instance
 */
export async function transferGovernorship(gov: CoreDeploy, non: CoreDeploy) {
  log(gov.test, `${non.chainConfig.name}: transferring governorship`);
  let governorAddress = await gov.contracts.governanceRouter!.proxy.governor();
  let tx = await non.contracts.governanceRouter!.proxy.transferGovernor(
    gov.chainConfig.domain,
    governorAddress,
    non.overrides,
  );
  await tx.wait(gov.chainConfig.confirmations);
  log(gov.test, `${non.chainConfig.name}: governorship transferred`);
}

/**
 * Appints the intended ultimate governor in that domain's Governance Router.
 * If the governor address is not configured, it will remain the signer
 * address.
 * @param gov - The governor chain deploy instance
 */
export async function appointGovernor(gov: CoreDeploy) {
  const domain = gov.chainConfig.domain;
  const governor = await gov.governorOrSigner();
  if (governor) {
    log(
      gov.test,
      `${gov.chainConfig.name}: transferring root governorship to ${domain}:${governor}`,
    );
    const tx = await gov.contracts.governanceRouter!.proxy.transferGovernor(
      domain,
      governor,
      gov.overrides,
    );
    await tx.wait(gov.chainConfig.confirmations);
    log(gov.test, `${gov.chainConfig.name}: root governorship transferred`);
  }
}

/**
 * Deploys the entire optics suite of contracts on two chains.
 *
 * @notice `gov` has the governance capability after setup
 *
 * @param gov - The governor chain deploy instance
 * @param non - The non-governor chain deploy instance
 */
export async function deployTwoChains(gov: CoreDeploy, non: CoreDeploy) {
  const isTestDeploy: boolean = gov.test || non.test;

  log(isTestDeploy, 'Beginning Two Chain deploy process');
  log(isTestDeploy, `Deploy env is ${gov.config.environment}`);
  log(isTestDeploy, `${gov.chainConfig.name} is governing`);
  log(
    isTestDeploy,
    `Updater for ${gov.chainConfig.name} Home is ${gov.updater}`,
  );
  log(
    isTestDeploy,
    `Updater for ${non.chainConfig.name} Home is ${non.updater}`,
  );

  log(isTestDeploy, 'awaiting provider ready');
  await Promise.all([gov.ready(), non.ready()]);
  log(isTestDeploy, 'done readying');

  await Promise.all([deployOptics(gov), deployOptics(non)]);

  log(isTestDeploy, 'initial deploys done');

  await Promise.all([
    deployUnenrolledReplica(gov, non),
    deployUnenrolledReplica(non, gov),
  ]);

  log(isTestDeploy, 'replica deploys done');

  await Promise.all([enrollReplica(gov, non), enrollReplica(non, gov)]);

  log(isTestDeploy, 'replica enrollment done');

  await Promise.all([enrollWatchers(gov, non), enrollWatchers(non, gov)]);

  await Promise.all([
    enrollGovernanceRouter(gov, non),
    enrollGovernanceRouter(non, gov),
  ]);

  if (gov.governor) {
    log(isTestDeploy, `appoint governor: ${gov.governor}`);
    await appointGovernor(gov);
  }

  await transferGovernorship(gov, non);

  await Promise.all([relinquish(gov), relinquish(non)]);

  // checks deploys are correct
  const checker = new CoreInvariantChecker([gov, non]);
  await checker.checkDeploys();
  checker.expectEmpty();

  if (!isTestDeploy) {
    writeDeployOutput([gov, non]);
  }
}

/**
 * Deploy the entire suite of Optics contracts
 * on each chain within the chainConfigs array
 * including the upgradable Home, Replicas, and GovernanceRouter
 * that have been deployed, initialized, and configured
 * according to the deployOptics script
 *
 * @dev The first chain in the array will be the governing chain
 *
 * @param deploys - An array of chain deploys
 */
export async function deployNChains(deploys: CoreDeploy[]) {
  if (deploys.length == 0) {
    throw new Error('Must pass at least one deploy config');
  }

  // there exists any chain marked test
  const isTestDeploy: boolean = deploys.filter((c) => c.test).length > 0;

  log(isTestDeploy, `Beginning ${deploys.length} Chain deploy process`);
  log(isTestDeploy, `Deploy env is ${deploys[0].config.environment}`);
  log(isTestDeploy, `${deploys[0].chainConfig.name} is governing`);
  deploys.forEach((deploy) => {
    log(
      isTestDeploy,
      `Updater for ${deploy.chainConfig.name} Home is ${deploy.updater}`,
    );
  });

  const govChain = deploys[0];
  const nonGovChains = deploys.slice(1);

  log(isTestDeploy, 'awaiting provider ready');
  await Promise.all([
    deploys.map(async (deploy) => {
      await deploy.ready();
    }),
  ]);
  log(isTestDeploy, 'done readying');

  await Promise.all(deploys.map(deployOptics));

  // enroll remotes on every chain
  //
  //    NB: do not use Promise.all for this block. It introduces a race condition
  //    which results in multiple replica implementations on the home chain.
  //
  for (let local of deploys) {
    const remotes = deploys.filter(
      (d) => d.chainConfig.domain !== local.chainConfig.domain,
    );
    for (let remote of remotes) {
      log(
        isTestDeploy,
        `connecting ${remote.chainConfig.name} on ${local.chainConfig.name}`,
      );
      await enrollRemote(local, remote);
      log(
        isTestDeploy,
        `connected ${remote.chainConfig.name} on ${local.chainConfig.name}`,
      );
    }
  }

  // appoint the configured governance account as governor
  if (govChain.governor) {
    log(isTestDeploy, `appoint governor: ${govChain.governor}`);
    await appointGovernor(govChain);
  }

  await Promise.all(
    nonGovChains.map(async (non) => {
      await transferGovernorship(govChain, non);
    }),
  );

  // relinquish control of all chains
  await Promise.all(deploys.map(relinquish));

  // write config outputs
  if (!isTestDeploy) {
    writeDeployOutput(deploys);
  }

  // checks deploys are correct
  const checker = new CoreInvariantChecker(deploys);
  await checker.checkDeploys();
  checker.expectEmpty();

  // write config outputs again, should write under a different dir
  if (!isTestDeploy) {
    writeDeployOutput(deploys);
  }
}

/**
 * Copies the partial configs from the default directory to the specified directory.
 *
 * @param dir - relative path to folder where partial configs will be written
 */
export function writePartials(dir: string) {
  // make folder if it doesn't exist already
  fs.mkdirSync(dir, { recursive: true });
  const defaultDir = '../../rust/config/default';
  const partialNames = ['kathy', 'processor', 'relayer', 'updater', 'watcher'];
  // copy partial config from default directory to given directory
  for (let partialName of partialNames) {
    const filename = `${partialName}-partial.json`;
    fs.copyFile(`${defaultDir}/${filename}`, `${dir}/${filename}`, (err) => {
      if (err) {
        console.error(err);
      }
    });
  }
}

/**
 * Outputs the values for chains that have been deployed.
 *
 * @param deploys - The array of chain deploys
 */
export function writeDeployOutput(deploys: CoreDeploy[], writeDir?: string) {
  log(deploys[0].test, `Have ${deploys.length} deploys`);
  const dir = writeDir ? writeDir : `../../rust/config/${Date.now()}`;
  for (const local of deploys) {
    // get remotes
    const remotes = deploys
      .slice()
      .filter((remote) => remote.chainConfig.domain !== local.chainConfig.domain);

    const rustConfig = CoreDeploy.buildRustConfig(local, remotes);
    const name = local.chainConfig.name;

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      `${dir}/${name}_config.json`,
      JSON.stringify(rustConfig, null, 2),
    );
    fs.writeFileSync(
      `${dir}/${name}_contracts.json`,
      JSON.stringify(local.contractOutput, null, 2),
    );
    fs.writeFileSync(
      `${dir}/${name}_verification.json`,
      JSON.stringify(local.verificationInput, null, 2),
    );
  }
  writePartials(dir);
}
