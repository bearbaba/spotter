# Spotter

GenLayer Intelligent Contract on **StudioNet (chainId 61999)**.

A poster opens a question. A hunter locks one live URL. Validators fetch the
page and finalize **HIT**, **MISS**, or **DEAD**.

This repo is a Python contract + a static HTML app. **There is no npm build.**

## Verify in 2 minutes (no wallet)

1. Open Studio  
   https://studio.genlayer.com/?import-contract=0x730143dF831778569e15975Ef44dFDeCB668609b
2. Call view `get_job` with `"1"`  
   Expected: `status: HIT`, url `https://example.org`,  
   `page_hash: 13f5e50297bde87abbf51cd1cd43678109b1a72a52c1cefa3b56844464e4f25c`
3. Call `get_job` with `"2"`  
   Expected: `status: HIT`, docs.genlayer.com,  
   `page_hash: 9910555ca131ba1af5cbd1a6fc66c1f33d7534682fb54df4e7e1da6ca7f7d1bf`
4. Call `get_job` with `"3"`  
   Expected: `status: SUBMITTED`, `fail_kind: PARSE`

Explorer:  
https://explorer-studio.genlayer.com/address/0x730143dF831778569e15975Ef44dFDeCB668609b

Live app:  
https://bearbaba.github.io/spotter/

## Run the app (wallet)

See [SETUP.md](SETUP.md).

## Contract

- Address: `0x730143dF831778569e15975Ef44dFDeCB668609b`
- Source: `Spotter.py`
- Network: StudioNet `61999` (`0xf22f`)
- RPC: `https://studio.genlayer.com/api`

Writes: `open_job`, `submit_url`, `judge`  
Views: `get_job`, `get_status`  
Job id = **return value of `open_job`**. Do not use `last_job_of`.

## Files

| File | Role |
| --- | --- |
| Spotter.py | Intelligent Contract |
| index.html | Static dApp (genlayer-js from CDN) |
| SETUP.md | Reviewer setup |
| TESTS.md | Focused tests |

## Not in this repo

No Node build, no `.env`, no Driftlock upgrade. This submission is Spotter v1 only.