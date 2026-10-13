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
- The model now enforces a bounded 1-hour to 7-day challenge window and blocks premature release/refund, now includes draft cancellation and a client-initiated refund eligibility path for funded work that was never started or submitted by the immutable deadline. It still lacks a deployed value-transfer mechanism, an independent fallback when parties cannot agree, and confirmation-depth handling. Verifier and arbitrator identities are explicit in the model, but caller authentication must be implemented in deployed contracts.
- Never assume an escrowed token can be transferred on GenLayer Studionet until token standard compatibility, wallet receipts and balances are tested.
- Locking/releasing funds MUST only happen on chain. These state transitions do not prove transfers or conservation of balances.
- An AI verdict is provisional until the dispute window closes and any challenge resolves. Implement that gate before escrow code.
- Risk of source drift/redirects, fake contributors, ambiguous requirements and manipulated AI evidence must be tested end to end.
- Public proof records should show policy version, source identity, verification time, finalization transaction, and outcome.

## Release rule
Do not deploy a funds-handling contract or advertise financial functionality until: GenVM validation, independent code audit, adversarial state tests, end-to-end testnet accounting, documented operator response to failures and full on-chain receipts.

## Challenge lifecycle (offline model only)
A verifier's ACCEPTED/REJECTED decision records `decidedAt`; settlement is blocked until `decidedAt + challengeSeconds` unless an authorized arbitrator resolves a participant challenge. Only the two named parties may challenge and challenges cannot be reopened. The window must be between one hour and seven days. The domain model uses caller-supplied timestamps and identity strings for unit testing; real contracts must derive identity and time from authenticated chain execution. On arbitration expiry, either party can enter TIMEOUT, but no party can unilaterally award or refund funds: the client must propose ACCEPTED or REJECTED and the worker must independently confirm (or vice versa). If either party refuses or is unavailable, funds remain locked. This is deliberately fail-closed, not a complete liveness solution. A production-grade independent fallback dispute mechanism, appeals and real fund conservation remain unreleased work.

## Non-negotiable limitations of fallback (October 2026)
The timeout model deliberately prefers **no unauthorized transfer** to a potentially unfair default payout. This is not sufficient for real custody: two uncooperative parties can deadlock even after the arbitrator misses a deadline. Before assets may be entrusted to Spotter, design, test and independently review an explicit additional arbitration/fallback path with bounded authority and timelocks. The test model consumes a caller-supplied `now`; an actual contract must rely on authenticated chain time or a trusted and documented time source. Tests do not authorize live fund transfer.


## Deadline and cancellation policy (offline model; added October 13, 2026)
- `CANCEL_DRAFT` is a client-only, terminal action allowed only before funding; there is no refund claim because the escrow was never funded.
- `EXPIRE_UNSTARTED` is client-only, strictly after the signed milestone deadline, if funded work has not started.
- `EXPIRE_UNSUBMITTED` is client-only, strictly after the deadline, if work has started but the worker has not submitted. This makes the deadline a firm submission cutoff, not a grace period.
- Both expiry paths make escrow `REFUNDABLE` but do **not** move tokens; only a subsequent client-specific `REFUND_CONFIRMED` models final refund accounting. Once submitted by the deadline, expiry is unavailable even if verification is delayed.
- These actions rely on the immutable milestone deadline and actor/time arguments in offline tests; an eventual on-chain implementation must derive both from authenticated execution, make any intended grace period explicit, and verify actual balance changes before reporting funds returned.
- Cancellation after submission, administrator emergency controls, fees, partial payments, chain reorganization and custody risk remain future protocol work. Never label this model as production escrow.

## Escrow accounting specification (offline, October 2026)
`escrow-accounting.mjs` implements a **pure BigInt bookkeeping model** separate from the work state machine. It does not transfer or custody assets. Conservation invariant: `deposited = withdrawn + locked + outstandingClaims`; release and refund outcomes are mutually exclusive, a milestone is deposited once, recipients have pull-based claims and cannot overdraw. The associated `tests/escrow-accounting.test.mjs` covers conservation, partial withdrawals, duplicate settlements, malformed amounts, tampered ledgers and multi-milestone claims.

**Integration is not complete.** In particular, `recordDeposit`, `authorizeClaim`, and `recordWithdrawal` must never be exposed as externally trusted accounting commands without validated actual chain receipts and an authorized state-transition proof. A production contract needs authenticated actors, stable asset identity, balance-delta checks (including non-standard transfer behaviors), atomic state updates, reentrancy protection, replay/chain binding, finality/reorg handling and a security audit. The JavaScript Map snapshots are not immutable to a caller that deliberately mutates them, so this module is for test specifications only.

## Integrated sandbox protocol engine (October 13, 2026)
`protocol/spotter-engine.mjs` composes the lifecycle state machine with the separate ledger model; `tests/spotter-engine.test.mjs` exercises funding, submission, verification, dispute, deadline refund and withdrawal paths. Operations use copy-on-write snapshots and only update the ledger after valid lifecycle transitions. A settlement creates a claim; it does not represent a token transfer.

**Security boundary:** `execute` and `withdrawClaim` are **simulation APIs**, not authenticated endpoints. Their `actor`, `now`, and `depositUnits` arguments are caller-supplied. A trusted chain adapter MUST verify actual deposit/withdraw receipts, asset addresses, recipient, chain, transaction finality and amount; must never infer a deposit merely from `FUND_CONFIRMED` input. There is no implemented chain adapter yet, and no website should expose this simulation as funds custody. Live-ready status remains blocked pending concrete smart contracts, permissioned consensus integration, token mechanics, audit and on-chain E2E tests.
