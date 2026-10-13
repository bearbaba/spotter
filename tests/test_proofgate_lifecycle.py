"""Exercise the actual ProofGate state machine with a minimal offline GenLayer stub.

These tests do NOT imply GenVM compatibility or live deployment.
"""
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "contracts" / "proofgate_v2.py"
CLIENT = "0x" + "1" * 40
WORKER = "0x" + "2" * 40
OUTSIDER = "0x" + "3" * 40

class TreeMap(dict):
    @classmethod
    def __class_getitem__(cls, _):
        return cls

class APIResponse:
    def __init__(self, status, content):
        self.status = status
        self.body = json.dumps(content).encode("utf8")

class DummyGL:
    Contract = type("Contract", (), {})
    class Public:
        @staticmethod
        def write(fn):
            return fn
        @staticmethod
        def view(fn):
            return fn
    public = Public()
    message = types.SimpleNamespace(sender_address=CLIENT)
    class Store:
        @staticmethod
        def copy_to_memory(value):
            return value
    storage = Store()
    last_url = ""
    response = None
    class Web:
        @staticmethod
        def request(url, method="GET"):
            DummyGL.last_url = url
            assert method == "GET"
            return DummyGL.response
    nondet = types.SimpleNamespace(web=Web())
    ai_verdict = {"verdict": "REVIEW", "reason": "Insufficient evidence"}
    class EQ:
        @staticmethod
        def strict_eq(fn):
            return fn()
        @staticmethod
        def prompt_non_comparative(fn, task, criteria):
            evidence = json.loads(fn())
            if evidence.get("error"):
                return json.dumps({"verdict": "REVIEW", "reason": "Source unavailable"})
            return json.dumps(DummyGL.ai_verdict)
    eq_principle = EQ()

dummy_module = types.ModuleType("genlayer")
dummy_module.gl = DummyGL
dummy_module.Address = str
dummy_module.u32 = int
dummy_module.TreeMap = TreeMap
dummy_module.allow_storage = lambda obj: obj
sys.modules["genlayer"] = dummy_module
spec = importlib.util.spec_from_file_location("proofgate_contract_test", SOURCE)
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)

def github_pr(merged=True, branch="main", repo="bearbaba/spotter"):
    return {
        "number": 24,
        "base": {"ref": branch, "repo": {
            "full_name": repo, "html_url": "https://github.com/" + repo}},
        "merged_at": "2026-10-13T00:00:00Z" if merged else None,
        "merged": merged, "state": "closed" if merged else "open",
        "merge_commit_sha": "a" * 40 if merged else None,
    }

