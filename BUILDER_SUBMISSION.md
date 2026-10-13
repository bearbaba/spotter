# Spotter V2 — Builder submission package

## Copy-ready submission (English)

**Project:** Spotter V2 — Verifiable Work on GenLayer

**Problem:** Online contract work is often evaluated manually. A completed pull request, a clear acceptance policy, and an enforceable record of the outcome should be verifiable rather than dependent on screenshots or a single reviewer.

**Solution:** Spotter V2's ProofGate Intelligent Contract locks the GitHub repository, target branch, pull-request number, worker and acceptance rubric into an on-chain work record. The worker submits the work; GenLayer retrieves evidence from the GitHub API, checks the merged PR and locked policy under strict consensus, and evaluates the remaining qualitative requirements. Accepted work can then receive an on-chain certification.

**What we shipped and actually tested:** A deployed ProofGate V2 on GenLayer Studio successfully completed OPEN → SUBMITTED → ACCEPTED → CERTIFIED for Work #1, referencing merged `bearbaba/spotter` PR #24. The issuance call `issue_acceptance("1")` finalized successfully under Normal execution with accepted consensus and GenVM SUCCESS. The recorded certification moved 0 GEN; it is proof of work acceptance, not payment.

**Why GenLayer matters:** The contract evaluates current public GitHub evidence and combines deterministic repository/merge policy checks with a consensus-backed qualitative rubric. Work metadata and the acceptance result are stored in the GenLayer contract rather than asserted by a frontend.

**Repository:** https://github.com/bearbaba/spotter
**V2 development PR and tests:** https://github.com/bearbaba/spotter/pull/25
**Deployed V2 contract:** https://studio.genlayer.com/?import-contract=0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7
**Finalized certificate transaction:** https://explorer-studio.genlayer.com/tx/0xc3d1a5c2611111a8763d74582c07c75bdb8f4694a89f6363e3fabca933107599
**Evidence source:** https://github.com/bearbaba/spotter/pull/24
**V2 web preview:** https://github.com/bearbaba/spotter/blob/feat/proofgate-v2-contract-foundation/v2/index.html

**Current limitations:** The escrow Solidity code and marketplace UI remain prototypes. There is no validated GenLayer-to-EVM settlement bridge, live marketplace indexing or verified payment deployment. No real-money transfers are promised. Independent wallets, negative on-chain tests and source/deployment matching are still outstanding.

## Video demo script (~2–3 minutes)

1. **0:00–0:20 — Introduce the problem.** Show the repository and explain why proof of work should be assessed against requirements agreed in advance.
2. **0:20–0:45 — Show the code.** Open `contracts/proofgate_v2.py`. Highlight locked repo/branch/PR/rubric and the GitHub merge guard followed by the qualitative GenLayer check.
3. **0:45–1:10 — Show the real contract.** Open the deployed Studio contract at `0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7`, then invoke read-only `get_work("1")`. Confirm state `CERTIFIED`, PR #24, merge commit and evidence digest.
4. **1:10–1:35 — Show finalized consensus.** Open the Explorer issuance transaction. Point out `To` matches the deployed V2 contract, `Method=issue_acceptance`, argument `1`, status `FINALIZED`, `Execution Result=SUCCESS` and `Consensus Result=Accepted`.
5. **1:35–1:55 — Show GitHub evidence.** Open PR #24 and match the Studionet MetaMask installation details with the locked acceptance rubric.
6. **1:55–2:20 — Show test coverage.** Open PR #25 and its successful CI checks; briefly describe policy/authorization edge cases and the Foundry escrow prototype tests.
7. **2:20–2:40 — Honest scope.** Show the V2 web preview with the recorded proof card; say the certification path is live, but escrow, indexing and automatic payment are not yet wired or production-ready.
8. **2:40–3:00 — Close.** Reiterate that certification is on-chain and verified by GenLayer; payment integration is the next milestone.

**Recording rule:** Do not present older contract addresses as the certified instance. Do not replay write transactions merely for video. Read-only `get_work`, the Explorer receipt and GitHub source are enough to demonstrate this completed run.

## Reviewer evidence checklist

- [x] Named public repository and GitHub PR evidence
- [x] V2 Studio deployed address supplied
- [x] On-chain readback of `CERTIFIED` supplied for Work #1
- [x] Finalized successful certificate-issuance receipt details supplied
- [x] Rubric explanation, merge commit and digest recorded
- [x] Python/JS and Solidity CI workflow results passed for the V2 submission branch before this documentation update
- [ ] Independently match deployed source byte-for-byte with this branch
- [ ] Attach hashes for earlier work creation, submission and successful evaluation **on the certified instance**
- [ ] Record adversarial live cases with separate wallets
- [ ] Authenticated cross-chain settlement and live testnet payment

## Exact recorded evidence

- Contract: `0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7`
- Work: `1`, final state: `CERTIFIED`
- PR: `bearbaba/spotter#24`, target: `main`
- Merge commit: `080afca461de824fa7d1bf173f73c4b4df3c349e`
- Evidence digest: `e3a62a3c772e33717d5a01d7b08d987e43460d843961f872fb7cbffc3073ff6c`
- Certification tx: `0xc3d1a5c2611111a8763d74582c07c75bdb8f4694a89f6363e3fabca933107599`
- Method: `issue_acceptance` with parameter `1`
- Explorer: `FINALIZED`, `SUCCESS`, consensus `Accepted`; value `0 GEN`
- Provenance: Studio readback and Explorer details copied by the operator; external direct retrieval and deployed-source parity remain to be checked.
