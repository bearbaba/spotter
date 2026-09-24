# Spotter focused tests

Contract: 0x730143dF831778569e15975Ef44dFDeCB668609b
Job id = open_job return value only. Do not call last_job_of.

## T1 Concurrent opens
open_job A → return Na. open_job B → return Nb.
Nb != Na. get_job(Na).question is A. get_job(Nb).question is B.

## T2 Ids above 20
Open until return is 21 or higher. get_job of that id is nonempty. No 1–20 scan.

## T3 Competing submit
Clerk submit_url(J, https://example.org).
Other wallet submit_url(J, https://docs.genlayer.com) reverts
pending url locked to hunter.

## T4 Changed page content (on-chain)
Job 1 https://example.org → HIT
page_hash 13f5e50297bde87abbf51cd1cd43678109b1a72a52c1cefa3b56844464e4f25c
Job 2 https://docs.genlayer.com/understand-genlayer-protocol/what-is-genlayer → HIT
page_hash 9910555ca131ba1af5cbd1a6fc66c1f33d7534682fb54df4e7e1da6ca7f7d1bf
H1 != H2.

## T5 Reproducible PARSE (on-chain)
Job 3 question __PARSE_TEST__ rubric n/a url https://example.org
→ status SUBMITTED, fail_kind PARSE
justification reproducible malformed-consensus fixture