// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.13;

// ============ Internal Imports ============
import {OwnableMulticall, Call} from "../OwnableMulticall.sol";
import {Router} from "../Router.sol";
import {IInterchainAccountRouter} from "../../interfaces/IInterchainAccountRouter.sol";
import {MinimalProxy} from "../libs/MinimalProxy.sol";

// ============ External Imports ============
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/*
 * @title The Hello World App
 * @dev You can use this simple app as a starting point for your own application.
 */
contract InterchainAccountRouter is Router, IInterchainAccountRouter {
    address public implementation;

    event InterchainAccountCreated(
        uint32 indexed origin,
        address sender,
        address account
    );

    function initialize(
        address _mailbox,
        address _interchainGasPaymaster,
        address _interchainSecurityModule
    ) public initializer {
        // Transfer ownership of the contract to `msg.sender`
        __HyperlaneConnectionClient_initialize(
            _mailbox,
            _interchainGasPaymaster,
            _interchainSecurityModule
        );
        implementation = address(new OwnableMulticall());
    }

    function dispatch(uint32 _destinationDomain, Call[] calldata calls)
        external
        returns (bytes32)
    {
        return _dispatch(_destinationDomain, abi.encode(msg.sender, calls));
    }

    function dispatch(
        uint32 _destinationDomain,
        address target,
        bytes calldata data
    ) external returns (bytes32) {
        Call[] memory calls = new Call[](1);
        calls[0] = Call({to: target, data: data});
        return _dispatch(_destinationDomain, abi.encode(msg.sender, calls));
    }

    function getInterchainAccount(uint32 _origin, address _sender)
        public
        view
        returns (address)
    {
        bytes memory bytecode = MinimalProxy.bytecode(implementation);
        return _getInterchainAccount(_salt(_origin, _sender), bytecode);
    }

    function getDeployedInterchainAccount(uint32 _origin, address _sender)
        public
        returns (OwnableMulticall)
    {
        bytes32 salt = _salt(_origin, _sender);
        bytes memory bytecode = MinimalProxy.bytecode(implementation);
        address interchainAccount = _getInterchainAccount(salt, bytecode);
        if (!Address.isContract(interchainAccount)) {
            interchainAccount = Create2.deploy(0, salt, bytecode);
            OwnableMulticall(interchainAccount).initialize();
            emit InterchainAccountCreated(_origin, _sender, interchainAccount);
        }
        return OwnableMulticall(interchainAccount);
    }

    function _salt(uint32 _origin, address _sender)
        internal
        pure
        returns (bytes32)
    {
        return bytes32(abi.encodePacked(_origin, _sender));
    }

    function _getInterchainAccount(bytes32 salt, bytes memory bytecode)
        internal
        view
        returns (address)
    {
        bytes32 bytecodeHash = keccak256(bytecode);
        return Create2.computeAddress(salt, bytecodeHash);
    }

    function _handle(
        uint32 _origin,
        bytes32, // router sender
        bytes calldata _message
    ) internal override {
        (address sender, Call[] memory calls) = abi.decode(
            _message,
            (address, Call[])
        );
        getDeployedInterchainAccount(_origin, sender).proxyCalls(calls);
    }
}
