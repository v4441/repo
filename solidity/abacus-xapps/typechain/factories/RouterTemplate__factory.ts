/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import type {
  RouterTemplate,
  RouterTemplateInterface,
} from "../RouterTemplate";

const _abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_xAppConnectionManager",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint32",
        name: "domain",
        type: "uint32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "router",
        type: "bytes32",
      },
    ],
    name: "SetRemoteRouter",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "xAppConnectionManager",
        type: "address",
      },
    ],
    name: "SetXAppConnectionManager",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "number",
        type: "uint256",
      },
    ],
    name: "TypeAReceived",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "_destinationDomain",
        type: "uint32",
      },
      {
        internalType: "uint256",
        name: "_number",
        type: "uint256",
      },
    ],
    name: "dispatchTypeA",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "_origin",
        type: "uint32",
      },
      {
        internalType: "bytes32",
        name: "_sender",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "_message",
        type: "bytes",
      },
    ],
    name: "handle",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32",
      },
    ],
    name: "routers",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "_domain",
        type: "uint32",
      },
      {
        internalType: "bytes32",
        name: "_router",
        type: "bytes32",
      },
    ],
    name: "setRemoteRouter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_xAppConnectionManager",
        type: "address",
      },
    ],
    name: "setXAppConnectionManager",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "xAppConnectionManager",
    outputs: [
      {
        internalType: "contract XAppConnectionManager",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const _bytecode =
  "0x60806040523480156200001157600080fd5b50604051620019e5380380620019e5833981810160405260208110156200003757600080fd5b505162000044816200004b565b50620003ac565b600054610100900460ff1680620000675750620000676200011b565b8062000076575060005460ff16155b620000b35760405162461bcd60e51b815260040180806020018281038252602e815260200180620019b7602e913960400191505060405180910390fd5b600054610100900460ff16158015620000df576000805460ff1961ff0019909116610100171660011790555b606580546001600160a01b0319166001600160a01b0384161790556200010462000139565b801562000117576000805461ff00191690555b5050565b60006200013330620001f760201b620009ad1760201c565b15905090565b600054610100900460ff1680620001555750620001556200011b565b8062000164575060005460ff16155b620001a15760405162461bcd60e51b815260040180806020018281038252602e815260200180620019b7602e913960400191505060405180910390fd5b600054610100900460ff16158015620001cd576000805460ff1961ff0019909116610100171660011790555b620001d7620001fd565b620001e1620002a5565b8015620001f4576000805461ff00191690555b50565b3b151590565b600054610100900460ff1680620002195750620002196200011b565b8062000228575060005460ff16155b620002655760405162461bcd60e51b815260040180806020018281038252602e815260200180620019b7602e913960400191505060405180910390fd5b600054610100900460ff16158015620001e1576000805460ff1961ff0019909116610100171660011790558015620001f4576000805461ff001916905550565b600054610100900460ff1680620002c15750620002c16200011b565b80620002d0575060005460ff16155b6200030d5760405162461bcd60e51b815260040180806020018281038252602e815260200180620019b7602e913960400191505060405180910390fd5b600054610100900460ff1615801562000339576000805460ff1961ff0019909116610100171660011790555b600062000345620003a8565b603380546001600160a01b0319166001600160a01b038316908117909155604051919250906000907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0908290a3508015620001f4576000805461ff001916905550565b3390565b6115fb80620003bc6000396000f3fe608060405234801561001057600080fd5b50600436106100a35760003560e01c806356d5d475116100765780638da5cb5b1161005b5780638da5cb5b1461022c578063a026f04214610234578063f2fde38b1461025d576100a3565b806356d5d4751461016c578063715018a614610224576100a3565b80631984a330146100a85780632ead72f6146100d35780633339df961461010857806341bdc8b514610139575b600080fd5b6100d1600480360360408110156100be57600080fd5b5063ffffffff8135169060200135610290565b005b6100f6600480360360208110156100e957600080fd5b503563ffffffff1661039a565b60408051918252519081900360200190f35b6101106103ac565b6040805173ffffffffffffffffffffffffffffffffffffffff9092168252519081900360200190f35b6100d16004803603602081101561014f57600080fd5b503573ffffffffffffffffffffffffffffffffffffffff166103c8565b6100d16004803603606081101561018257600080fd5b63ffffffff823516916020810135918101906060810160408201356401000000008111156101af57600080fd5b8201836020820111156101c157600080fd5b803590602001918460018302840111640100000000831117156101e357600080fd5b91908080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525092955061047c945050505050565b6100d1610622565b610110610739565b6100d16004803603604081101561024a57600080fd5b5063ffffffff8135169060200135610755565b6100d16004803603602081101561027357600080fd5b503573ffffffffffffffffffffffffffffffffffffffff1661080b565b600061029b836109b7565b905060006102a883610a39565b90506102b2610a7e565b73ffffffffffffffffffffffffffffffffffffffff1663fa31de018584846040518463ffffffff1660e01b8152600401808463ffffffff16815260200183815260200180602001828103825283818151815260200191508051906020019080838360005b8381101561032e578181015183820152602001610316565b50505050905090810190601f16801561035b5780820380516001836020036101000a031916815260200191505b50945050505050600060405180830381600087803b15801561037c57600080fd5b505af1158015610390573d6000803e3d6000fd5b5050505050505050565b60976020526000908152604090205481565b60655473ffffffffffffffffffffffffffffffffffffffff1681565b6103d0610b1a565b73ffffffffffffffffffffffffffffffffffffffff166103ee610739565b73ffffffffffffffffffffffffffffffffffffffff161461047057604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820181905260248201527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572604482015290519081900360640190fd5b61047981610b1e565b50565b61048533610b8d565b6104f057604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600660248201527f21696e626f780000000000000000000000000000000000000000000000000000604482015290519081900360640190fd5b82826104fc8282610c36565b61056757604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600760248201527f21726f7574657200000000000000000000000000000000000000000000000000604482015290519081900360640190fd5b60006105738482610c55565b90506105a07fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000008216610c79565b156105b3576105ae81610c98565b61061a565b604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600d60248201527f2176616c696420616374696f6e00000000000000000000000000000000000000604482015290519081900360640190fd5b505050505050565b61062a610b1a565b73ffffffffffffffffffffffffffffffffffffffff16610648610739565b73ffffffffffffffffffffffffffffffffffffffff16146106ca57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820181905260248201527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572604482015290519081900360640190fd5b60335460405160009173ffffffffffffffffffffffffffffffffffffffff16907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0908390a3603380547fffffffffffffffffffffffff0000000000000000000000000000000000000000169055565b60335473ffffffffffffffffffffffffffffffffffffffff1690565b61075d610b1a565b73ffffffffffffffffffffffffffffffffffffffff1661077b610739565b73ffffffffffffffffffffffffffffffffffffffff16146107fd57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820181905260248201527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572604482015290519081900360640190fd5b6108078282610d00565b5050565b610813610b1a565b73ffffffffffffffffffffffffffffffffffffffff16610831610739565b73ffffffffffffffffffffffffffffffffffffffff16146108b357604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820181905260248201527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572604482015290519081900360640190fd5b73ffffffffffffffffffffffffffffffffffffffff811661091f576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260268152602001806114e26026913960400191505060405180910390fd5b60335460405173ffffffffffffffffffffffffffffffffffffffff8084169216907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e090600090a3603380547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff92909216919091179055565b803b15155b919050565b63ffffffff8116600090815260976020526040902054806109b257604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600760248201527f21726f7574657200000000000000000000000000000000000000000000000000604482015290519081900360640190fd5b604080517f0100000000000000000000000000000000000000000000000000000000000000602082015260218082019390935281518082039093018352604101905290565b606554604080517fce11e6ab000000000000000000000000000000000000000000000000000000008152905160009273ffffffffffffffffffffffffffffffffffffffff169163ce11e6ab916004808301926020929190829003018186803b158015610ae957600080fd5b505afa158015610afd573d6000803e3d6000fd5b505050506040513d6020811015610b1357600080fd5b5051905090565b3390565b606580547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff83169081179091556040517f44f5c9724b3fe6c8848ca05e1bee17ac4971f31be91d1c71b1eefdb3c826677490600090a250565b606554604080517f282f51eb00000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff84811660048301529151600093929092169163282f51eb91602480820192602092909190829003018186803b158015610c0457600080fd5b505afa158015610c18573d6000803e3d6000fd5b505050506040513d6020811015610c2e57600080fd5b505192915050565b63ffffffff821660009081526097602052604090205481145b92915050565b815160009060208401610c7064ffffffffff85168284610d44565b95945050505050565b60006001610c8683610da5565b6001811115610c9157fe5b1492915050565b6000610cc57fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000008316610de0565b6040805182815290519192507f2b51a16951b17b51a53e06c3041d704232f26354acf317a5b7bfeab23f4ca629919081900360200190a15050565b63ffffffff8216600081815260976020526040808220849055518392917f28c6f5e52226c6780972acde9575ed6a2f7b68677f66cf3dc4815f8e3f57e0cf91a35050565b600080610d518484610e6f565b9050604051811115610d61575060005b80610d8f577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000915050610d9e565b610d9a858585610ee1565b9150505b9392505050565b6000610dd27fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000008316610ef4565b60ff166001811115610c4f57fe5b6000610deb82610c79565b610e40576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252602e815260200180611508602e913960400191505060405180910390fd5b610c4f7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000831660006020610efa565b81810182811015610c4f57604080517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601960248201527f4f766572666c6f7720647572696e67206164646974696f6e2e00000000000000604482015290519081900360640190fd5b606092831b9190911790911b1760181b90565b60d81c90565b600060ff8216610f0c57506000610d9e565b610f15846110a5565b6bffffffffffffffffffffffff16610f308460ff8516610e6f565b111561100f57610f71610f42856110b9565b6bffffffffffffffffffffffff16610f59866110a5565b6bffffffffffffffffffffffff16858560ff166110cd565b6040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825283818151815260200191508051906020019080838360005b83811015610fd4578181015183820152602001610fbc565b50505050905090810190601f1680156110015780820380516001836020036101000a031916815260200191505b509250505060405180910390fd5b60208260ff16111561106c576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040180806020018281038252603a815260200180611557603a913960400191505060405180910390fd5b60088202600061107b866110b9565b6bffffffffffffffffffffffff169050600061109683611228565b91909501511695945050505050565b60181c6bffffffffffffffffffffffff1690565b60781c6bffffffffffffffffffffffff1690565b606060006110da86611271565b91505060006110e886611271565b91505060006110f686611271565b915050600061110486611271565b915050838383836040516020018080611591603591397fffffffffffff000000000000000000000000000000000000000000000000000060d087811b821660358401527f2077697468206c656e6774682030780000000000000000000000000000000000603b84015286901b16604a820152605001602161153682397fffffffffffff000000000000000000000000000000000000000000000000000060d094851b811660218301527f2077697468206c656e677468203078000000000000000000000000000000000060278301529290931b9091166036830152507f2e00000000000000000000000000000000000000000000000000000000000000603c82015260408051601d818403018152603d90920190529b9a5050505050505050505050565b7f80000000000000000000000000000000000000000000000000000000000000007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9091011d90565b600080601f5b600f8160ff1611156112d95760ff600882021684901c61129681611345565b61ffff16841793508160ff166010146112b157601084901b93505b507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff01611277565b50600f5b60ff8160ff16101561133f5760ff600882021684901c6112fc81611345565b61ffff16831792508160ff1660001461131757601083901b92505b507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff016112dd565b50915091565b600061135760048360ff16901c611375565b60ff161760081b62ffff001661136c82611375565b60ff1617919050565b600060f08083179060ff821614156113915760309150506109b2565b8060ff1660f114156113a75760319150506109b2565b8060ff1660f214156113bd5760329150506109b2565b8060ff1660f314156113d35760339150506109b2565b8060ff1660f414156113e95760349150506109b2565b8060ff1660f514156113ff5760359150506109b2565b8060ff1660f614156114155760369150506109b2565b8060ff1660f7141561142b5760379150506109b2565b8060ff1660f814156114415760389150506109b2565b8060ff1660f914156114575760399150506109b2565b8060ff1660fa141561146d5760619150506109b2565b8060ff1660fb14156114835760629150506109b2565b8060ff1660fc14156114995760639150506109b2565b8060ff1660fd14156114af5760649150506109b2565b8060ff1660fe14156114c55760659150506109b2565b8060ff1660ff14156114db5760669150506109b2565b5091905056fe4f776e61626c653a206e6577206f776e657220697320746865207a65726f20616464726573734d65737361676554656d706c6174652f6e756d6265723a2076696577206d757374206265206f66207479706520412e20417474656d7074656420746f20696e646578206174206f666673657420307854797065644d656d566965772f696e646578202d20417474656d7074656420746f20696e646578206d6f7265207468616e20333220627974657354797065644d656d566965772f696e646578202d204f76657272616e2074686520766965772e20536c696365206973206174203078a2646970667358221220a55120a430f8626983ec5aca6faa293b987cf9159c6e977e23c051b2af07b10c64736f6c63430007060033496e697469616c697a61626c653a20636f6e747261637420697320616c726561647920696e697469616c697a6564";

export class RouterTemplate__factory extends ContractFactory {
  constructor(signer?: Signer) {
    super(_abi, _bytecode, signer);
  }

  deploy(
    _xAppConnectionManager: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<RouterTemplate> {
    return super.deploy(
      _xAppConnectionManager,
      overrides || {}
    ) as Promise<RouterTemplate>;
  }
  getDeployTransaction(
    _xAppConnectionManager: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(_xAppConnectionManager, overrides || {});
  }
  attach(address: string): RouterTemplate {
    return super.attach(address) as RouterTemplate;
  }
  connect(signer: Signer): RouterTemplate__factory {
    return super.connect(signer) as RouterTemplate__factory;
  }
  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): RouterTemplateInterface {
    return new utils.Interface(_abi) as RouterTemplateInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): RouterTemplate {
    return new Contract(address, _abi, signerOrProvider) as RouterTemplate;
  }
}
