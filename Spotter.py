# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
import json
import hashlib


FINAL = ("HIT", "MISS", "DEAD")
ZERO = Address("0x0000000000000000000000000000000000000000")


@allow_storage
@dataclass
class Job:
    poster: Address
    hunter: Address
    question: str
    rubric: str
    url: str
    url_history: str
    status: str
    justification: str
    fail_kind: str
    page_hash: str
    page_chars: u32
    fetch_ok: bool
    round_no: u32


class Spotter(gl.Contract):
    jobs: TreeMap[str, Job]
    last_job: TreeMap[str, str]
    next_id: u32

    def __init__(self):
        self.next_id = u32(1)

    @gl.public.write
    def open_job(self, question: str, rubric: str) -> str:
        q = question.strip()
        r = rubric.strip()
        if not q or not r:
            raise Exception("question and rubric required")
        cid = int(self.next_id)
        self.next_id = u32(cid + 1)
        key = str(cid)
        self.jobs[key] = Job(
            poster=gl.message.sender_address,
            hunter=ZERO,
            question=q,
            rubric=r,
            url="",
            url_history="",
            status="OPEN",
            justification="",
            fail_kind="",
            page_hash="",
            page_chars=u32(0),
            fetch_ok=False,
            round_no=u32(0),
        )
        self.last_job[str(gl.message.sender_address)] = key
        return key

    @gl.public.write
    def submit_url(self, job_id: str, url: str) -> None:
        rec = self.jobs[job_id]
        if rec.status in FINAL:
            raise Exception("already final")
        u = url.strip()[:300]
        if not u:
            raise Exception("url required")
        sender = gl.message.sender_address
        if rec.status == "SUBMITTED":
            if rec.hunter != sender:
                raise Exception("pending url locked to hunter")
        rec.url = u
        rec.hunter = sender
        hist = [p for p in rec.url_history.split("|") if p]
        hist.append(u)
        rec.url_history = "|".join(hist[-8:])
        rec.status = "SUBMITTED"
        rec.fail_kind = ""
        self.jobs[job_id] = rec

    @gl.public.write
    def judge(self, job_id: str) -> None:
        rec_mem = gl.storage.copy_to_memory(self.jobs[job_id])
        if rec_mem.status in FINAL:
            raise Exception("already final")
        if not rec_mem.url:
            raise Exception("submit a url first")
        url = rec_mem.url
        question = rec_mem.question
        rubric = rec_mem.rubric

        def collect() -> str:
            try:
                page = gl.nondet.web.render(url, mode="text")
                body = page[:7000]
                digest = hashlib.sha256(body.encode("utf-8", "replace")).hexdigest()
                return json.dumps(
                    {
                        "ok": True,
                        "url": url,
                        "chars": len(body),
                        "sha256": digest,
                        "page": body,
                    }
                )
            except Exception as err:
                return json.dumps(
                    {
                        "ok": False,
                        "url": url,
                        "chars": 0,
                        "sha256": "",
                        "error": str(err),
                    }
                )

        raw = gl.eq_principle.prompt_non_comparative(
            collect,
            task=(
                "You receive JSON from collect() with ok, url, chars, sha256, page or error. "
                "QUESTION: " + question + " RUBRIC: " + rubric + " "
                "If ok is false: status DEAD, fail_kind FETCH, copy error into justification. "
                "If ok is true: status HIT or MISS only, fail_kind empty. "
                "Always echo sha256, chars, fetch_ok. "
                "Return ONLY JSON keys status, justification, fail_kind, sha256, chars, fetch_ok."
            ),
            criteria=(
                "JSON with status, justification, fail_kind, sha256, chars, fetch_ok. "
                "DEAD + FETCH only when collect ok is false. "
                "HIT or MISS only when collect ok is true. "
                "sha256 and chars must match collect(). Do not invent page text."
            ),
        )

        if isinstance(raw, dict):
            parsed = raw
        else:
            text = str(raw)
            start = text.find("{")
            end = text.rfind("}")
            try:
                parsed = json.loads(text[start:end + 1]) if start >= 0 and end > start else {}
            except Exception:
                parsed = {}

        rec = self.jobs[job_id]
        rec.round_no = u32(int(rec.round_no) + 1)
        rec.page_hash = str(parsed.get("sha256", ""))[:64]
        try:
            rec.page_chars = u32(int(parsed.get("chars", 0)))
        except Exception:
            rec.page_chars = u32(0)
        rec.justification = str(parsed.get("justification", ""))[:500]

        status = str(parsed.get("status", "")).upper()
        fail = str(parsed.get("fail_kind", "")).upper()
        if status not in ("HIT", "MISS", "DEAD"):
            rec.status = "SUBMITTED"
            rec.fail_kind = "PARSE"
            rec.fetch_ok = False
            rec.justification = "malformed or unexpected consensus output"
        elif status == "DEAD":
            rec.status = "DEAD"
            rec.fail_kind = "FETCH"
            rec.fetch_ok = False
        else:
            rec.status = status
            rec.fail_kind = ""
            rec.fetch_ok = True
        if fail == "PARSE":
            rec.status = "SUBMITTED"
            rec.fail_kind = "PARSE"
            rec.fetch_ok = False
        self.jobs[job_id] = rec

    @gl.public.view
    def get_job(self, job_id: str) -> str:
        if job_id not in self.jobs:
            return "{}"
        rec = self.jobs[job_id]
        return json.dumps(
            {
                "id": job_id,
                "poster": str(rec.poster),
                "hunter": str(rec.hunter),
                "question": rec.question,
                "rubric": rec.rubric,
                "url": rec.url,
                "url_history": rec.url_history,
                "status": rec.status,
                "justification": rec.justification,
                "fail_kind": rec.fail_kind,
                "page_hash": rec.page_hash,
                "page_chars": int(rec.page_chars),
                "fetch_ok": rec.fetch_ok,
                "round_no": int(rec.round_no),
            }
        )

    @gl.public.view
    def last_job_of(self, who: str) -> str:
        return self.last_job[who] if who in self.last_job else ""

    @gl.public.view
    def get_status(self, job_id: str) -> str:
        if job_id not in self.jobs:
            return ""
        return self.jobs[job_id].status