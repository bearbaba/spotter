// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../../contracts/evm/SpotterEscrow.sol";

interface Vm {
    function prank(address) external;
    function deal(address, uint256) external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
}
contract SpotterEscrowTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    SpotterEscrow vault;
    address constant CLIENT = address(0xA11CE);
    address constant WORKER = address(0xB0B);
    address constant VERIFIER = address(0xC0DE);
    address constant ARBITRATOR = address(0xD00D);
    bytes32 constant ID = keccak256("milestone-1");
    uint64 constant CHALLENGE = 1 hours;
    uint64 constant ARBITRATION = 1 days;

    function setUp() public {
        vault = new SpotterEscrow();
        vm.warp(100000);
        vm.deal(CLIENT, 10 ether);
        vm.deal(WORKER, 0);
    }
    function fund() internal {
        vm.prank(CLIENT);
        vault.fund{value: 1 ether}(ID, WORKER, VERIFIER, ARBITRATOR, 101000, CHALLENGE, ARBITRATION, keccak256("policy"));
    }
    function submit() internal {
        fund();
        vm.prank(WORKER); vault.start(ID);
        vm.prank(WORKER); vault.submit(ID);
    }
    function testHappyPathAndNoDoublePayment() public {
        submit();
        vm.prank(VERIFIER); vault.verdict(ID, true);
        vm.expectRevert(SpotterEscrow.InvalidTime.selector); vault.finalize(ID);
        vm.warp(block.timestamp + CHALLENGE);
        vault.finalize(ID);
        require(vault.solvent(), "insolvent");
        require(vault.claimable(WORKER) == 1 ether, "wrong payout");
        vm.prank(WORKER); vault.withdraw();
        require(WORKER.balance == 1 ether, "missing withdrawal");
        require(vault.claimable(WORKER) == 0, "claim remains");
        vm.expectRevert(SpotterEscrow.InvalidState.selector); vault.finalize(ID);
        vm.prank(WORKER);
        vm.expectRevert(SpotterEscrow.InvalidState.selector);
        vault.withdraw();
    }
    function testRejectRefundsClient() public {
        submit();
        vm.prank(VERIFIER); vault.verdict(ID, false);
        vm.warp(block.timestamp + CHALLENGE);
        vault.finalize(ID);
        require(vault.claimable(CLIENT) == 1 ether, "refund missing");
        require(vault.claimable(WORKER) == 0, "worker claim");
    }
    function testChallengeBlocksAndArbitrationFinalizes() public {
        submit();
        vm.prank(VERIFIER); vault.verdict(ID, true);
        vm.prank(CLIENT); vault.challenge(ID);
        vm.warp(block.timestamp + CHALLENGE + 1);
        vm.expectRevert(SpotterEscrow.InvalidState.selector); vault.finalize(ID);
        vm.prank(ARBITRATOR); vault.arbitrate(ID, false);
        vm.prank(WORKER);
        vm.expectRevert(SpotterEscrow.InvalidTime.selector);
        vault.challenge(ID);
        vault.finalize(ID);
        require(vault.claimable(CLIENT) == 1 ether, "ruling not applied");
    }
    function testUnauthorizedVerdictAndArbitrationFail() public {
        submit();
        vm.prank(WORKER);
        vm.expectRevert(SpotterEscrow.Unauthorized.selector);
        vault.verdict(ID, true);
        vm.prank(VERIFIER); vault.verdict(ID, true);
        vm.prank(WORKER); vault.challenge(ID);
        vm.prank(CLIENT);
        vm.expectRevert(SpotterEscrow.Unauthorized.selector);
        vault.arbitrate(ID, false);
    }
    function testExpiredUnsubmittedWorkRefunds() public {
        fund();
        vm.warp(101001);
        vm.prank(CLIENT); vault.expire(ID);
        require(vault.claimable(CLIENT) == 1 ether, "expiration refund missing");
        vm.prank(WORKER);
        vm.expectRevert(SpotterEscrow.InvalidState.selector);
        vault.start(ID);
    }
    function testLateSubmissionRejected() public {
        fund();
        vm.prank(WORKER); vault.start(ID);
        vm.warp(101001);
        vm.prank(WORKER);
        vm.expectRevert(SpotterEscrow.InvalidTime.selector);
        vault.submit(ID);
    }
    function testDuplicateDepositRejected() public {
        fund();
        vm.prank(CLIENT);
        vm.expectRevert(SpotterEscrow.InvalidInput.selector);
        vault.fund{value: 1 ether}(ID, WORKER, VERIFIER, ARBITRATOR, 101000, CHALLENGE, ARBITRATION, keccak256("policy"));
    }
    function testUnresolvedDisputeFailsClosed() public {
        submit();
        vm.prank(VERIFIER); vault.verdict(ID, true);
        vm.prank(CLIENT); vault.challenge(ID);
        vm.warp(block.timestamp + ARBITRATION);
        vm.prank(ARBITRATOR);
        vm.expectRevert(SpotterEscrow.InvalidTime.selector);
        vault.arbitrate(ID, true);
        vm.expectRevert(SpotterEscrow.InvalidState.selector);
        vault.finalize(ID);
    }
}
