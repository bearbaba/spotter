"""Exercise the actual ProofGate state machine with a minimal offline GenLayer stub.

These tests do NOT imply GenVM compatibility or live deployment.
"""
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "contracts" / "proofgate.py"
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
    ai_verdict = {"verdict": "ACCEPTED", "reason": "PR descriptions demonstrate agreed implementation"}
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
        DummyGL.ai_verdict = {"verdict": "ACCEPTED", "reason": "PR descriptions demonstrate agreed implementation"}
        self.p = contract.ProofGate()
        self.p.works = TreeMap()
        self.ident = self.p.create_work(WORKER, "bearbaba", "spotter", "main", 24, "", "PR must document verifiable regression test evidence")

    def test_v3_fresh_storage_and_version(self):
        self.assertEqual(self.p.get_version(), "3.0.0")
        self.assertEqual(self.p.get_work_count(), "1")
        self.assertEqual(json.loads(self.p.get_work(self.ident))["contract_version"], "3.0.0")
        self.assertEqual(self.p.get_work("999"), "{}")
        self.p.create_work(WORKER, "bearbaba", "spotter", "main", 25, "",
                           "Second contribution with explicit acceptance rubric")
        self.assertEqual(self.p.get_work_count(), "2")

    def test_onchain_rubric_is_mandatory(self):
        for rubric in ["", "  ", "too short", "x" * 501]:
            with self.subTest(length=len(rubric)):
                with self.assertRaisesRegex(Exception, "acceptance rubric required"):
                    self.p.create_work(WORKER, "bearbaba", "spotter", "main", 24, "", rubric)
        self.assertEqual(self.p.get_work_count(), "1")

    def test_digest_changes_when_rubric_or_checked_evidence_changes(self):
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(self.ident)
        self.p.evaluate(self.ident)
        self.assertEqual(self.p.works[self.ident].state, "ACCEPTED")
        digest = self.p.works[self.ident].evidence_digest
        self.assertEqual(len(digest), 64)
        DummyGL.message.sender_address = CLIENT
        second = self.p.create_work(WORKER, "bearbaba", "spotter", "main", 24, "",
                                    "An independent and different acceptance rubric")
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(second)
        self.p.evaluate(second)
        self.assertNotEqual(self.p.works[second].evidence_digest, digest)
        DummyGL.message.sender_address = CLIENT
        third = self.p.create_work(WORKER, "bearbaba", "spotter", "main", 24, "",
                                   "PR must document verifiable regression test evidence")
        updated = github_pr()
        updated["title"] = "Changed checked PR title evidence"
        DummyGL.response = APIResponse(200, updated)
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(third)
        self.p.evaluate(third)
        self.assertNotEqual(self.p.works[third].evidence_digest, digest)

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

    def test_work3_ai_accepted_with_222_character_reason_is_not_rejected(self):
        # GenLayer Explorer Work #3 (PR #26) showed a valid ACCEPTED verdict
        # followed by this 222-character reason. The old 200-char validation
        # raised ValueError and incorrectly stored REVIEW.
        reason = (
            "The title and description provide concrete evidence for the regression "
            "tests, specifically covering merged/unmerged checks, repository and "
            "branch validation, labels, and invalid evidence handling as required "
            "by the rubric."
        )
        self.assertEqual(len(reason), 222)
        DummyGL.message.sender_address = CLIENT
        work_id = self.p.create_work(
            WORKER, "bearbaba", "spotter", "main", 24, "",
            "PR must describe merged/unmerged checks and invalid evidence tests",
        )
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(work_id)
        DummyGL.ai_verdict = {"verdict": "ACCEPTED", "reason": reason}
        self.p.evaluate(work_id)
        saved = self.p.works[work_id]
        self.assertEqual(saved.state, "ACCEPTED")
        self.assertTrue(saved.explanation.startswith("Rubric assessment: "))
        self.assertLessEqual(len(saved.explanation), 200)
        self.assertEqual(saved.merge_commit, "a" * 40)
        DummyGL.message.sender_address = CLIENT
        self.p.issue_acceptance(work_id)
        self.assertEqual(self.p.works[work_id].state, "CERTIFIED")

    def test_unbounded_or_invalid_ai_reason_stays_review(self):
        DummyGL.message.sender_address = CLIENT
        work_id = self.p.create_work(
            WORKER, "bearbaba", "spotter", "main", 24, "",
            "PR must describe verified regression tests",
        )
        DummyGL.message.sender_address = WORKER
        self.p.submit_for_review(work_id)
        for bad_reason in ["x" * 2001, "", "   ", None, 42]:
            with self.subTest(reason=str(bad_reason)[:16]):
                DummyGL.ai_verdict = {"verdict": "ACCEPTED", "reason": bad_reason}
                self.p.evaluate(work_id)
                saved = self.p.works[work_id]
                self.assertEqual(saved.state, "REVIEW")
                self.assertEqual(saved.merge_commit, "")
                with self.assertRaisesRegex(Exception, "not accepted"):
                    self.p.issue_acceptance(work_id)

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
