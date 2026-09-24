# Spotter

dApp on GenLayer Studionet (61999).

Post a question. A hunter locks a live URL. Validators fetch the page and
close HIT, MISS, or DEAD. Job id is the open_job transaction return.
The UI does not use last_job_of. Fetch receipts store sha256 / fetch_ok / fail_kind.
Question __PARSE_TEST__ is a deterministic PARSE fixture.

- Contract: `0x730143dF831778569e15975Ef44dFDeCB668609b`
- Studio: https://studio.genlayer.com/?import-contract=0x730143dF831778569e15975Ef44dFDeCB668609b
- Explorer: https://explorer-studio.genlayer.com/address/0x730143dF831778569e15975Ef44dFDeCB668609b
- App: https://bearbaba.github.io/spotter/
- Tests: TESTS.md

On-chain:
1. example.org → HIT, page_hash 13f5e50297bde87abbf51cd1cd43678109b1a72a52c1cefa3b56844464e4f25c
2. docs.genlayer.com → HIT, page_hash 9910555ca131ba1af5cbd1a6fc66c1f33d7534682fb54df4e7e1da6ca7f7d1bf
3. __PARSE_TEST__ → SUBMITTED / PARSE