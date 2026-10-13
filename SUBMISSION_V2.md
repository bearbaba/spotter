# Spotter V2 — Submission and verification dossier

**Status: engineering candidate, NOT a deployed or audited payment product.**
Repository: https://github.com/bearbaba/spotter
Development pull request: https://github.com/bearbaba/spotter/pull/25
Source branch: `feat/proofgate-v2-contract-foundation`

## What can be reviewed now
- GenLayer Python Intelligent Contract prototype in `contracts/proofgate_v2.py`: immutable GitHub PR evidence policy and source validation; local Python policy tests.
- Solidity native GEN escrow prototype in `contracts/evm/SpotterEscrow.sol`: funds accounting, challenge windows, permissioned manual verdict, client deadline refund, pull withdrawals, and two-party timeout agreement.
- Foundry negative regression suite `tests/evm/SpotterEscrow.t.sol`; run `forge build && forge test -vvv`.
- JS milestone and conservation specifications under `protocol/`; run `npm run verify`.
- Clearly marked non-financial V2 user-interface preview at `v2/index.html`.

## Non-negotiable remaining requirements before claiming an on-chain product
1. **Positive lifecycle observed:** a newer ProofGate V2 Studio instance returned Work ID `1` with state `CERTIFIED` after `create_work`, `submit_for_review`, `evaluate`, and `issue_acceptance`, as reported via `get_work`. The latest deployment address and finalized transaction hashes are still needed to independently link and verify this claim. Earlier `0x87E73676c37c1fb506126c12DF49FA22E3CB8867` only has the separately linked finalized `create_work` evidence below.
2. Perform one authentic positive and one negative verification with independent wallets and recorded finalized transaction references.
3. Wire a verified GenVM finality proof into the EVM contract. **Manual verifier signer is not GenLayer consensus.** Until then do not describe payment as automated by AI consensus.
4. Deploy the Solidity vault only with test assets on a confirmed compatible chain; record address, chain ID, compiler/artifact hash, test transaction receipts, balances, double-withdrawal rejection, and failure cases.
5. Independently audit escrow authorization, dispute deadlocks, gas/DoS behavior, finality/reorg conditions and operational controls before accepting real-value funds.
6. Replace the V2 marketplace preview fixtures with authenticated indexer reads and backed transaction receipts. A preview screenshot does not prove a live work market.
7. Supply the actual video showing deployed V2 behavior and all URLs, transaction IDs, network configuration and evidence to the submission reviewer.

## Honest submission summary (editable after genuine testnet evidence exists)
Spotter V2 is rebuilding web-evidence verification into a milestone-based, dispute-aware work protocol. The repo provides GenLayer ProofGate V2 source and adversarial tests, a Foundry-tested native-asset escrow prototype, JS state/accounting models and a responsive preview. The payment architecture is **not yet deployed end-to-end**: the bridge between finalized GenLayer outcomes and Solidity escrow remains a required security milestone. This repository is offered as verifiable implementation progress, not a representation of completed real-money custody.

## Commands
```bash
npm run verify
forge build
forge test -vvv
python3 -m unittest discover -s tests -p 'test_proofgate*.py' -v
```

## Video checklist
- Open GitHub at PR #25 and show green JS/Python and Solidity CI tied to a concrete SHA.
- Explain difference between existing V1 historical Explorer and undeployed V2 ProofGate.
- Show actual V2 Studio deployment and finalized transactions **only if performed**.
- Walk through Solidity tests and clearly identify the manual verifier trust model.
- Show V2 preview as preview; do not imply the sample marketplace is live.
- State the remaining finality bridge and production security blockers.

## Security caveat about arbitration liveness
Timeout proposals require both named parties; a non-cooperating counterparty can still leave assets locked. This is intentional fail-closed behavior and **not** a complete, audited fallback arbitration design.

## On-chain evidence — October 13, 2026
- Contract: `0x87E73676c37c1fb506126c12DF49FA22E3CB8867`
- Transaction: https://explorer-studio.genlayer.com/tx/0x65b86d44151be68adc9459702763916f642d7678d6c4953eb82a7ac208b955fe
- Status: **FINALIZED**, consensus **Accepted**, GenVM execution **SUCCESS**.
- Method: `create_work` for `bearbaba/spotter` PR #24 targeting `main`; work ID returned `"1"`.
- Transaction value: 0 GEN. This demonstrates work registration, **not** escrow funding or proof acceptance.
- A subsequent V2 instance reportedly completed the full positive lifecycle to `CERTIFIED`; see the record below. Still required: transaction links for each finalization, negative authorization tests, and an authenticated escrow bridge.

## Positive ProofGate V2 lifecycle — user-reported Studio readback (October 13, 2026)
- Latest `get_work("1")` output: `state = "CERTIFIED"`, for `bearbaba/spotter` merged PR #24 targeting `main`.
- Merge commit: `080afca461de824fa7d1bf173f73c4b4df3c349e`.
- Evidence digest: `e3a62a3c772e33717d5a01d7b08d987e43460d843961f872fb7cbffc3073ff6c`.
- Rubric result reports concrete Studionet MetaMask network configuration (RPC endpoint, chain ID, explicit user approval).
- This readback is **user-supplied evidence**. User identified final Studio contract as `0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7`, but issuance transaction-to-contract linkage and source-to-deployment match have not yet been independently verified; do not cite earlier instance addresses as this certified instance.
- `CERTIFIED` represents work verification, **not** an escrow deposit, payment, or audited automatic disbursement.

### Submitted transaction link awaiting Explorer confirmation
- User-provided transaction URL: https://explorer-studio.genlayer.com/tx/0xc3d1a5c2611111a8763d74582c07c75bdb8f4694a89f6363e3fabca933107599
- User-supplied latest Studio contract: https://studio.genlayer.com/?import-contract=0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7\n- Verification pending: Explorer details could not be fetched automatically; confirm `To` matches `0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7`, `Method` is `issue_acceptance`, `Status` is FINALIZED, and GenVM execution is SUCCESS before labeling this transaction an on-chain certificate issuance.
