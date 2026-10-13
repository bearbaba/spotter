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


    def test_required_label_is_enforced_from_github_metadata(self):
        payload = example()
        payload["labels"] = [{"name": "accepted-work"}, {"name": "security"}]
        self.assertEqual(verify_api_payload(payload, "bearbaba", "spotter", 24, "main", "accepted-work")["state"], "ACCEPTED")
        self.assertEqual(verify_api_payload(payload, "bearbaba", "spotter", 24, "main", "wrong-label")["state"], "REJECTED")
        self.assertEqual(verify_api_payload(example(), "bearbaba", "spotter", 24, "main", "accepted-work")["state"], "REVIEW")
        payload["labels"] = [{"name": "accepted-work"}, "malformed"]
        self.assertEqual(verify_api_payload(payload, "bearbaba", "spotter", 24, "main", "accepted-work")["state"], "REVIEW")

    def test_address_normalization_before_storing_roles(self):
        class Address:
            def __init__(self, value):
                if isinstance(value, bytes):
                    self.data = value
                elif isinstance(value, str) and value.startswith("0x"):
                    self.data = bytes.fromhex(value[2:])
                else:
                    raise ValueError("invalid address")
                if len(self.data) != 20:
                    raise ValueError("invalid address size")
            @property
            def as_bytes(self):
                return self.data
            def __eq__(self, other):
                return isinstance(other, Address) and self.data == other.data
        tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
        definition = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "normalize_address")
        namespace = {"Address": Address}
        exec(compile(ast.Module(body=[definition], type_ignores=[]), str(SOURCE), "exec"), namespace)
        normalize = namespace["normalize_address"]
        address = "0x" + "4c" * 20
        self.assertEqual(normalize(int(address, 16)).as_bytes, bytes.fromhex("4c" * 20))
        self.assertEqual(normalize(address).as_bytes, bytes.fromhex("4c" * 20))
        self.assertEqual(normalize(bytes.fromhex("4c" * 20)).as_bytes, bytes.fromhex("4c" * 20))
        self.assertEqual(normalize(normalize(address)).as_bytes, bytes.fromhex("4c" * 20))
        for invalid in [-1, 1 << 160, True, b"short", object()]:
            with self.subTest(invalid=repr(invalid)), self.assertRaises(Exception):
                normalize(invalid)
        source = SOURCE.read_text(encoding="utf-8")
        self.assertIn("client = normalize_address(gl.message.sender_address)", source)
        self.assertIn("worker = normalize_address(worker)", source)
        self.assertIn("client=client, worker=worker", source)

    def test_genvm_stored_integer_is_explicitly_wrapped_u32(self):
        source = SOURCE.read_text(encoding="utf-8")
        parsed = ast.parse(source)
        work_calls = [
            node for node in ast.walk(parsed)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "Work"
        ]
        self.assertEqual(len(work_calls), 1)
        pr_arg = next(kw.value for kw in work_calls[0].keywords if kw.arg == "pr_number")
        self.assertIsInstance(pr_arg, ast.Call)
        self.assertIsInstance(pr_arg.func, ast.Name)
        self.assertEqual(pr_arg.func.id, "u32")

    def test_contract_controls_evidence_endpoint_and_gate(self):
        text=SOURCE.read_text(encoding="utf-8")
        self.assertIn("gl.nondet.web.request(url, method=\"GET\")",text)
        self.assertIn("gl.eq_principle.strict_eq(collect)",text)
        self.assertIn('if rec.state != "ACCEPTED":',text)
        self.assertNotIn("def submit_url(",text)
        self.assertIn("def submit_for_review(",text)
        self.assertIn('if rec.worker != normalize_address(gl.message.sender_address):',text)
        self.assertIn('if record.state not in ("SUBMITTED", "REVIEW"):',text)

if __name__ == "__main__":
    unittest.main()
