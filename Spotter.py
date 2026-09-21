# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
import json


FINAL = ("HIT", "MISS", "DEAD")


@allow_storage
@dataclass
class Job:
    poster: Address
    hunter: Address
    question: str
    rubric: str
    url: str
    status: str
    justification: str
    round_no: u32


class Spotter(gl.Contract):
    jobs: TreeMap[str, Job]
    next_id: u32

    def __init__(self):
        self.next_id = u32(1)

    @gl.public.write
    def open_job(self, question: str, rubric: str) -> None:
        q = question.strip()
        r = rubric.strip()
        if not q or not r:
            raise Exception("question and rubric required")
        cid = int(self.next_id)
        self.next_id = u32(cid + 1)
        self.jobs[str(cid)] = Job(
            poster=gl.message.sender_address,
            hunter=Address("0x0000000000000000000000000000000000000000"),
            question=q,
            rubric=r,
            url="",
            status="OPEN",
            justification="",
            round_no=u32(0),
        )

    @gl.public.write
    def submit_url(self, job_id: str, url: str) -> None:
        rec = self.jobs[job_id]
        if rec.status in FINAL:
            raise Exception("already final")
        u = url.strip()
        if not u:
            raise Exception("url required")
        rec.url = u[:300]
        rec.hunter = gl.message.sender_address
        rec.status = "SUBMITTED"
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
                return "URL: " + url + "\nPAGE:\n" + page[:7000]
            except Exception as err:
                return "URL: " + url + "\nFAIL: " + str(err)

        raw = gl.eq_principle.prompt_non_comparative(
            collect,
            task=(
                "QUESTION: " + question
                + " RUBRIC: " + rubric
                + " HIT if the live page answers yes. "
                + "MISS if the page loads but does not support it. "
                + "DEAD if the page cannot be fetched. "
                + "Return ONLY JSON keys status, justification."
            ),
            criteria=(
                "JSON with status and justification. "
                + "status exactly HIT, MISS or DEAD. "
                + "DEAD only when fetch failed. "
                + "Do not invent page text. Valid JSON alone is not enough."
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
                parsed = {"status": "DEAD", "justification": "unparseable"}

        status = str(parsed.get("status", "DEAD")).upper()
        if status not in FINAL:
            status = "DEAD"

        rec = self.jobs[job_id]
        rec.status = status
        rec.justification = str(parsed.get("justification", ""))[:500]
        rec.round_no = u32(int(rec.round_no) + 1)
        self.jobs[job_id] = rec

    @gl.public.view
    def get_job(self, job_id: str) -> str:
        if job_id not in self.jobs:
            return "{}"
        rec = self.jobs[job_id]
        return json.dumps(
            {
                "poster": str(rec.poster),
                "hunter": str(rec.hunter),
                "question": rec.question,
                "rubric": rec.rubric,
                "url": rec.url,
                "status": rec.status,
                "justification": rec.justification,
                "round_no": int(rec.round_no),
            }
        )

    @gl.public.view
    def get_status(self, job_id: str) -> str:
        if job_id not in self.jobs:
            return ""
        return self.jobs[job_id].status
