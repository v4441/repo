import { ChainMap, ModuleType, MultisigIsmConfig } from '@hyperlane-xyz/sdk';

// the addresses here must line up with the e2e test's validator addresses
export const multisigIsm: ChainMap<MultisigIsmConfig> = {
  // Validators are hardhat accounts 1-3
  test1: {
    type: ModuleType.LEGACY_MULTISIG,
    validators: ['0x70997970c51812dc3a010c7d01b50e0d17dc79c8'],
    threshold: 1,
  },
  test2: {
    type: ModuleType.MERKLE_ROOT_MULTISIG,
    validators: ['0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'],
    threshold: 1,
  },
  test3: {
    type: ModuleType.MESSAGE_ID_MULTISIG,
    validators: ['0x90f79bf6eb2c4f870365e785982e1f101e93b906'],
    threshold: 1,
  },
};
