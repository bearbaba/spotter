# Spotter V3 — Evidence policy and security review

**Stage:** Public Vercel Production **live** on Studionet; independent contract-source and receipt audits remain incomplete.  
**Website:** https://spotter-weld.vercel.app/  
**Demo video:** https://youtu.be/BJSXW3iZNFM (English captions, Work #3)  
**Network:** GenLayer Studionet, chain ID 61999  
**New V3 contract:** `0x506205eBc1ba011707D63d8a152625baaC63002D`  
**Studio:** https://studio.genlayer.com/?import-contract=0x506205eBc1ba011707D63d8a152625baaC63002D  
**Deploy transaction:** https://explorer-studio.genlayer.com/tx/0xd7f3d90b020734129699f207cab4e11b4562a3d7f5876c2903cfb69c2b2aa4b5  
**Work #1 certification transaction (operator-supplied):** https://explorer-studio.genlayer.com/tx/0x614e11c3675f0ab6c9d77fad4e713d2f8deb5ad5f47d6fbc99447021c1c310b0  
**Contract candidate source:** https://github.com/bearbaba/spotter/blob/feat/spotter-v3-fresh-contract/contracts/proofgate.py  
**Development PR and testing evidence:** https://github.com/bearbaba/spotter/pull/28

## Consequential work-certification workflow

A client signs `create_work(worker,owner,repository,target_branch,pr_number,required_label,acceptance_rubric)`, permanently locking a specific software contribution and source evidence boundary. The nominated worker can move the new Work from OPEN to SUBMITTED. Once submitted, any caller may request evaluation; GenLayer consensus checks the exact GitHub PR's merge and repository metadata. If metadata passes, qualitative AI checks the PR's title/description against the mandatory fixed rubric. The result can become ACCEPTED; **only the nominated client or worker can subsequently issue CERTIFIED**.

A successful GenLayer transaction is not inherently a successful Work evaluation: `get_work` readback is the authoritative state. REVIEW outcomes may retry; CERTIFIED and REJECTED are final. Work starts at ID 1 on this independent V3 deployment; no legacy records are migrated.

## Locked source and AI boundaries

- The canonical GitHub URL is assembled from stored owner/repo/PR number and cannot be replaced by the caller.
- The exact repository, repository URL, PR number, target branch, merged+closed status, merge commit SHA and optional label are checked before qualitative AI evaluation.
- Source read consistency uses `strict_eq`; a second checked read must retain the same policy and merge commit.
- Rubric is **mandatory** in contract (16–500 characters), not merely a UI condition.
- AI checks only qualitative claims supported by PR title/body and treats the external prose as untrusted evidence, not instructions.
- AI output requires strict ACCEPTED/REVIEW verdict and bounded explanation. A valid 222-character explanation cannot reverse an otherwise valid ACCEPTED verdict simply because the stored summary is truncated to 200 characters.
- `evidence_digest` commits to source and locked policy, consensus-checked PR title/body, result and merge SHA, but **does not prove the GitHub implementation is secure or correct**.
- Wrong worker cannot submit; wrong wallet cannot issue certificate; no automated GEN payments or escrow functionality exists.

## Work #3 video evidence (finalized Work readback)

- **Demo:** https://youtu.be/BJSXW3iZNFM
- **GitHub PR:** https://github.com/bearbaba/spotter/pull/32
- **Merge commit:** `b6956267a431e2feeb0c4f5205cfdd1b3aef12d5` on `main`.
- **Observed V3 Work #3:** OPEN → SUBMITTED → ACCEPTED → CERTIFIED,
  using separate creator/contributor wallet approvals, on the public website.
- **Readback evidence:** browser shows Work #3 CERTIFIED after a finalized
  contract read, as captured by the user's original operator recording.
- **Important:** successful Work-state readback and an individual transaction's
  GenVM execution receipt are separate evidence. Independent source-parity,
  receipt audit, adversarial transaction tests and code-security audit are not
  claimed.

## Operator-observed V3 Work #1 success

- PR: [bearbaba/spotter #26](https://github.com/bearbaba/spotter/pull/26), merged into `main`.
- User's Studio readback records progression **OPEN → SUBMITTED → ACCEPTED → CERTIFIED**.
- Locked merge commit: `84c1b5d74bc7ca8a63b7a363cb919f53c331ea0a`.
- `evidence_digest`: `9aff4aca44f1395a2d6348f9f43719f8a98b7a44d8ca4669bbc0b9c65881ab22`.
- Certificate link: https://explorer-studio.genlayer.com/tx/0x614e11c3675f0ab6c9d77fad4e713d2f8deb5ad5f47d6fbc99447021c1c310b0
- Deployment link: https://explorer-studio.genlayer.com/tx/0xd7f3d90b020734129699f207cab4e11b4562a3d7f5876c2903cfb69c2b2aa4b5

**Verification limits:** The Work #1 state and Studio deploy log came from the operator's readbacks/screenshots. Current tools did not independently retrieve receipt fields for either deploy or certificate, establish byte-for-byte deployed-source parity with the GitHub contract file, or execute real negative-case transactions. Mocked CI scenarios cannot close those gaps. The original exact 222-character AI response from the prior contract has a fixed offline regression, but this particular V3 Work #1 trace is not proof that the exact same response length was reproduced.

## Version, code, and preview readiness

The new contract's operator-observed `get_version()` is `3.0.0`; `get_work_count()` was `0` before creating Work #1. The V3 website is a preview against that exact address, isolates browser transaction history by chain/contract, and uses the contract's work count for latest-work discovery.

The public Vercel Production app uses the V3 Studionet contract and has an operator-recorded live lifecycle demo. Source, offline contract lifecycle tests, frontend tests, and deployment release checks are maintained in the repository. **Public Production does not mean independently audited Production**: deployed-source byte parity and receipt-level independent verification have not been established by these tools. Every chain write requires an explicit wallet signature.
