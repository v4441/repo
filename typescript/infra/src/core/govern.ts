import { ethers } from 'ethers';

import {
  AbacusCoreChecker,
  ChainMap,
  ChainName,
  CoreViolationType,
  OwnerViolation,
  ValidatorViolation,
  ValidatorViolationType,
  ViolationType,
  objMap,
} from '@abacus-network/sdk';
import { types } from '@abacus-network/utils';

interface Call {
  to: types.Address;
  data: ethers.utils.BytesLike;
}

export class AbacusCoreGovernor<Chain extends ChainName> {
  readonly checker: AbacusCoreChecker<Chain>;
  calls: ChainMap<Chain, Call[]>;

  constructor(checker: AbacusCoreChecker<Chain>) {
    this.checker = checker;
    this.calls = objMap(this.checker.app.contractsMap, () => []);
  }

  pushCall(chain: Chain, call: Call) {
    this.calls[chain].push(call);
  }

  async govern() {
    for (const violation of this.checker.violations) {
      switch (violation.type) {
        case CoreViolationType.Validator: {
          await this.handleValidatorViolation(violation as ValidatorViolation);
          break;
        }
        case ViolationType.Owner: {
          // await this.handleOwnerViolation(violation as OwnerViolation);
          break;
        }
        default:
          throw new Error(`Unsupported violation type ${violation.type}`);
      }
    }
  }

  logCalls() {
    objMap(this.calls, (chain, calls) => {
      console.log(chain, calls);
    });
  }

  async handleValidatorViolation(violation: ValidatorViolation) {
    const validatorManager = violation.data.validatorManager;
    switch (violation.data.type) {
      case ValidatorViolationType.EnrollValidator: {
        const call = {
          to: validatorManager.address,
          data:
            (
              await validatorManager.populateTransaction.enrollValidator(
                violation.expected,
              )
            ).data || '0x',
        };
        this.pushCall(violation.chain as Chain, call);
        break;
      }
      case ValidatorViolationType.UnenrollValidator: {
        const call = {
          to: validatorManager.address,
          data:
            (
              await validatorManager.populateTransaction.unenrollValidator(
                violation.actual,
              )
            ).data || '0x',
        };
        this.pushCall(violation.chain as Chain, call);
        break;
      }
      default:
        throw new Error(
          `Unsupported validator violation type ${violation.data.type}`,
        );
    }
  }

  // This function is an exception in that it assumes the MultiProvider
  // is configured with the privileged signers. All other functions assume
  // governance is done via multisig.
  async handleOwnerViolation(violation: OwnerViolation) {
    const chainConnection = this.checker.multiProvider.getChainConnection(
      violation.chain as Chain,
    );
    console.log(
      `${violation.chain}: transferring ownership of ${violation.data.contract.address} from ${violation.actual} to ${violation.expected}`,
    );
    const response = await violation.data.contract.transferOwnership(
      violation.expected,
      chainConnection.overrides,
    );
    await response.wait(chainConnection.confirmations);
  }
}