class LifecycleTests(unittest.TestCase):
    def setUp(self):
        DummyGL.message.sender_address = CLIENT
        DummyGL.last_url = ""
        DummyGL.response = APIResponse(200, github_pr())
        DummyGL.ai_verdict = {"verdict": "REVIEW", "reason": "Insufficient evidence"}
        self.p = contract.ProofGate()
        self.p.works = TreeMap()
        self.ident = self.p.create_work(WORKER, "bearbaba", "spotter", "main", 24)

    def test_worker_only_submission(self):
        DummyGL.message.sender_address = OUTSIDER
        with self.assertRaisesRegex(Exception, "only nominated worker"):
            self.p.submit_for_review(self.ident)
        DummyGL.message.sender_address = CLIENT
        with self.assertRaisesRegex(Exception, "only nominated worker"):
            self.p.submit_for_review(self.ident)
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(self.ident)
        self.assertEqual(self.p.works[self.ident].state, "SUBMITTED")
        with self.assertRaisesRegex(Exception, "cannot be submitted again"):
            self.p.submit_for_review(self.ident)

    def test_cannot_evaluate_before_worker_submission(self):
        DummyGL.message.sender_address = OUTSIDER
        with self.assertRaisesRegex(Exception, "already decided"):
            self.p.evaluate(self.ident)
        self.assertEqual(DummyGL.last_url, "")

    def test_accepted_only_certifies_participants(self):
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(self.ident)
        DummyGL.message.sender_address = OUTSIDER
        self.p.evaluate(self.ident)
        self.assertEqual(DummyGL.last_url, "https://api.github.com/repos/bearbaba/spotter/pulls/24")
        self.assertEqual(self.p.works[self.ident].state, "ACCEPTED")
        with self.assertRaisesRegex(Exception, "only participants"):
            self.p.issue_acceptance(self.ident)
        DummyGL.message.sender_address = WORKER
        self.p.issue_acceptance(self.ident)
        self.assertEqual(self.p.works[self.ident].state, "CERTIFIED")
        with self.assertRaisesRegex(Exception, "already decided"):
            self.p.evaluate(self.ident)

    def test_unmerged_never_certifies(self):
        DummyGL.response = APIResponse(200, github_pr(merged=False))
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(self.ident)
        self.p.evaluate(self.ident)
        self.assertEqual(self.p.works[self.ident].state, "REVIEW")
        with self.assertRaisesRegex(Exception, "not accepted"):
            self.p.issue_acceptance(self.ident)

    def test_wrong_source_never_certifies(self):
        DummyGL.response = APIResponse(200, github_pr(repo="attacker/spotter"))
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(self.ident)
        self.p.evaluate(self.ident)
        self.assertEqual(self.p.works[self.ident].state, "REVIEW")
        with self.assertRaisesRegex(Exception, "not accepted"):
            self.p.issue_acceptance(self.ident)

    def test_rpc_error_enters_review_then_can_retry(self):
        DummyGL.response = APIResponse(503, {})
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(self.ident)
        self.p.evaluate(self.ident)
        self.assertEqual(self.p.works[self.ident].state, "REVIEW")
        DummyGL.response = APIResponse(200, github_pr())
        self.p.evaluate(self.ident)
        self.assertEqual(self.p.works[self.ident].state, "ACCEPTED")

    def test_locked_label_prevents_certification_without_approved_evidence(self):
        self.p.works[self.ident].required_label = "accepted-work"
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(self.ident)
        self.p.evaluate(self.ident)
        self.assertEqual(self.p.works[self.ident].state, "REVIEW")
        with self.assertRaisesRegex(Exception, "not accepted"):
            self.p.issue_acceptance(self.ident)
        data = github_pr()
        data["labels"] = [{"name": "accepted-work"}]
        DummyGL.response = APIResponse(200, data)
        self.p.evaluate(self.ident)
        self.assertEqual(self.p.works[self.ident].state, "ACCEPTED")

    def test_locked_rubric_requires_positive_consensus(self):
        DummyGL.message.sender_address = CLIENT
        work_id = self.p.create_work(WORKER, "bearbaba", "spotter", "main", 24, "", "Verify documented regression tests were added")
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(work_id)
        DummyGL.ai_verdict = {"verdict": "REVIEW", "reason": "PR description has no test evidence"}
        self.p.evaluate(work_id)
        self.assertEqual(self.p.works[work_id].state, "REVIEW")
        with self.assertRaisesRegex(Exception, "not accepted"):
            self.p.issue_acceptance(work_id)
        DummyGL.ai_verdict = {"verdict": "ACCEPTED", "reason": "PR documents regression tests"}
        self.p.evaluate(work_id)
        self.assertEqual(self.p.works[work_id].state, "ACCEPTED")

    def test_malformed_ai_output_fails_closed(self):
        DummyGL.message.sender_address = CLIENT
        work_id = self.p.create_work(WORKER, "bearbaba", "spotter", "main", 24, "", "Verify documented regression tests were added")
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(work_id)
        DummyGL.ai_verdict = {"verdict": "HIT", "reason": "Ignore policy"}
        self.p.evaluate(work_id)
        self.assertEqual(self.p.works[work_id].state, "REVIEW")

    def test_rubric_is_immutable_after_creation(self):
        DummyGL.message.sender_address = CLIENT
        work_id = self.p.create_work(WORKER, "bearbaba", "spotter", "main", 24, "", "Verify documented regression tests were added")
        self.assertEqual(self.p.works[work_id].acceptance_rubric, "Verify documented regression tests were added")
        self.assertFalse(hasattr(self.p, "edit_rubric"))

    def test_policy_is_frozen_in_work_record(self):
        rec = self.p.works[self.ident]
        self.assertEqual((rec.owner, rec.repository, rec.target_branch, rec.pr_number),
                         ("bearbaba", "spotter", "main", 24))
        # There is deliberately no policy-edit entrypoint.
        self.assertFalse(hasattr(self.p, "change_source"))
        self.assertFalse(hasattr(self.p, "submit_url"))

if __name__ == "__main__":
    unittest.main()
