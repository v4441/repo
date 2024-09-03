// This file is JS because of https://github.com/safe-global/safe-core-sdk/issues/805
import SafeApiKit from '@safe-global/api-kit';
import Safe, { EthersAdapter } from '@safe-global/protocol-kit';
import {
  getMultiSendCallOnlyDeployment,
  getMultiSendDeployment,
} from '@safe-global/safe-deployments';
import { ethers } from 'ethers';

export function getSafeService(chain, multiProvider) {
  const signer = multiProvider.getSigner(chain);
  const ethAdapter = new EthersAdapter({ ethers, signerOrProvider: signer });
  const txServiceUrl =
    multiProvider.getChainMetadata(chain).gnosisSafeTransactionServiceUrl;
  if (!txServiceUrl)
    throw new Error(`must provide tx service url for ${chain}`);
  return new SafeApiKit.default({ txServiceUrl, ethAdapter });
}

// Default safe version to use if not specified
const DEFAULT_SAFE_VERSION = '1.3.0';
const safeVersionOverrides = {
  ancient8: '1.1.1',
};

// This is the version of the Safe contracts that the SDK is compatible with.
// Copied the MVP fields from https://github.com/safe-global/safe-core-sdk/blob/4d1c0e14630f951c2498e1d4dd521403af91d6e1/packages/protocol-kit/src/contracts/config.ts#L19
// because the SDK doesn't expose this value.
const safeDeploymentsVersions = {
  '1.3.0': {
    multiSendVersion: '1.3.0',
    multiSendCallOnlyVersion: '1.3.0',
  },
  '1.1.1': {
    multiSendVersion: '1.1.1',
    multiSendCallOnlyVersion: '1.3.0',
  },
};

export function getSafe(chain, multiProvider, safeAddress) {
  // Create Ethers Adapter
  const signer = multiProvider.getSigner(chain);
  const ethAdapter = new EthersAdapter({ ethers, signerOrProvider: signer });

  // Get the domain id for the given chain
  const domainId = multiProvider.getDomainId(chain);

  // Get the default contract addresses for the given chain
  const safeVersion = safeVersionOverrides[chain] || DEFAULT_SAFE_VERSION;
  const { multiSendVersion, multiSendCallOnlyVersion } =
    safeDeploymentsVersions[safeVersion];
  const multiSend = getMultiSendDeployment({
    version: multiSendVersion,
    network: domainId,
    released: true,
  });
  const multiSendCallOnly = getMultiSendCallOnlyDeployment({
    version: multiSendCallOnlyVersion,
    network: domainId,
    released: true,
  });

  // Use the safe address for multiSendAddress and multiSendCallOnlyAddress
  // if the contract is not deployed
  return Safe.default.create({
    ethAdapter,
    safeAddress,
    contractNetworks: {
      [domainId]: {
        multiSendAddress: multiSend?.defaultAddress || safeAddress,
        multiSendCallOnlyAddress:
          multiSendCallOnly?.defaultAddress || safeAddress,
      },
    },
  });
}

export async function getSafeDelegates(service, safeAddress) {
  const delegateResponse = await service.getSafeDelegates({ safeAddress });
  return delegateResponse.results.map((r) => r.delegate);
}

export async function canProposeSafeTransactions(
  proposer,
  chain,
  multiProvider,
  safeAddress,
) {
  let safeService;
  try {
    safeService = getSafeService(chain, multiProvider);
  } catch (e) {
    return false;
  }
  const safe = await getSafe(chain, multiProvider, safeAddress);
  const delegates = await getSafeDelegates(safeService, safeAddress);
  const owners = await safe.getOwners();
  return delegates.includes(proposer) || owners.includes(proposer);
}
