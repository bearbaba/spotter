# Spotter — GenLayer work verification and evidence policy

**Official website:** https://bearbaba.github.io/spotter/  
**Network:** GenLayer Studionet (chain ID 61999)  
**ProofGate V2 contract:** `0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7`  
**Studio:** https://studio.genlayer.com/?import-contract=0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7  
**Certificate transaction:** https://explorer-studio.genlayer.com/tx/0xc3d1a5c2611111a8763d74582c07c75bdb8f4694a89f6363e3fabca933107599  
**V2 source:** https://github.com/bearbaba/spotter/blob/feat/proofgate-v2-contract-foundation/contracts/proofgate_v2.py  
**V2 development and tests:** https://github.com/bearbaba/spotter/pull/25  

## Concrete workflow and consequence

ProofGate V2 verifies completion of a **specific assigned software contribution**, not whether an arbitrary webpage contains certain text. A client creates a work record that fixes the worker, GitHub owner/repository, target branch, PR number and acceptance rubric. The worker submits it for review. GenLayer checks a trusted, canonical GitHub API route for that exact PR, validates its merge into the agreed branch and evaluates whether the title and description substantiate the qualitative rubric. A successful result produces an on-chain **ACCEPTED** state. Authorized participants can then issue an on-chain **CERTIFIED** acceptance record.

**The consequential outcome is work certification.** This permits an auditable acceptance decision in the work lifecycle and prevents issuing a valid certificate for work that has not reached ACCEPTED. Certification is **not** a payment, token transfer, escrow disbursement or production guarantee.

## Enforced evidence boundary in contract source

The V2 Intelligent Contract `contracts/proofgate_v2.py` on the V2 development branch:

- Constructs the canonical URL `https://api.github.com/repos/{owner}/{repository}/pulls/{pr_number}` from the locked work fields; a worker cannot substitute a self-selected evidence URL.
- Validates returned PR number, repository identity, target branch, merge status and required label (when configured); invalid evidence does not progress to ACCEPTED.
- Uses GenLayer strict-equivalence checks for the external GitHub data and consistency of merge commit across evidence-gathering stages.
- Evaluates title/description *only after* structural source checks succeed. The AI is tasked with qualitative claims in the rubric, not re-proving independently checked merge metadata.
- Returns REVIEW when evidence is missing, inconsistent, insufficient or cannot be verified. It does not certify arbitrary user assertions.
- Restricts certification to participating parties and requires the work state to be ACCEPTED.

The GitHub PR content itself is untrusted third-party text. The policy establishes provenance and merge constraints; it is **not** a guarantee of code quality, a security audit, or proof that a PR's description is true in every detail.

## Completed GenLayer test

The operator's Studio readback for **Work #1** showed:

- Locked evidence: `bearbaba/spotter` PR #24, branch `main`.
- Acceptance rubric: merge into main plus concrete automatic Studionet network-configuration guidance for MetaMask users.
- States observed during the test: **OPEN → SUBMITTED → ACCEPTED → CERTIFIED**.
- PR merge commit: `080afca461de824fa7d1bf173f73c4b4df3c349e`.
- Recorded evidence digest: `e3a62a3c772e33717d5a01d7b08d987e43460d843961f872fb7cbffc3073ff6c`.
- `issue_acceptance(1)` transaction `0xc3d1a5c2611111a8763d74582c07c75bdb8f4694a89f6363e3fabca933107599` executed against `0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7`, **FINALIZED**, GenVM **SUCCESS**, consensus **Accepted**, **0 GEN** transferred.

Read-only reproduction: import the contract into GenLayer Studio, call `get_work("1")` and inspect `state`, `merge_commit`, `evidence_digest` and `evidence_api`. Follow the issuance transaction in Explorer and compare the contract destination with the Studio instance. No wallet signature is required to inspect the recorded readback.

The readback and transaction details were supplied by the operator; deployed-source parity, independent negative live cases and hashes for all earlier positive transitions have not yet been documented.

## Website boundaries

https://bearbaba.github.io/spotter/ is the **single official website**. It features the genuine ProofGate V2 certification and links directly to the deployed contract and transaction. Its interactive public-URL verification workspace currently runs the **older Spotter V1** contract `0x730143dF831778569e15975Ef44dFDeCB668609b`. It is **not** the ProofGate V2 work-creation interface. Do not present a V1 HIT/MISS/DEAD job as V2 work certification.

## What is implemented versus planned

Implemented and tested: V2 contract logic, offline negative policy and authorization regressions, a positive on-chain certificate result, and a Foundry-tested Solidity escrow **prototype** on the V2 branch.

Not yet deployed or demonstrated: an authenticated GenLayer-to-EVM finality bridge, escrow settlement triggered by a proof, a live indexed work marketplace, independent on-chain negative tests, or real-value custody. The Solidity prototype currently uses a permissioned verifier, not a trustless bridge.

## Local verification

```bash
npm run verify
python3 -m unittest discover -s tests -p 'test_proofgate*.py' -v
forge build && forge test -vvv
```

The ProofGate V2 Python tests and Foundry files are on `feat/proofgate-v2-contract-foundation`. Run these commands from that branch; `main` presently contains the V1 website and documentation.
