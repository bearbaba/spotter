// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SpotterEscrow - testnet-only, native GEN milestone custody.
/// @notice ProofGate relay is NOT wired in: trusted verifier sets provisional outcomes.
/// @dev Do not deploy with real-value deposits until independent audit and finality adapter.
contract SpotterEscrow {
    enum Status { None, Funded, Active, Submitted, Accepted, Rejected, Disputed, Releasable, Refundable, Paid, Refunded }
    struct Milestone {
        address client;
        address worker;
        address verifier;
        address arbitrator;
        uint128 amount;
        uint64 deadline;
        uint64 decidedAt;
        uint64 disputedAt;
        uint64 challengeWindow;
        uint64 arbitrationWindow;
        bytes32 policyHash;
        Status status;
    }
    mapping(bytes32 => Milestone) public milestones;
    mapping(address => uint256) public claimable;
    uint256 public lockedTotal;
    uint256 public outstandingClaims;
    uint256 private withdrawing;
    event Funded(bytes32 indexed id, address indexed client, address indexed worker, uint256 amount);
    event StateChanged(bytes32 indexed id, Status status);
    event ClaimAccrued(bytes32 indexed id, address indexed recipient, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);

    error Unauthorized();
    error InvalidState();
    error InvalidInput();
    error InvalidTime();
    error TransferFailed();

    modifier nonReentrant() {
        if (withdrawing != 0) revert InvalidState();
        withdrawing = 1;
        _;
        withdrawing = 0;
    }

    function fund(
        bytes32 id, address worker, address verifier, address arbitrator,
        uint64 deadline, uint64 challengeWindow, uint64 arbitrationWindow, bytes32 policyHash
    ) external payable {
        if (
            id == bytes32(0) || milestones[id].status != Status.None ||
            msg.value == 0 || msg.value > type(uint128).max ||
            worker == address(0) || verifier == address(0) || arbitrator == address(0) ||
            worker == msg.sender || verifier == msg.sender || arbitrator == msg.sender ||
            verifier == worker || arbitrator == worker || arbitrator == verifier ||
            policyHash == bytes32(0) || deadline <= block.timestamp ||
            challengeWindow < 1 hours || challengeWindow > 7 days ||
            arbitrationWindow < 1 days || arbitrationWindow > 30 days
        ) revert InvalidInput();
        milestones[id] = Milestone({
            client: msg.sender, worker: worker, verifier: verifier, arbitrator: arbitrator,
            amount: uint128(msg.value), deadline: deadline, decidedAt: 0, disputedAt: 0,
            challengeWindow: challengeWindow, arbitrationWindow: arbitrationWindow,
            policyHash: policyHash, status: Status.Funded
        });
        lockedTotal += msg.value;
        emit Funded(id, msg.sender, worker, msg.value);
    }

    function start(bytes32 id) external {
        Milestone storage m = milestones[id];
        if (msg.sender != m.worker) revert Unauthorized();
        if (m.status != Status.Funded || block.timestamp > m.deadline) revert InvalidState();
        m.status = Status.Active;
        emit StateChanged(id, m.status);
    }

    function submit(bytes32 id) external {
        Milestone storage m = milestones[id];
        if (msg.sender != m.worker) revert Unauthorized();
        if (m.status != Status.Active) revert InvalidState();
        if (block.timestamp > m.deadline) revert InvalidTime();
        m.status = Status.Submitted;
        emit StateChanged(id, m.status);
    }

    /// @notice Permissioned manual verifier until a finality-proven GenLayer adapter exists.
    function verdict(bytes32 id, bool accepted) external {
        Milestone storage m = milestones[id];
        if (msg.sender != m.verifier) revert Unauthorized();
        if (m.status != Status.Submitted) revert InvalidState();
        m.status = accepted ? Status.Accepted : Status.Rejected;
        m.decidedAt = uint64(block.timestamp);
        emit StateChanged(id, m.status);
    }

    function challenge(bytes32 id) external {
        Milestone storage m = milestones[id];
        if (msg.sender != m.client && msg.sender != m.worker) revert Unauthorized();
        if (m.status != Status.Accepted && m.status != Status.Rejected) revert InvalidState();
        if (block.timestamp >= uint256(m.decidedAt) + m.challengeWindow) revert InvalidTime();
        m.status = Status.Disputed;
        m.disputedAt = uint64(block.timestamp);
        emit StateChanged(id, m.status);
    }

    function arbitrate(bytes32 id, bool accepted) external {
        Milestone storage m = milestones[id];
        if (msg.sender != m.arbitrator) revert Unauthorized();
        if (m.status != Status.Disputed) revert InvalidState();
        if (block.timestamp >= uint256(m.disputedAt) + m.arbitrationWindow) revert InvalidTime();
        m.status = accepted ? Status.Accepted : Status.Rejected;
        // Resolved cases cannot be re-challenged. Settle immediately through finalize.
        m.decidedAt = 0;
        emit StateChanged(id, m.status);
    }

    function finalize(bytes32 id) external {
        Milestone storage m = milestones[id];
        if (m.status != Status.Accepted && m.status != Status.Rejected) revert InvalidState();
        if (m.decidedAt != 0 && block.timestamp < uint256(m.decidedAt) + m.challengeWindow) revert InvalidTime();
        bool accepted = m.status == Status.Accepted;
        _accrue(id, m, accepted);
    }

    /// @notice Only the client can refund work never submitted after the hard deadline.
    function expire(bytes32 id) external {
        Milestone storage m = milestones[id];
        if (msg.sender != m.client) revert Unauthorized();
        if (m.status != Status.Funded && m.status != Status.Active) revert InvalidState();
        if (block.timestamp <= m.deadline) revert InvalidTime();
        _accrue(id, m, false);
    }

    function _accrue(bytes32 id, Milestone storage m, bool accepted) private {
        uint256 amount = m.amount;
        address recipient = accepted ? m.worker : m.client;
        m.status = accepted ? Status.Releasable : Status.Refundable;
        lockedTotal -= amount;
        outstandingClaims += amount;
        claimable[recipient] += amount;
        emit StateChanged(id, m.status);
        emit ClaimAccrued(id, recipient, amount);
    }

    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert InvalidState();
        claimable[msg.sender] = 0;
        outstandingClaims -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Native GEN held by the vault must cover all liabilities.
    function solvent() external view returns (bool) {
        return address(this).balance >= lockedTotal + outstandingClaims;
    }
}
