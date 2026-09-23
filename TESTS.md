# Spotter focused tests (Studionet 0x1BB9b00027c36EdAdeec03857Dbe09AF6AC1e871)

Do not scan ids 1–20. Use the open_job transaction return, or last_job_of only as a fallback.

## T1 Concurrent job creation
1. open_job A (question A). Record the write return id (expect "n").
2. Immediately open_job B (question B). Record return id (expect "n+1").
3. get_job(n) question is A. get_job(n+1) question is B.
Pass: two different ids, no overwrite.

## T2 Ids above 20
If next_id is already > 20, open_job once and read the returned id.
Else open_job until the returned id is "21".
get_job("21") is not empty.
Pass: id 21 works without a 1–20 loop.

## T3 Competing URL submissions
1. Wallet Clerk: open_job, submit_url job J with https://example.org
2. Wallet Other: submit_url job J with https://docs.genlayer.com
Pass: Other reverts "pending url locked to hunter". url_history on J still starts with example.org.

## T4 Changed page content
1. Job HIT: example.org + “illustrative / documentation examples” → judge → HIT, fetch_ok true, page_hash set.
2. New job MISS: same url, question “Is this the UN homepage?” → judge → MISS, different justification, fetch_ok true.
Pass: same URL, two jobs, two receipts, labels differ.

## T5 Malformed / unexpected consensus
If judge returns non HIT/MISS/DEAD JSON, status stays SUBMITTED and fail_kind is PARSE.
Fetch failure (TLD .invalid) is DEAD / FETCH, not PARSE.
Already on this deploy:
- Job 1 example.org → HIT, page_hash 13f5e50297bde87abbf51cd1cd43678109b1a72a52c1cefa3b56844464e4f25c
- Job 2 .invalid → DEAD / FETCH