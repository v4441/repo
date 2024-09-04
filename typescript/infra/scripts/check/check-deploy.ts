import {
  getCheckDeployArgs,
  getGovernor,
  logViolations,
} from './check-utils.js';

async function main() {
  const {
    module,
    context,
    environment,
    asDeployer,
    chain,
    fork,
    govern,
    warpRouteId,
  } = await getCheckDeployArgs().argv;

  const governor = await getGovernor(
    module,
    context,
    environment,
    asDeployer,
    warpRouteId,
    chain,
    fork,
    govern,
  );

  if (fork) {
    await governor.checkChain(fork);
    if (govern) {
      await governor.govern(false, fork);
    }
  } else if (chain) {
    await governor.checkChain(chain);
    if (govern) {
      await governor.govern(true, chain);
    }
  } else {
    await governor.check();
    if (govern) {
      await governor.govern();
    }
  }

  if (!govern) {
    const violations = governor.getCheckerViolations();
    if (violations.length > 0) {
      logViolations(violations);

      if (!fork) {
        throw new Error(
          `Checking ${module} deploy yielded ${violations.length} violations`,
        );
      }
    } else {
      console.info(`${module} checker found no violations`);
    }
  }
}

main()
  .then()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
