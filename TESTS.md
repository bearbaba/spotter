# Spotter verification matrix

## Automated tests (CI and local)

Run `npm run verify` (Node 20+) and `python3 -m py_compile Spotter.py` (Python 3).

The GitHub Actions `Verify Spotter` workflow runs a dependency-free static bundle build, JavaScript unit tests and Python syntax parsing on pushes and pull requests. No wallet, RPC, or blockchain writes are performed.

| Test | Verification |
| --- | --- |
| Valid Job ID parsing | Accept positive decimal IDs; reject tx hashes, HTML and invalid values |
| Return decoding | Extract only expected result fields, not unrelated numeric receipt data |
| Wallet safety | Validate tx hashes and finalization failure responses |
| Web source input | Reject malformed, secret-bearing, and common local-network URLs |
| Read state | Parse accepted state safely; distinguish final and nonfinal verdicts |
| DOM safety | No `innerHTML` interpolation of contract results |
| Submission safety | One wallet write per action, no fallback resend; persistent pending record blocks duplicate clicks |
| Missing event recovery | Strict wallet, job ID, source, round, and pre-write state matching; wrong-wallet and stale receipt regression checks |
| Responsive UI | Core selectors, user-readable proof, mobile layout and accessible status announcements |
| Discovery & access | Auto-load public jobs without wallet, owner/hunter filtering, newest-first ordering, bounded pagination, safe RPC error recovery |
| Existing Job continuation | Revalidate chain ID, on-chain Job identity and allowed OPEN/SUBMITTED status before activation; permissionless contract roles, read-only selection and separately approved writes |
| GenVM transaction return | Decode explicit FINALIZED GenVM return before event-based fallback and reject unmatched baseline |
| Packaging | `npm run build` emits `dist/index.html`, `dist/app.mjs`, `dist/spotter-core.mjs`, `dist/jobs-browser.mjs` |
| Python | Contract parses; this is **not** a GenVM execution test |

## Historical on-chain evidence (requires independent live reading)

Existing contract: `0x730143dF831778569e15975Ef44dFDeCB668609b`, Studionet 61999.

- Job 1: reported HIT on `https://example.org`, digest `13f5e50297bde87abbf51cd1cd43678109b1a72a52c1cefa3b56844464e4f25c`.
- Job 2: reported HIT on a GenLayer documentation URL, digest `9910555ca131ba1af5cbd1a6fc66c1f33d7534682fb54df4e7e1da6ca7f7d1bf`.
- Job 3: previously reported SUBMITTED / PARSE. This is not a deterministic fixture for new calls.

These are prior reported samples, **not automated passes in CI**. Reviewer must query the contract and capture current explorer receipts.

## Manual adversarial tests (NOT claimed complete)

1. **Browser discovery:** With no wallet, see jobs automatically; then connect wallet and filter, switch accounts, test Load more and offline RPC errors (only simulated in CI, live manual still required).
2. **Concurrent opens:** open two jobs from different wallets, verify each returned ID maps to the original question; if falling back to `last_job_of`, require exact wallet/claim and a pre-write baseline; identical concurrent claims remain an ambiguous edge case.
2. **Competing hunters:** first hunter submits a URL; a different sender attempting to overwrite while SUBMITTED should revert.
3. **Interrupted transaction:** submit once, reload, then use read-only Resume instead of clicking Submit again.
4. **Account/network switching:** switch MetaMask account or chain and check the page resets the connected context.
5. **Tampered page:** return HTML-looking text from chain; display must remain inert text rather than executing HTML.
6. **Consensus error:** when a judge transaction produces malformed result, record SUBMITTED / PARSE as nonterminal, and investigate independently.
7. **Mobile:** no horizontal overflow or inaccessible buttons at typical mobile viewport widths.

Do not present any of these as live-verified without a transaction link and actual output.
