# ProofGate V2 — GitHub PR Work Acceptance (in development)

**Status:** contract prototype and offline security policy tests. **Not deployed.** The existing Spotter V1 website and contract are unchanged. Do not use V1 Job #6 or the old video as evidence of V2.

## Contested consequence

A client creates a work order identifying a worker wallet and a **single specific GitHub pull request**, the required target repository and target branch. Only the nominated worker can move the order from OPEN to SUBMITTED; an arbitrary caller cannot trigger premature rejection. A GitHub PR that is merged into that target is accepted by the work order; otherwise, the work is rejected or held for review. Only an accepted work order can be marked **CERTIFIED**, and only its client or named worker can issue that certificate. This is a real on-chain state gate, **not** an escrow, payment, statement of code quality, or a proof that the worker wallet controls a GitHub account.

## Enforced evidence policy

* An immutable work order records `owner`, `repository`, `pr_number`, and `target_branch`. The contract derives the only fetch endpoint: `https://api.github.com/repos/{owner}/{repository}/pulls/{number}`.
* There is **no user-provided evidence URL** in `evaluate` and no `submit_url` endpoint in V2.
* Identifier validation excludes slashes, query strings, control characters, host substitutions, and traversal attempts. After the HTTP request, the contract validates API JSON fields `base.repo.full_name`, `base.repo.html_url`, `base.ref`, `number`, `merged_at`, and `merge_commit_sha`.
* Only normalized deterministic fields pass through GenLayer `gl.eq_principle.strict_eq`; unavailable/invalid API responses produce **REVIEW** and can be retried. Wrong branch or unmerged PR produces **REJECTED**. An accepted result can be certified by the named client or worker only. Evaluation is enabled only after the nominated worker has submitted the order.
* `evidence_digest` currently hashes the derived canonical URL, merge commit SHA, and decision. **It is not a cryptographic hash of the full HTTP response**, nor a proof of GitHub account ownership.

## Threat model and current limitations

* GitHub is the explicitly trusted authority **only for PR metadata**, not correctness of code, author identity, satisfaction of broader acceptance criteria, or availability of its API.
* PR status and branch may change during validation. Strict equality across validators may fail on unstable GitHub API responses; reviewers should use settled/merged PRs. GitHub redirects or remote API compromise cannot be cryptographically ruled out purely by using HTTPS; future versions should pin stronger response provenance.
* The `worker` field is a beneficiary/participant wallet nominated by the client, **not verified against GitHub's PR author**. Future identity verification needs an independently enforceable binding.
* No deadline, contest challenge window, escrow, or payments have been claimed or implemented. A challenge mechanism must be designed with strict authorization and explicit lifecycle controls before deployment.
* The merged PR check is deliberately narrow. In future, adding AI-based qualitative code review must be a separate rule whose evidence scope and economic consequence are explicitly defined.
* A contract verdict **REJECTED** is final under this prototype only for a structurally wrong target branch or PR identity. Unmerged PRs remain **REVIEW** and can be reevaluated, with deadline/grace-period semantics still required before a production-ready noncompletion decision.

## Reproduce checks

```bash
python3 -m py_compile contracts/proofgate_v2.py
python3 -m unittest discover -s tests -p 'test_proofgate*.py' -v
```

## Before any Builder resubmission

1. Validate actual GenLayer Studionet contract compatibility and GenVM behavior (not only Python compilation).
2. Deploy **new** V2 contract and save exact on-chain address/source.
3. Run wallet-signed tests: OPEN → worker SUBMITTED → ACCEPTED → CERTIFIED; outsiders cannot submit; REJECTED cannot certify; spoofed repository cannot certify; unauthorized wallet cannot certify; REVIEW can retry.
4. Connect frontend to V2 API and re-record a demo showing its real transactions and consequence.
5. Update reviewer guide and submission: the old generic webpage classifier is **not** the V2 implementation.

## Concrete review fixtures (checked against GitHub repository data)

