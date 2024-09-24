// SPDX-License-Identifier: MIT or Apache-2.0
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {TypeCasts} from "../../contracts/libs/TypeCasts.sol";
import {StandardHookMetadata} from "../../contracts/hooks/libs/StandardHookMetadata.sol";
import {TestMailbox} from "../../contracts/test/TestMailbox.sol";
import {Message} from "../../contracts/libs/Message.sol";
import {MessageUtils} from "./IsmTestUtils.sol";
import {TestRecipient} from "../../contracts/test/TestRecipient.sol";
import {AbstractMessageIdAuthorizedIsm} from "../../contracts/isms/hook/AbstractMessageIdAuthorizedIsm.sol";
import {AbstractMessageIdAuthHook} from "../../contracts/hooks/libs/AbstractMessageIdAuthHook.sol";

abstract contract ExternalBridgeTest is Test {
    using TypeCasts for address;
    using MessageUtils for bytes;

    uint8 internal constant HYPERLANE_VERSION = 1;
    uint32 internal constant ORIGIN_DOMAIN = 1;
    uint32 internal constant DESTINATION_DOMAIN = 2;
    uint256 internal constant MAX_MSG_VALUE = 2 ** 255 - 1;
    uint256 internal GAS_QUOTE;

    TestMailbox internal originMailbox;
    TestRecipient internal testRecipient;

    AbstractMessageIdAuthHook internal hook;
    AbstractMessageIdAuthorizedIsm internal ism;

    bytes internal testMessage =
        abi.encodePacked("Hello from the other chain!");
    bytes internal testMetadata =
        StandardHookMetadata.overrideRefundAddress(address(this));
    bytes internal encodedMessage;
    bytes32 internal messageId;

    function setUp() public virtual {
        testRecipient = new TestRecipient();
        encodedMessage = _encodeTestMessage();
        messageId = Message.id(encodedMessage);
    }

    /* ============ hook.quoteDispatch ============ */

    function test_quoteDispatch() public view {
        assertEq(hook.quoteDispatch(testMetadata, encodedMessage), GAS_QUOTE);
    }

    /* ============ Hook.postDispatch ============ */

    function test_postDispatch() public {
        bytes memory encodedHookData = _encodeHookData(messageId);
        originMailbox.updateLatestDispatchedId(messageId);
        _expectOriginExternalBridgeCall(encodedHookData);

        hook.postDispatch{value: GAS_QUOTE}(testMetadata, encodedMessage);
    }

    function test_postDispatch_revertWhen_chainIDNotSupported() public {
        bytes memory message = originMailbox.buildOutboundMessage(
            3,
            TypeCasts.addressToBytes32(address(this)),
            testMessage
        );

        originMailbox.updateLatestDispatchedId(Message.id(message));
        vm.expectRevert(
            "AbstractMessageIdAuthHook: invalid destination domain"
        );
        hook.postDispatch(testMetadata, message);
    }

    function test_postDispatch_revertWhen_notLastDispatchedMessage() public {
        vm.expectRevert(
            "AbstractMessageIdAuthHook: message not latest dispatched"
        );
        hook.postDispatch(testMetadata, encodedMessage);
    }

    function test_postDispatch_revertWhen_tooMuchValue() public {
        vm.deal(address(this), uint256(MAX_MSG_VALUE + 1));
        bytes memory excessValueMetadata = StandardHookMetadata
            .overrideMsgValue(uint256(2 ** 255 + 1));

        originMailbox.updateLatestDispatchedId(messageId);
        vm.expectRevert(
            "AbstractMessageIdAuthHook: msgValue must be less than 2 ** 255"
        );
        hook.postDispatch(excessValueMetadata, encodedMessage);
    }

    /* ============ ISM.verifyMessageId ============ */

    function test_verifyMessageId_asyncCall() public {
        bytes memory encodedHookData = abi.encodeCall(
            AbstractMessageIdAuthorizedIsm.verifyMessageId,
            (messageId)
        );
        _externalBridgeDestinationCall(encodedHookData, 0);

        assertTrue(ism.isVerified(encodedMessage));
    }

    function test_verifyMessageId_externalBridgeCall() public virtual {
        bytes memory externalCalldata = _encodeExternalDestinationBridgeCall(
            address(hook),
            address(ism),
            0,
            messageId
        );

        assertTrue(ism.verify(externalCalldata, encodedMessage));
        assertTrue(ism.isVerified(encodedMessage));
    }

    /* ============ ISM.verify ============ */

    function test_verify_revertWhen_invalidMetadata() public virtual {
        vm.expectRevert();
        assertFalse(ism.verify(new bytes(0), encodedMessage));
    }

    function test_verify_msgValue_asyncCall() public virtual {
        bytes memory encodedHookData = _encodeHookData(messageId);
        _externalBridgeDestinationCall(encodedHookData, 1 ether);

        assertTrue(ism.verify(new bytes(0), encodedMessage));
        assertEq(address(testRecipient).balance, 1 ether);
    }

    function test_verify_msgValue_externalBridgeCall() public virtual {
        bytes memory externalCalldata = _encodeExternalDestinationBridgeCall(
            address(hook),
            address(ism),
            1 ether,
            messageId
        );
        ism.verify(externalCalldata, encodedMessage);
        assertEq(address(testRecipient).balance, 1 ether);
    }

    function test_verify_revertsWhen_invalidIsm() public virtual {
        bytes memory externalCalldata = _encodeExternalDestinationBridgeCall(
            address(hook),
            address(this),
            0,
            messageId
        );

        vm.expectRevert();
        assertFalse(ism.verify(externalCalldata, encodedMessage));
    }

    function test_verify_revertsWhen_notAuthorizedHook() public virtual {
        bytes memory unauthorizedHookErrorMsg = _setExternalOriginSender(
            address(this)
        );

        bytes memory externalCalldata = _encodeExternalDestinationBridgeCall(
            address(this),
            address(ism),
            0,
            messageId
        );

        // external call
        vm.expectRevert(unauthorizedHookErrorMsg);
        assertFalse(ism.verify(externalCalldata, encodedMessage));

        // async call vm.expectRevert(NotCrossChainCall.selector);
        vm.expectRevert();
        _externalBridgeDestinationCall(externalCalldata, 0);
        assertFalse(ism.isVerified(encodedMessage));
    }

    function test_verify_revertsWhen_incorrectMessageId() public virtual {
        bytes32 incorrectMessageId = keccak256("incorrect message id");
        bytes memory externalCalldata = _encodeExternalDestinationBridgeCall(
            address(hook),
            address(ism),
            0,
            incorrectMessageId
        );

        // external call
        vm.expectRevert();
        assertFalse(ism.verify(externalCalldata, encodedMessage));

        // async call - native bridges might have try catch block to prevent revert
        try
            this.externalBridgeDestinationCallWrapper(
                _encodeHookData(incorrectMessageId),
                0
            )
        {} catch {}
        assertFalse(ism.isVerified(testMessage));
    }

    /// forge-config: default.fuzz.runs = 10
    function test_verify_valueAlreadyClaimed(uint256 _msgValue) public virtual {
        _msgValue = bound(_msgValue, 0, MAX_MSG_VALUE);
        _externalBridgeDestinationCall(_encodeHookData(messageId), _msgValue);

        bool verified = ism.verify(new bytes(0), encodedMessage);
        assertTrue(verified);
        assertEq(address(ism).balance, 0);
        assertEq(address(testRecipient).balance, _msgValue);

        // send more value to the ISM
        vm.deal(address(ism), _msgValue);

        // verified still true
        verified = ism.verify(new bytes(0), encodedMessage);
        assertTrue(verified);
        // value which was already sent
        assertEq(address(ism).balance, _msgValue);
        assertEq(address(testRecipient).balance, _msgValue);
    }

    /* ============ helper functions ============ */

    function _encodeTestMessage() internal view returns (bytes memory) {
        return
            originMailbox.buildOutboundMessage(
                DESTINATION_DOMAIN,
                TypeCasts.addressToBytes32(address(testRecipient)),
                testMessage
            );
    }

    function _encodeHookData(
        bytes32 _messageId
    ) internal pure returns (bytes memory) {
        return
            abi.encodeCall(
                AbstractMessageIdAuthorizedIsm.verifyMessageId,
                (_messageId)
            );
    }

    // wrapper function needed for _externalBridgeDestinationCall because try catch cannot call an internal function
    function externalBridgeDestinationCallWrapper(
        bytes memory _encodedHookData,
        uint256 _msgValue
    ) external {
        _externalBridgeDestinationCall(_encodedHookData, _msgValue);
    }

    function _expectOriginExternalBridgeCall(
        bytes memory _encodedHookData
    ) internal virtual;

    function _externalBridgeDestinationCall(
        bytes memory _encodedHookData,
        uint256 _msgValue
    ) internal virtual;

    function _encodeExternalDestinationBridgeCall(
        address _from,
        address _to,
        uint256 _msgValue,
        bytes32 _messageId
    ) internal virtual returns (bytes memory);

    function _setExternalOriginSender(
        address _sender
    ) internal virtual returns (bytes memory) {}
}