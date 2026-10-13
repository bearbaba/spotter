# ProofGate V2 — GitHub PR Work Acceptance (in development)

**Status:** contract prototype and offline security policy tests. **Not deployed.** The existing Spotter V1 website and contract are unchanged. Do not use V1 Job #6 or the old video as evidence of V2.

## Contested consequence

A client creates a work order identifying a worker wallet and a **single specific GitHub pull request**, the required target repository and target branch. A GitHub PR that is merged into that target is accepted by the work order; otherwise, the work is rejected or held for review. Only an accepted work order can be marked **CERTIFIED**, and only its client or named worker can issue that certificate. This is a real on-chain state gate, **not** an escrow, payment, statement of code quality, or a proof that the worker wallet controls a GitHub account.

## Enforced evidence policy

* An immutable work order records `owner`, `repository`, `pr_number`, and `target_branch`. The contract derives the only fetch endpoint: `https://api.github.com/repos/{owner}/{repository}/pulls/{number}`.
* There is **no user-provided evidence URL** in `evaluate` and no `submit_url` endpoint in V2.
* Identifier validation excludes slashes, query strings, control characters, host substitutions, and traversal attempts. After the HTTP request, the contract validates API JSON fields `base.repo.full_name`, `base.repo.html_url`, `base.ref`, `number`, `merged_at`, and `merge_commit_sha`.
* Only normalized deterministic fields pass through GenLayer `gl.eq_principle.strict_eq`; unavailable/invalid API responses produce **REVIEW** and can be retried. Wrong branch or unmerged PR produces **REJECTED**. An accepted result can be certified by the named client or worker only.
* `evidence_digest` currently hashes the derived canonical URL, merge commit SHA, and decision. **It is not a cryptographic hash of the full HTTP response**, nor a proof of GitHub account ownership.

## Threat model and current limitations

* GitHub is the explicitly trusted authority **only for PR metadata**, not correctness of code, author identity, satisfaction of broader acceptance criteria, or availability of its API.
* PR status and branch may change during validation. Strict equality across validators may fail on unstable GitHub API responses; reviewers should use settled/merged PRs. GitHub redirects or remote API compromise cannot be cryptographically ruled out purely by using HTTPS; future versions should pin stronger response provenance.
* The `worker` field is a beneficiary/participant wallet nominated by the client, **not verified against GitHub's PR author**. Future identity verification needs an independently enforceable binding.
* No deadline, contest challenge window, escrow, or payments have been claimed or implemented. A challenge mechanism must be designed with strict authorization and explicit lifecycle controls before deployment.
* The merged PR check is deliberately narrow. In future, adding AI-based qualitative code review must be a separate rule whose evidence scope and economic consequence are explicitly defined.
* A contract verdict **REJECTED** is final under the current prototype. Since an unmerged PR could be merged later, production workflows will need deadline/grace-period semantics before treating absence of merge as a final rejection.

## Reproduce checks

```bash
python3 -m py_compile contracts/proofgate_v2.py
python3 -m unittest discover -s tests -p 'test_proofgate*.py' -v
```

## Before any Builder resubmission

1. Validate actual GenLayer Studionet contract compatibility and GenVM behavior (not only Python compilation).
2. Deploy **new** V2 contract and save exact on-chain address/source.
3. Run wallet-signed tests: ACCEPTED → CERTIFIED; REJECTED cannot certify; spoofed repository cannot certify; unauthorized wallet cannot certify; REVIEW can retry.
4. Connect frontend to V2 API and re-record a demo showing its real transactions and consequence.
5. Update reviewer guide and submission: the old generic webpage classifier is **not** the V2 implementation.
