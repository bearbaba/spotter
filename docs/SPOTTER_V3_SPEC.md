# Spotter V3 — Frozen acceptance specification

**Status: candidate code only. No fresh V3 deployment or verified contract address yet.**

## Network, fresh state and scope

- GenLayer Studionet, chain ID **61999**, via `https://studio.genlayer.com/api`.
- A newly deployed V3 contract starts with `get_work_count() == "0"`; first created Work is ID **1**.
- The old deployment's Work IDs, certificates, histories, links and transaction hashes are **not imported** or reused as V3 evidence. The old chain history cannot be erased.
- V3 certifies completed **GitHub software work** through an on-chain acceptance state; it does **not** transfer GEN, pay contributors, run escrow, bridge assets or attest the quality/security of code.

## Public contract interface and permissions

| Method | Mode | Caller | State / consequence |
| --- | --- | --- | --- |
| `create_work(worker, owner, repository, target_branch, pr_number, required_label, acceptance_rubric)` | write | Any signing client | Locks worker, canonical PR policy, branch/label and mandatory rubric (16–500 chars); creates OPEN |
| `submit_for_review(work_id)` | write | Nominated worker only | OPEN → SUBMITTED |
| `evaluate(work_id)` | write | Any address, by agreed design | SUBMITTED or REVIEW → ACCEPTED, REVIEW or REJECTED, depending on verified evidence and AI |
| `issue_acceptance(work_id)` | write | Client or nominated worker | ACCEPTED → CERTIFIED; cannot repeat |
| `get_work(work_id)` | view | Anyone | Latest stored contract work record; includes V3 version, decision, merge SHA, digest |
| `get_version()` | view | Anyone | `3.0.0` |
| `get_work_count()` | view | Anyone | Last sequential ID (UI should use paged discovery rather than guessing maximum 100 IDs) |

## Evidence boundary (enforced by contract, not only frontend)

1. Canonical GitHub API endpoint is constructed from immutable contract fields: `https://api.github.com/repos/{owner}/{repository}/pulls/{pr_number}`. Callers cannot inject an arbitrary host or evidence link.
2. Before any AI task, strict-equality consensus checks PR target repository name **and URL**, PR number, target branch, merged flag + closed state, 40-char merge SHA and the optional locked label. Inconsistent or inaccessible data fails closed.
3. Source is queried again for qualitative evaluation; the same locked canonical PR, validated policy and merge SHA must still match. Any conflicting source result fails closed.
4. **Rubric is mandatory on-chain.** No direct contract caller may omit acceptance criteria to bypass AI assessment.
5. AI checks only title and description against the rubric after structural acceptance. Title/body are untrusted input, not authoritative instructions. The AI's decision must be ACCEPTED or REVIEW.
6. A valid AI explanation longer than the 200-character display field (such as Work #3's real 222-character explanation) does **not** overturn a valid verdict. The contract bounds AI reason length to 2000 chars and truncates the display explanation to 200. Malformed or missing AI output fails closed.
7. `evidence_digest` commits to a sorted JSON snapshot of contract version, canonical source, branch, required label, locked rubric, outcome, merge SHA and **strict-checked title/description evidence**. It proves which payload was used in this computation, not an independent audit of the GitHub codebase.
8. `REVIEW` can be evaluated again; `REJECTED` and `CERTIFIED` are final; participants cannot issue a certificate unless currently ACCEPTED.
9. Transaction FINALIZED and GenVM SUCCESS mean the **transaction** executed, not that the Work was accepted. Always re-read `get_work`. The frontend must not retry an uncertain transaction.

## Mandatory acceptance gates before new address is published

- [ ] Python policy, lifecycle, adversarial authorization, long-AI-reason regressions PASS in GitHub CI for the frozen commit.
- [ ] Node frontend tests and deployment ESM import-closure checks PASS for the same commit.
- [ ] Deploy into **Studionet (61999)** with an authorized wallet; verify tx FINALIZED **and** GenVM SUCCESS; save new address, deploy tx ID, exact GitHub SHA and source checksum.
- [ ] Read new `get_version`, `get_work_count`, and `get_work("1")` and confirm fresh storage.
- [ ] Test real positive end-to-end Work #1: create, nominated worker submits, evaluate with consensus, inspect actual Work verdict, issue certificate only when ACCEPTED.
- [ ] Test real negative case: unmerged/mismatched evidence must never reach certificate issuance; wrong worker may not submit; outsider may not certify.
- [ ] Validate full MetaMask account switching, same-tab and multi-tab duplicate-write protections, read-only receipt recovery and on-chain readback on **one exact preview commit**.
- [ ] Switch frontend contract address and **remove legacy Work #1 static showcase** together. Update README/REVIEWER/official website/Studio/Explorer links and verify Production only after Preview passes.

**No automatically inferred chain address, fabricated proof, unconfirmed payment claim or blind transaction resubmission.**
