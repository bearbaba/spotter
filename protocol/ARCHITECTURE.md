# Spotter Protocol Architecture — design specification, not a deployment

Goal: full verifiable work marketplace; no cosmetic minimum-viable-only cap. Delivery requires staged, testable boundaries.

## Trust separation
1. **WorkRegistry** records client/worker, milestones, immutable evidence policy digests and status.
2. **EvidenceOracle/ProofGate** enforces specific host, source ownership/identity, repository and criteria. AI-assisted qualitative verdict and deterministic metadata checks must be independently attributable.
3. **DisputeManager** allows challenges only from named participants within a finite window; authorized arbitrators, evidence finality, and a fail-safe REVIEW state need implementation.
4. **EscrowVault** has custody of locked assets and permits disjoint pull-based refunds/releases, replay protection, reentrancy controls, supported-token policy and amount accounting. This module is NOT IMPLEMENTED. Do not handle real funds.
5. **Reputation** derives from finalized, non-reversible audited events and deters self-dealing/Sybil attacks.
6. **Indexer/API/UX** is convenience only: cannot overrule on-chain decision or fabricate payment status.

## Domain transition model
`spotter-domain.mjs` is a PURE JavaScript executable state model, not a deployed contract or custodial escrow. It proves preliminary invariants in offline tests: worker cannot start unfunded work, client must fund, only worker submits, unknown accounts cannot challenge, OPEN disputes block settlement, and terminal PAID/REFUNDED cannot repeat.

### Important design gaps before ANY funds
- The model now enforces a bounded 1-hour to 7-day challenge window and blocks premature release/refund, but still lacks timeout/cancellation, a liveness path for disputes without an arbitrator response, and confirmation-depth handling. Verifier and arbitrator identities are explicit in the model, but caller authentication must be implemented in deployed contracts.
- Never assume an escrowed token can be transferred on GenLayer Studionet until token standard compatibility, wallet receipts and balances are tested.
- Locking/releasing funds MUST only happen on chain. These state transitions do not prove transfers or conservation of balances.
- An AI verdict is provisional until the dispute window closes and any challenge resolves. Implement that gate before escrow code.
- Risk of source drift/redirects, fake contributors, ambiguous requirements and manipulated AI evidence must be tested end to end.
- Public proof records should show policy version, source identity, verification time, finalization transaction, and outcome.

## Release rule
Do not deploy a funds-handling contract or advertise financial functionality until: GenVM validation, independent code audit, adversarial state tests, end-to-end testnet accounting, documented operator response to failures and full on-chain receipts.

## Challenge lifecycle (offline model only)
A verifier's ACCEPTED/REJECTED decision records `decidedAt`; settlement is blocked until `decidedAt + challengeSeconds` unless an authorized arbitrator resolves a participant challenge. Only the two named parties may challenge and challenges cannot be reopened. The window must be between one hour and seven days. The domain model uses caller-supplied timestamps and identity strings for unit testing; real contracts must derive identity and time from authenticated chain execution. Arbitration liveness, appeals and fund conservation remain unreleased work.
