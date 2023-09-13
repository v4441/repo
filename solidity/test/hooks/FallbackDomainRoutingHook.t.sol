// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

import {TypeCasts} from "../../contracts/libs/TypeCasts.sol";
import {MessageUtils} from "../isms/IsmTestUtils.sol";
import {TestMailbox} from "../../contracts/test/TestMailbox.sol";
import {ConfigFallbackDomainRoutingHook} from "../../contracts/hooks/ConfigFallbackDomainRoutingHook.sol";
import {TestPostDispatchHook} from "../../contracts/test/TestPostDispatchHook.sol";
import {TestRecipient} from "../../contracts/test/TestRecipient.sol";

contract FallbackDomainRoutingHookTest is Test {
    using TypeCasts for address;
    ConfigFallbackDomainRoutingHook internal fallbackHook;
    TestPostDispatchHook internal configuredTestPostDispatchHook;
    TestPostDispatchHook internal mailboxDefaultHook;
    TestRecipient internal testRecipient;
    TestMailbox internal mailbox;

    uint32 internal constant TEST_ORIGIN_DOMAIN = 1;
    uint32 internal constant TEST_DESTINATION_DOMAIN = 2;
    bytes internal testMessage;

    event PostDispatchHookCalled();

    function setUp() public {
        mailbox = new TestMailbox(TEST_ORIGIN_DOMAIN);
        configuredTestPostDispatchHook = new TestPostDispatchHook();
        mailboxDefaultHook = new TestPostDispatchHook();
        testRecipient = new TestRecipient();
        fallbackHook = new ConfigFallbackDomainRoutingHook(address(mailbox));
        testMessage = _encodeTestMessage();
        mailbox.setDefaultHook(address(mailboxDefaultHook));
    }

    /* ============ hook.quoteDispatch ============ */

    function test_quoteDispatchHook_configured() public {
        fallbackHook.setHook(
            TEST_DESTINATION_DOMAIN,
            address(testRecipient).addressToBytes32(),
            configuredTestPostDispatchHook
        );

        vm.expectCall(
            address(configuredTestPostDispatchHook),
            abi.encodeCall(
                configuredTestPostDispatchHook.quoteDispatch,
                ("", testMessage)
            )
        );
        assertEq(fallbackHook.quoteDispatch("", testMessage), 25000);
    }

    function test_quoteDispatch_default() public payable {
        vm.expectCall(
            address(mailboxDefaultHook),
            abi.encodeCall(mailboxDefaultHook.quoteDispatch, ("", testMessage))
        );
        fallbackHook.quoteDispatch("", testMessage);
    }

    /* ============ hook.postDispatch ============ */

    function test_postDispatchHook_configured() public payable {
        fallbackHook.setHook(
            TEST_DESTINATION_DOMAIN,
            address(testRecipient).addressToBytes32(),
            configuredTestPostDispatchHook
        );

        vm.expectCall(
            address(configuredTestPostDispatchHook),
            abi.encodeCall(
                configuredTestPostDispatchHook.postDispatch,
                ("", testMessage)
            )
        );
        fallbackHook.postDispatch{value: msg.value}("", testMessage);
    }

    function test_postDispatch_default() public payable {
        vm.expectCall(
            address(mailboxDefaultHook),
            abi.encodeCall(mailboxDefaultHook.postDispatch, ("", testMessage))
        );

        fallbackHook.postDispatch{value: msg.value}("", testMessage);
    }

    function _encodeTestMessage() internal view returns (bytes memory) {
        return
            MessageUtils.formatMessage(
                uint8(0), // version
                uint32(1), // nonce
                TEST_ORIGIN_DOMAIN,
                address(this).addressToBytes32(),
                TEST_DESTINATION_DOMAIN,
                address(testRecipient).addressToBytes32(),
                abi.encodePacked("Hello from the other chain!")
            );
    }
}
