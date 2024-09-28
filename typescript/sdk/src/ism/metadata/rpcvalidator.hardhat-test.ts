import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers.js';
import hre from 'hardhat';
import { before } from 'mocha';
import sinon from 'sinon';

import {
  MerkleTreeHook,
  MerkleTreeHook__factory,
  TestRecipient,
} from '@hyperlane-xyz/core';
import { Address, Domain, objMap, randomElement } from '@hyperlane-xyz/utils';

import { testChains } from '../../consts/testChains.js';
import {
  HyperlaneAddresses,
  HyperlaneContracts,
} from '../../contracts/types.js';
import { HyperlaneCore } from '../../core/HyperlaneCore.js';
import { TestCoreDeployer } from '../../core/TestCoreDeployer.js';
import { TestRecipientDeployer } from '../../core/TestRecipientDeployer.js';
import { HyperlaneProxyFactoryDeployer } from '../../deploy/HyperlaneProxyFactoryDeployer.js';
import { ProxyFactoryFactories } from '../../deploy/contracts.js';
import { EvmHookModule } from '../../hook/EvmHookModule.js';
import { HookType, MerkleTreeHookConfig } from '../../hook/types.js';
import { MultiProvider } from '../../providers/MultiProvider.js';
import { ChainName } from '../../types.js';
import { EvmIsmReader } from '../EvmIsmReader.js';
import { HyperlaneIsmFactory } from '../HyperlaneIsmFactory.js';
import { IsmConfig, IsmType } from '../types.js';

import { BaseMetadataBuilder, MetadataContext } from './builder.js';
import {
  MockRpcValidatorSignerService,
  RemoteRpcValidatorSignerService,
} from './rpcValidator.js';

const MAX_ISM_DEPTH = 5;
// const MAX_NUM_VALIDATORS = 10;
const NUM_RUNS = 1;

describe('BaseMetadataBuilder', () => {
  let core: HyperlaneCore;
  let ismFactory: HyperlaneIsmFactory;
  const merkleHooks: Record<Domain, MerkleTreeHook> = {};
  let testRecipients: Record<ChainName, TestRecipient>;
  let proxyFactoryAddresses: HyperlaneAddresses<ProxyFactoryFactories>;
  let factoryContracts: HyperlaneContracts<ProxyFactoryFactories>;
  let relayer: SignerWithAddress;
  let validators: SignerWithAddress[];
  let metadataBuilder: BaseMetadataBuilder;

  before(async () => {
    [relayer, ...validators] = await hre.ethers.getSigners();
    const multiProvider = MultiProvider.createTestMultiProvider({
      signer: relayer,
    });
    const ismFactoryDeployer = new HyperlaneProxyFactoryDeployer(multiProvider);
    const contractsMap = await ismFactoryDeployer.deploy(
      multiProvider.mapKnownChains(() => ({})),
    );
    ismFactory = new HyperlaneIsmFactory(contractsMap, multiProvider);
    const coreDeployer = new TestCoreDeployer(multiProvider, ismFactory);
    const recipientDeployer = new TestRecipientDeployer(multiProvider);
    testRecipients = objMap(
      await recipientDeployer.deploy(
        Object.fromEntries(testChains.map((c) => [c, {}])),
      ),
      (_, { testRecipient }) => testRecipient,
    );
    core = await coreDeployer.deployApp();
    const hookConfig = objMap(
      core.chainMap,
      (): MerkleTreeHookConfig => ({
        type: HookType.MERKLE_TREE,
      }),
    );

    // deploy hooks
    for (const chain of Object.keys(hookConfig)) {
      factoryContracts = contractsMap[chain];
      proxyFactoryAddresses = Object.keys(factoryContracts).reduce(
        (acc, key) => {
          acc[key] =
            contractsMap[chain][key as keyof ProxyFactoryFactories].address;
          return acc;
        },
        {} as Record<string, Address>,
      ) as HyperlaneAddresses<ProxyFactoryFactories>;
      const hookModule = await EvmHookModule.create({
        chain,
        config: hookConfig[chain],
        proxyFactoryFactories: proxyFactoryAddresses,
        coreAddresses: core.getAddresses(chain),
        multiProvider,
      });
      const hookAddress = hookModule.serialize().deployedHook;
      const merkleHook = MerkleTreeHook__factory.connect(
        hookAddress,
        multiProvider.getProvider(chain),
      );
      merkleHooks[multiProvider.getDomainId(chain)] = merkleHook;
    }

    new MockRpcValidatorSignerService(relayer.provider!, relayer, 9191);

    metadataBuilder = new BaseMetadataBuilder(core);
    sinon
      .stub(metadataBuilder.rpcValidatorMetadataBuilder, 'getSignatureService')
      .callsFake(async (_validator: string, rpcUrl: string) => {
        return new RemoteRpcValidatorSignerService('http://localhost:9191');
      });
  });

  // eslint-disable-next-line jest/no-disabled-tests
  describe.only('#build', () => {
    let origin: ChainName;
    let destination: ChainName;
    let context: MetadataContext;
    let metadata: string;

    beforeEach(async () => {
      origin = randomElement(testChains);
      destination = randomElement(testChains.filter((c) => c !== origin));
      const testRecipient = testRecipients[destination];

      //   const addresses = validators
      //     .map((s) => s.address)
      //     .slice(0, MAX_NUM_VALIDATORS);
      const config: IsmConfig = {
        type: IsmType.RPC_VALIDATOR,
        threshold: 1,
        originMerkleTreeHook:
          merkleHooks[core.multiProvider.getDomainId(origin)].address,
        validators: [relayer.address],
        rpcUrl: 'http://localhost:9191',
      };
      const deployedIsm = await ismFactory.deploy({
        destination,
        config,
        mailbox: core.getAddresses(destination).mailbox,
      });

      await testRecipient.setInterchainSecurityModule(deployedIsm.address);

      const merkleHookAddress =
        merkleHooks[core.multiProvider.getDomainId(origin)].address;
      const { dispatchTx, message } = await core.sendMessage(
        origin,
        destination,
        testRecipient.address,
        '0xdeadbeef',
        merkleHookAddress,
      );

      const derivedIsm = await new EvmIsmReader(
        core.multiProvider,
        destination,
      ).deriveIsmConfig(deployedIsm.address);
      console.log(derivedIsm);
      context = {
        hook: {
          type: HookType.MERKLE_TREE,
          address: merkleHookAddress,
        },
        ism: derivedIsm,
        message,
        dispatchTx,
      };

      metadata = await metadataBuilder.build(context, MAX_ISM_DEPTH);
    });

    for (let i = 0; i < NUM_RUNS; i++) {
      it(`should build valid metadata for random ism config (${i})`, async () => {
        // must call process for trusted relayer to be able to verify
        await core
          .getContracts(destination)
          .mailbox.process(metadata, context.message.message);
      });

      it(`should decode metadata for random ism config (${i})`, async () => {
        BaseMetadataBuilder.decode(metadata, context);
      });
    }
  });
});
