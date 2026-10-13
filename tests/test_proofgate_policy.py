"""Offline adversarial policy tests without requiring the GenLayer SDK."""
import ast
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "contracts" / "proofgate_v2.py"
tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
names = {"github_identifier", "branch_identifier", "canonical_api_url", "verify_api_payload"}
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
policy = {}
exec(compile(ast.Module(body=functions, type_ignores=[]), str(SOURCE), "exec"), policy)
canonical_api_url = policy["canonical_api_url"]
verify_api_payload = policy["verify_api_payload"]
branch_identifier = policy["branch_identifier"]

def example(merged=True, repo="bearbaba/spotter", number=24, branch="main", url=None):
    return {"number": number,
        "base": {"ref": branch, "repo": {
            "full_name": repo,
            "html_url": url or "https://github.com/" + repo}},
        "merged_at": "2026-10-13T01:00:00Z" if merged else None,
        "merged": merged, "state": "closed" if merged else "open",
        "merge_commit_sha": "a"*40 if merged else None}

class ProofGatePolicyTests(unittest.TestCase):
    def test_canonical_api_fixed(self):
        self.assertEqual(canonical_api_url("bearbaba", "spotter", 24),
            "https://api.github.com/repos/bearbaba/spotter/pulls/24")

    def test_no_untrusted_host_in_policy(self):
        for owner, repository in [
            ("github.com.evil.org", "spotter"),
            ("bearbaba/attacker", "spotter"),
            ("bearbaba", "../spotter"),
            ("bearbaba", "spotter?redirect=evil"),
            ("bearbaba", "spotter#frag"),
            ("", "spotter"),
        ]:
            with self.subTest(owner=owner,repository=repository):
                with self.assertRaises(Exception):
                    canonical_api_url(owner, repository, 24)

    def test_invalid_identifiers(self):
        for number in [0, -1, 1000000001]:
            with self.assertRaises(Exception):
                canonical_api_url("bearbaba", "spotter", number)
        for branch in ["", "../main", "/main", "main/", "main?x", "main#fragment"]:
            self.assertFalse(branch_identifier(branch))

    def test_accept_only_merged_correct_target(self):
        result=verify_api_payload(example(), "bearbaba","spotter",24,"main")
        self.assertEqual(result["state"],"ACCEPTED")
        self.assertEqual(result["merge_commit"],"a"*40)

    def test_unmerged_rejected(self):
        self.assertEqual(verify_api_payload(example(merged=False),"bearbaba","spotter",24,"main")["state"],"REVIEW")

    def test_wrong_branch_rejected(self):
        self.assertEqual(verify_api_payload(example(branch="develop"),"bearbaba","spotter",24,"main")["state"],"REJECTED")

    def test_wrong_pr_rejected(self):
        self.assertEqual(verify_api_payload(example(number=1),"bearbaba","spotter",24,"main")["state"],"REJECTED")

    def test_wrong_repository_review_not_accept(self):
        self.assertNotEqual(verify_api_payload(example(repo="attacker/spotter"),"bearbaba","spotter",24,"main")["state"],"ACCEPTED")

    def test_repo_url_mismatch_review_not_accept(self):
        self.assertNotEqual(verify_api_payload(example(url="https://github.com/attacker/spotter"),"bearbaba","spotter",24,"main")["state"],"ACCEPTED")

    def test_missing_metadata_never_accept(self):
        for obj in [{}, {"base": None}, {"base":{"repo":{}}}, {"base":{"repo":{"full_name":"bearbaba/spotter"}}}]:
            with self.subTest(obj=obj):
                self.assertNotEqual(verify_api_payload(obj,"bearbaba","spotter",24,"main")["state"],"ACCEPTED")

    def test_invalid_merge_sha_never_accept(self):
        payload=example()
        payload["merge_commit_sha"]="NOT A HASH"
        self.assertNotEqual(verify_api_payload(payload,"bearbaba","spotter",24,"main")["state"],"ACCEPTED")

    def test_contract_controls_evidence_endpoint_and_gate(self):
        text=SOURCE.read_text(encoding="utf-8")
        self.assertIn("gl.nondet.web.request(url, method=\"GET\")",text)
        self.assertIn("gl.eq_principle.strict_eq(collect)",text)
        self.assertIn('if rec.state != "ACCEPTED":',text)
        self.assertNotIn("def submit_url(",text)
        self.assertIn("def submit_for_review(",text)
        self.assertIn('if rec.worker != gl.message.sender_address:',text)
        self.assertIn('if record.state not in ("SUBMITTED", "REVIEW"):',text)

if __name__ == "__main__":
    unittest.main()
