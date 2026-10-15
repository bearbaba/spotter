# Spotter V3 — GitHub work and transaction safety

Spotter uses a GenLayer Intelligent Contract for verifiable GitHub contribution
acceptance. Its browser is not an authority for certification.

## Real lifecycle

1. A creator locks a specific GitHub PR, target repository and branch,
   contributor wallet, optional label, and acceptance criteria on-chain.
   New Work is **OPEN**.
2. The nominated contributor signs **submit_for_review**. Work is **SUBMITTED**.
   The PR may still be unmerged when the agreement is created.
3. The PR must merge into the locked target branch. GenLayer verifies the
   GitHub evidence and qualitatively checks PR text against the rubric.
   **evaluate** may yield ACCEPTED, REVIEW, or REJECTED.
4. A creator or the contributor may issue a certificate for ACCEPTED work,
   resulting in **CERTIFIED**. No GEN payment or escrow occurs.

## Receipt security

- Transaction FINALIZED is a consensus status, not execution success. GenVM
  return/error information must be checked independently.
- Receipt identity must agree with the transaction hash and, when supplied,
  signer and contract address.
- Fresh finalized Work readback verifies its state, but never retroactively
  proves that an ambiguous transaction receipt succeeded.
- An unresolved action blocks resending that action. Different subsequent
  actions require a valid on-chain Work state and wallet authorization.
- REVIEW → REVIEW does not prove that an evaluation retry finished.
- Keep unresolved hashes for later read-only Explorer inspection.

The deterministic checks in
`tests/recording-evidence-invariants.test.mjs` cover PR source identity,
OPEN/SUBMITTED/REVIEW/ACCEPTED/CERTIFIED transition guards, receipt finality
versus GenVM success/failure, hash isolation, Work ID readback, wallet-network
validation and replay prevention.

```bash
npm run verify
```

Tests are not substitutes for an actual GenLayer Explorer receipt and V3
`get_work` readback. Official V3 Studionet contract:
`0x506205eBc1ba011707D63d8a152625baaC63002D`.
