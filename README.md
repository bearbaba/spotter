# Spotter — web evidence, on-chain verdicts

**GenLayer Studionet 61999** · [Live GitHub Pages](https://bearbaba.github.io/spotter/) · [Contract in Studio](https://studio.genlayer.com/?import-contract=0x730143dF831778569e15975Ef44dFDeCB668609b) · [Explorer](https://explorer-studio.genlayer.com/address/0x730143dF831778569e15975Ef44dFDeCB668609b)

Spotter lets a poster define a question and a decision rubric. A hunter submits a live public URL; GenLayer's validators fetch and evaluate it. The on-chain record exposes a **HIT**, **MISS**, or **DEAD** verdict, an explanation, and fetch metadata such as the returned page hash. **This is an experimental AI-assisted evaluation, not a guarantee of factual truth or immutable historical webpage content.** There is no bounty or payment system in the current Spotter contract.

## Main path: verify a source in four steps

1. Open [Spotter](https://bearbaba.github.io/spotter/). The prominent **Start verification** action opens the four-step verification workspace; historical jobs do not appear in the hero.
2. Define a claim and rubric, provide a public source URL, then connect a Studionet wallet and explicitly approve **Create job → Submit evidence → Run verification** as separate transactions. The sample public proof is readable without a wallet.
3. Already have a job? Select **Find and continue your work** in the workspace. This opens the collapsed **Activity & history** section below the main workspace; it reads actual finalized jobs only when opened, without requesting a wallet signature.
4. Within secondary Activity & history, use **My jobs** to filter by poster or hunter, or **All jobs** to participate permissionlessly. OPEN jobs can accept a source from any wallet; SUBMITTED jobs can be judged by any wallet. Selecting a job rechecks its finalized status and fills the main form without signing.
5. Select **Read proof** in the public proof panel or activity list to inspect accepted status, justification and SHA-256. Each write requires separate wallet approval; history browsing is read-only.

The existing deployed contract does not implement a native job index; the optional secondary Activity & history panel safely scans sequential contract IDs on demand, with **Load more jobs** (up to 480 per browser visit). If an RPC call fails it shows an error, never fabricates an empty result. No off-chain indexer, backend, external API key or contract upgrade is required.

## Verify without signing anything (legacy direct lookup path)

1. Open **https://bearbaba.github.io/spotter/** and choose **Read live contract state** in the Sample verification card (no wallet).
2. The application must read `get_job("1")` on Studionet, display the on-chain status, URL and stored `page_hash`.
3. You can also paste Job IDs **2** and **3** and press **Read proof**, or view them directly through the Studio contract. Historical expected snapshots (verify on the chain, do not trust this list alone):
   - Job 1: HIT, `https://example.org`, `13f5e50297bde87abbf51cd1cd43678109b1a72a52c1cefa3b56844464e4f25c`
   - Job 2: HIT on docs.genlayer.com, `9910555ca131ba1af5cbd1a6fc66c1f33d7534682fb54df4e7e1da6ca7f7d1bf`
   - Job 3: historical SUBMITTED / PARSE case. **The question `__PARSE_TEST__` is NOT a deterministic fixture in the deployed Python contract.** Do not expect a new transaction to reproduce PARSE.
4. If the website or RPC is unavailable, use [the Studio contract](https://studio.genlayer.com/?import-contract=0x730143dF831778569e15975Ef44dFDeCB668609b) and call `get_job` with string IDs `"1"`, `"2"`, or `"3"`.

The deployed contract on Studionet has not been replaced. Read-only checks do not require a wallet or GEN.

**Public lookup is separate from the active write session.** Selecting sample Job #1 or reading any public Job ID never overwrites the Job ID being used for an active Create → Submit → Verify flow. An exact Job ID can be entered in the **Advanced · recover an existing Job ID** panel only when the user has independently verified it in Studio.

## Run / build locally

Requirements: Node.js 20+ for the optional offline build/tests; Python 3 for a simple static web server. **No npm dependencies, API keys, or secret environment variables are required.**

```bash
git clone https://github.com/bearbaba/spotter.git
cd spotter
npm run verify  # produces dist/ and runs offline unit/static tests
python3 -m http.server 8080
```

Open `http://localhost:8080/`. To preview the generated build, run `cd dist && python3 -m http.server 8080` instead. GitHub Pages serves the root static files directly; the build is an optional reproducibility check, not a mandatory deployment step.

## Live interactive flow (requires MetaMask and test tokens)

1. Connect a wallet on **Studionet chain 61999**. The wallet requests explicit approval for each state-changing transaction.
2. Select Example HIT or write a question and decision rubric; click **1 · Create job** and approve the wallet prompt.
3. Wait for transaction finalization. The Job ID is taken from the receipt return when available. If it is unavailable, the frontend attempts a cautious fallback: read `last_job_of` on the same wallet and independently verify that the new ID is beyond the pre-write baseline and that the poster, question and rubric match. This is not a cryptographic binding to the original transaction, so simultaneous same-wallet writes with identical claims remain ambiguous; confirm in Studio if necessary.
4. Submit a public HTTP(S) URL, approve, wait; then click **3 · Run verification**, approve and wait.
5. Press **Read proof** to display the chain's accepted job state. HIT/MISS/DEAD are the only terminal verdicts. A PARSE issue remains SUBMITTED, not settled.

**Transaction safety:** One click makes at most one `writeContract` request. Direct GenLayer Studio transaction status and exact GenVM return values are checked before falling back to EVM logs; no unsigned browser action can create a transaction. The pinned **genlayer-js v0.18.10** SDK estimates EVM gas internally; the app does not call unsupported v2 fee-estimation methods. The wallet returns a transaction hash that can already identify a GenLayer Studio transaction. The UI first checks the direct Studio status and its exact GenVM return value, then falls back to decoding an EVM consensus `NewTransaction` event where available. If the event is absent, Spotter checks finalized contract state against the pre-write baseline and exact expected action. It must not claim success on an unmatched state. Pending requests remain locked; **Resume previous transaction** only reads, never resends. **Clear local tracking** asks for explicit confirmation and does not cancel an on-chain transaction. This is a client-side safeguard; users must still review each MetaMask prompt. The UI never asks for a seed phrase or private key. A read-only check never creates blockchain transactions.

## Implementation

- `Spotter.py`: deployed-compatible GenLayer Intelligent Contract source (unchanged by reviewer-readiness fixes).
- `index.html`: responsive site; `app.mjs`: wallet, RPC, transaction lifecycle, safe DOM rendering.
- `jobs-browser.mjs`: read-only contract discovery, paging, sorting, wallet filters and owner-checked continuation; independent Node tests.
- `spotter-core.mjs`: testable input validation and receipt decoding helpers.
- `tests/offline.test.mjs`: standalone Node.js tests (no external downloads).
- `scripts/build.mjs`: syntax check and static dist builder.
- `SETUP.md`: review walkthrough; `TESTS.md`: automated and manual evidence matrix.

**Limitations:** Studionet is experimental. Validator web access and AI interpretation may vary. URL content can change and a page hash proves only the bytes observed during that evaluation, not enduring truth. Job discovery uses bounded client-side scanning because this deployed contract has no enumeration endpoint; it is not a production-grade indexer. No escrow, bounty distribution, dispute market, wallet automation, or production mainnet security guarantees.

For a reproducible acceptance decision, review the actual on-chain `get_job` result and a real wallet-signed transaction in a fresh session. CI validates syntax and frontend safety logic **offline**; it does not prove live GenVM consensus or MetaMask interoperability. The SDK version and wallet/GenLayer hash distinction are pinned and covered by regression tests.


### Recovering an accepted Job from a wallet address

The deployed `Spotter.py` contract stores `last_job` under the **exact string** returned by `str(gl.message.sender_address)`. Because this is a string-keyed map, a lowercase EVM wallet address can return an empty result when the stored string uses different checksum casing. The frontend first tries the connected address, then reads existing finalized Job records (bounded IDs 1–16) to obtain the **exact `poster` string as saved on-chain** and retries `last_job_of` with that value. It then verifies poster, question, rubric and the original pre-write baseline. This does not submit a replacement blockchain transaction.

Two identical recent `open_job` actions from the same wallet are not uniquely attributable by contract state alone. Use the Studio transaction details and the real `open_job` return for indisputable attribution; never claim this heuristic proves which wallet transaction created which Job.

### Distinguish a GenLayer transaction from its wallet receipt

On GenLayer Studio the hash returned by MetaMask can already appear as the **GenLayer transaction hash** in Studio Explorer. Do not require a separate EVM `NewTransaction` event to recognize it. On **Resume previous transaction**, Spotter first calls the SDK's read-only `getTransaction({ hash: savedHash })`. Only if that direct lookup is unavailable does it fall back to the EVM log lookup and cautious contract-state comparison.

A directly confirmed `FINALIZED / SUCCESS` transaction is **not** automatically assigned a Job ID. Spotter accepts only a distinct returned Job ID that matches the stored question, rubric, poster and pre-write baseline. If the SDK does not expose the output, open the exact hash in Studio Explorer and inspect **GenVM Execution → Return Value**. Do not create another Job or clear the old pending record just to bypass the missing return.

### Recover a finalized Studio transaction in a new browser tab

A previous `open_job` may be FINALIZED even if the original browser tab is gone. The former `sessionStorage` record is tab-scoped; **No pending transaction in this browser tab** is not evidence of chain failure.

Open **Transaction details & troubleshooting → Recover transaction by hash** and paste the exact public 66-character transaction hash from GenLayer Studio Explorer. Choose **Inspect transaction hash (read-only)**; no wallet is required and no write is sent. The result displays the Studio transaction status, consensus, GenVM result (if reported), and **only an explicit Job return** from the SDK. A safely verified Job return opens the read-only proof; it never automatically authorizes Submit or Judge.

For historical hashes `0xaa6cead7f9e18e900c1d74a91c4adfc54019dadb2299c4a6f1619d8aca0bbe06` and `0x2c998a84010127893291b9819e19105d94c65077d394ba0e4a1dab3d158d8bdd`, Studio previously showed FINALIZED / SUCCESS. To attribute exact Job IDs, inspect each Studio transaction's **GenVM Execution → Return Value** if the SDK response does not include the result. Do not generate more test transactions to compensate for a missing browser session.

### Continue an existing OPEN job without creating a duplicate

After pasting an existing accepted `open_job` hash and inspecting it read-only, Spotter displays **Continue with Job #N** if the transaction returned an explicit ID and the ID matches a finalized on-chain job. Connect any wallet on Studionet to participate in the permissionless OPEN/SUBMITTED workflow; a finalized job or an unresolved locally tracked transaction still disables continuation.

Click **Continue with Job #N**. This performs a *fresh finalized read* to verify Job identity and status, and restores the on-chain question and rubric into the form. **No write occurs** during recovery. For `OPEN` choose **2 · Submit evidence** and review the MetaMask prompt; when the accepted state becomes `SUBMITTED`, choose **3 · Run verification** and approve separately. For SUBMITTED, the contract permits any wallet to invoke `judge`; only the original hunter can replace their own URL. Public proof browsing still never changes the active job.

The older successful `open_job` hashes `0xaa6cead7f9e18e900c1d74a91c4adfc54019dadb2299c4a6f1619d8aca0bbe06` and `0x2c998a84010127893291b9819e19105d94c65077d394ba0e4a1dab3d158d8bdd` returned Job IDs **5** and **6** respectively, each OPEN when reviewed. These examples are historical user-observed evidence, not new wallet writes or a promise that the chain will remain unchanged.
