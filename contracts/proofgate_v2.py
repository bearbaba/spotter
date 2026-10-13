# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
import json
import hashlib

# ProofGate V2: GitHub pull-request merge acceptance.
# V1 is deliberately untouched. This source is NOT yet deployed.

@allow_storage
@dataclass
class Work:
    client: Address
    worker: Address
    owner: str
    repository: str
    target_branch: str
    pr_number: u32
    state: str
    explanation: str
    evidence_digest: str
    merge_commit: str

def github_identifier(text: str) -> bool:
    return bool(text) and len(text) <= 100 and all(
        c.isascii() and (c.isalnum() or c in "-_.") for c in text
    ) and text not in (".", "..")

def branch_identifier(text: str) -> bool:
    return bool(text) and len(text) <= 160 and all(
        c.isascii() and (c.isalnum() or c in "-_./") for c in text
    ) and ".." not in text and not text.startswith("/") and not text.endswith("/")

def canonical_api_url(owner: str, repository: str, number: int) -> str:
    if not github_identifier(owner) or not github_identifier(repository):
        raise Exception("invalid repository identity")
    # GitHub user/org login names allow ASCII letters, digits and hyphens only.
    # A dotted owner is not a second hostname, but should be rejected as an invalid identity.
    if not all(c.isascii() and (c.isalnum() or c == "-") for c in owner):
        raise Exception("invalid GitHub owner")
    if owner.startswith("-") or owner.endswith("-") or "--" in owner or len(owner) > 39:
        raise Exception("invalid GitHub owner")
    if number <= 0 or number > 1000000000:
        raise Exception("invalid pull request number")
    return "https://api.github.com/repos/" + owner + "/" + repository + "/pulls/" + str(number)

def verify_api_payload(data: dict, owner: str, repository: str, number: int, branch: str) -> dict:
    """Inspect structured GitHub PR fields, not PR prose or arbitrary submitted URLs."""
    expected = "https://github.com/" + owner + "/" + repository
    base = data.get("base", {})
    if not isinstance(base, dict):
        return {"state": "REVIEW", "reason": "missing PR base", "merge_commit": ""}
    repo_info = base.get("repo", {})
    if not isinstance(repo_info, dict):
        return {"state": "REVIEW", "reason": "missing target repository", "merge_commit": ""}
    canonical_name = str(repo_info.get("full_name", ""))
    if canonical_name.casefold() != (owner + "/" + repository).casefold():
        return {"state": "REVIEW", "reason": "PR target repository mismatch", "merge_commit": ""}
    if str(repo_info.get("html_url", "")).rstrip("/").casefold() != expected.casefold():
        return {"state": "REVIEW", "reason": "PR repository identity mismatch", "merge_commit": ""}
    if data.get("number") != number or str(base.get("ref", "")) != branch:
        return {"state": "REJECTED", "reason": "PR number or target branch mismatch", "merge_commit": ""}
    if data.get("merged_at") is None:
        return {"state": "REJECTED", "reason": "Pull request is not merged", "merge_commit": ""}
    merge_commit = data.get("merge_commit_sha")
    if not isinstance(merge_commit, str) or len(merge_commit) != 40 or not all(
        c in "0123456789abcdefABCDEF" for c in merge_commit
    ):
        return {"state": "REVIEW", "reason": "missing valid merge commit", "merge_commit": ""}
    return {"state": "ACCEPTED", "reason": "Allowed GitHub PR merged into required branch", "merge_commit": merge_commit.lower()}

class ProofGate(gl.Contract):
    works: TreeMap[str, Work]
    next_id: u32

    def __init__(self):
        self.next_id = u32(1)

    @gl.public.write
    def create_work(self, worker: Address, owner: str, repository: str, target_branch: str, pr_number: u32) -> str:
        # The immutable policy is exact GitHub repository + PR number + target branch.
        # No arbitrary evidence URL is accepted or fetched.
        canonical_api_url(owner, repository, int(pr_number))
        if not branch_identifier(target_branch):
            raise Exception("invalid target branch")
        if worker == Address("0x0000000000000000000000000000000000000000"):
            raise Exception("worker required")
        work_id = str(int(self.next_id))
        self.next_id = u32(int(self.next_id) + 1)
        self.works[work_id] = Work(
            client=gl.message.sender_address, worker=worker, owner=owner,
            repository=repository, target_branch=target_branch, pr_number=pr_number,
            state="OPEN", explanation="", evidence_digest="", merge_commit=""
        )
        return work_id

    @gl.public.write
    def evaluate(self, work_id: str) -> None:
        record = gl.storage.copy_to_memory(self.works[work_id])
        if record.state not in ("OPEN", "REVIEW"):
            raise Exception("work already decided")
        url = canonical_api_url(record.owner, record.repository, int(record.pr_number))
        owner, repository, branch, number = record.owner, record.repository, record.target_branch, int(record.pr_number)

        def collect() -> str:
            try:
                response = gl.nondet.web.request(url, method="GET")
                if response.status_code != 200:
                    return json.dumps({"state": "REVIEW", "reason": "GitHub API not available", "merge_commit": ""}, sort_keys=True)
                payload = json.loads(response.body.decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("unexpected response")
                result = verify_api_payload(payload, owner, repository, number, branch)
                return json.dumps(result, sort_keys=True)
            except Exception:
                return json.dumps({"state": "REVIEW", "reason": "Evidence could not be verified", "merge_commit": ""}, sort_keys=True)

        # Validators compare compact, deterministic, normalized fields rather than volatile API JSON.
        report = json.loads(gl.eq_principle.strict_eq(collect))
        state = report.get("state", "REVIEW")
        if state not in ("ACCEPTED", "REJECTED", "REVIEW"):
            raise Exception("invalid consensus result")
        rec = self.works[work_id]
        rec.state = state
        rec.explanation = str(report.get("reason", ""))[:200]
        rec.merge_commit = str(report.get("merge_commit", ""))[:40] if state == "ACCEPTED" else ""
        rec.evidence_digest = hashlib.sha256(
            (url + "|" + rec.merge_commit + "|" + state).encode("utf-8")
        ).hexdigest()
        self.works[work_id] = rec

    @gl.public.write
    def issue_acceptance(self, work_id: str) -> None:
        rec = self.works[work_id]
        if rec.state != "ACCEPTED":
            raise Exception("work not accepted")
        if rec.client != gl.message.sender_address and rec.worker != gl.message.sender_address:
            raise Exception("only participants can issue acceptance")
        rec.state = "CERTIFIED"
        self.works[work_id] = rec

    @gl.public.view
    def get_work(self, work_id: str) -> str:
        if work_id not in self.works:
            return "{}"
        rec = self.works[work_id]
        return json.dumps({
            "id": work_id, "client": str(rec.client), "worker": str(rec.worker),
            "owner": rec.owner, "repository": rec.repository,
            "target_branch": rec.target_branch, "pr_number": int(rec.pr_number),
            "state": rec.state, "explanation": rec.explanation,
            "evidence_digest": rec.evidence_digest, "merge_commit": rec.merge_commit,
            "evidence_api": canonical_api_url(rec.owner, rec.repository, int(rec.pr_number)),
        })
