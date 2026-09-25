# SETUP — Spotter for reviewers

Spotter does not compile with npm/yarn/cargo. Review path is:

- static page, or
- GenLayer Studio view calls

## Path A — read settled jobs (fastest)

1. https://studio.genlayer.com/?import-contract=0x730143dF831778569e15975Ef44dFDeCB668609b
2. Network must be StudioNet / 61999
3. `get_job("1")` → HIT on example.org
4. `get_job("2")` → HIT on docs.genlayer.com
5. `get_job("3")` → SUBMITTED / PARSE

If those three views return JSON, the deployment works.

## Path B — click the app

1. Add MetaMask network if missing:
   - Name: GenLayer StudioNet
   - Chain ID: 61999
   - Currency: GEN
   - RPC: https://studio.genlayer.com/api
   - Explorer: https://explorer-studio.genlayer.com
2. Open Studio, copy a funded Studio account into MetaMask (or use faucet)
3. Open https://bearbaba.github.io/spotter/
4. Connect → allow switch to 61999
5. Button **Example HIT** → **Open job**
6. Wait until Job id fills (open_job return). If empty, paste return from Studio
7. **Submit URL** → **Judge** (wait consensus) → **Read**
8. Receipt must show `status`, `page_hash`, `fetch_ok`, `fail_kind`

## Path C — open local HTML

```bash
git clone https://github.com/bearbaba/spotter.git
cd spotter
python -m http.server 8080
Open http://localhost:8080/index.html
Same wallet steps as Path B.

## Common reviewer errors

| Symptom | Cause |
| --- | --- |
| "does not build" | Looking for package.json. None by design. |
| Job id empty | Must use open_job return, not last_job_of |
| Wrong chain | Studio Next 61997 ≠ StudioNet 61999 |
| Judge pending | Wait for accepted/finalized, then Read |
| Second submit reverts | URL locked to first hunter |

## Settled evidence (already on-chain)

- Job 1 HIT `13f5e50297bde87abbf51cd1cd43678109b1a72a52c1cefa3b56844464e4f25c`
- Job 2 HIT `9910555ca131ba1af5cbd1a6fc66c1f33d7534682fb54df4e7e1da6ca7f7d1bf`
- Job 3 PARSE fixture `__PARSE_TEST__`