The GitHub repository currently has a merged **PR #24** targeting `main`, with merge commit
`080afca461de824fa7d1bf173f73c4b4df3c349e`:
https://github.com/bearbaba/spotter/pull/24

Once a *new V2 contract is deployed*, demonstrate separate testnet work orders:

| Work order policy | Worker-submitted evidence | Expected consequence |
| --- | --- | --- |
| `bearbaba/spotter`, PR `24`, target `main` | GitHub API merged PR with exact target | `ACCEPTED` then nominated participant can `issue_acceptance` → `CERTIFIED` |
| `bearbaba/spotter`, PR `24`, target `develop` | Same real PR, wrong required target | `REJECTED`; certification must fail |
| Invalid owner or repository identifier | Creation rejects malformed policy | No work order created |
| GitHub API unavailable / mismatched data | Only the contract-derived GitHub endpoint is fetched | `REVIEW`; no certification, can retry |

**These are planned verification scenarios, not executed V2 on-chain transactions yet.** Check current GitHub PR metadata again just before running tests. The owner/repo/branch/PR values are immutable per work order; a different URL cannot be substituted through the user interface.

## Release-quality gates (must pass before deploying / resubmitting)

**Architecture decision still open:** this prototype verifies GitHub PR *merge metadata* only. A merge status is not a meaningful AI assessment of work quality, and a GenLayer consensus wrapper around deterministic fields may still fail the steward's requirement for a consequential, contested judgment. V2 must name an enforceable, bounded acceptance rubric requiring GenLayer evaluation of evidence that cannot be verified with an ordinary GitHub status check, or honestly narrow claims to a merge-attestation system. The decision must be documented and tested before deployment.

**Contract/consensus**
- Validate GenVM compatibility for HTTP response handling, Python helper functions invoked inside nondeterministic collection, and exact `strict_eq` semantics. Offline mocked tests alone are insufficient.
- Fail closed for missing/inconsistent metadata, non-200 responses, HTML/redirects, API rate limits, and consensus parsing failure. Do not certify on partial evidence.
- Decide finality explicitly: an unmerged PR before a defined deadline must not be irreversibly rejected; REVIEW retry rules and timeout/grace-period policy must be implemented and adversarially tested.
- Prevent unbounded state transitions and unauthorized submissions or issuance. Distinguish acceptance from certification, and guarantee final verdicts cannot be overwritten.
- Do not claim that a merge proves the worker wallet owns the GitHub identity, the code is correct, or a bounty/payment exists.

**Proof and review**
- Add unit tests for identity spoofing, malformed API payloads, mismatched target, wrong branch, non-merged PR, deadline edge cases, and caller permissions; supplement them with live Studio transactions.
- Capture actual V2 ACCEPTED→CERTIFIED and rejected/bad-source cases, with exact contract address, source commit, transaction hashes, timestamps, and `get_work` reads.
- Only then integrate the V2 frontend; use clear English text and accurate pending/failed/finalized wallet states, avoiding inferred transaction success.
- Record a fresh V2 demo with wallet approvals and public read-only reviewer paths. Synchronize README, reviewer guide, repository branch, deployment source, website, and submission links.

**No-go rule:** Any missing live V2 transaction evidence, undocumented mutable trust assumption, incompatible GenVM behavior, or contradictory reviewer documentation blocks release. V1 remains the public production demo until all gates pass.

## V2-only development direction
As of 2026-10-13, all new product development is scoped to Spotter V2. V1 is a legacy deployed snapshot, NOT a deployment target, roadmap milestone, or acceptance-proof fixture for V2. The legacy public site will only be replaced once a verified V2 deployment and its independent read-only proof path exist; existing deployed contract data cannot be migrated merely by changing frontend branding.

**No-go until live validation:** current GitHub PR merge receipt is a narrow metadata check, not qualitative AI assessment of contracted work. Add a source-scoped rubric/GenLayer evaluation path and protect any monetary consequence behind the fully verified escrow/dispute protocol. Tests using a mock GenLayer object do not establish compatibility with real GenVM or external API response behavior.
