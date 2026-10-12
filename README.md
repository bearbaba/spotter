# Spotter — web evidence, on-chain verdicts

**GenLayer Studionet 61999** · [Live GitHub Pages](https://bearbaba.github.io/spotter/) · [Contract in Studio](https://studio.genlayer.com/?import-contract=0x730143dF831778569e15975Ef44dFDeCB668609b) · [Explorer](https://explorer-studio.genlayer.com/address/0x730143dF831778569e15975Ef44dFDeCB668609b)

Spotter lets a poster define a question and a decision rubric. A hunter submits a live public URL; GenLayer's validators fetch and evaluate it. The on-chain record exposes a **HIT**, **MISS**, or **DEAD** verdict, an explanation, and fetch metadata such as the returned page hash. **This is an experimental AI-assisted evaluation, not a guarantee of factual truth or immutable historical webpage content.** There is no bounty or payment system in the current Spotter contract.

## Verify without signing anything (recommended reviewer path)

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

**Transaction safety:** One click makes at most one `writeContract` request. The pinned **genlayer-js v0.18.10** SDK estimates EVM gas internally; the app does not call unsupported v2 fee-estimation methods. A wallet write first yields an EVM hash. The UI decodes the distinct GenLayer ID from the Studionet consensus `NewTransaction` event, then checks `waitForTransactionReceipt({status: "ACCEPTED"})`. If an EVM receipt omits NewTransaction logs, Spotter checks finalized contract state against the pre-write baseline and exact expected action. It must not claim success on an unmatched state. Pending requests remain locked; **Resume previous transaction** only reads, never resends. **Clear local tracking** asks for explicit confirmation and does not cancel an on-chain transaction. This is a client-side safeguard; users must still review each MetaMask prompt. The UI never asks for a seed phrase or private key. A read-only check never creates blockchain transactions.

## Implementation

- `Spotter.py`: deployed-compatible GenLayer Intelligent Contract source (unchanged by reviewer-readiness fixes).
- `index.html`: static page; `app.mjs`: wallet, RPC, transaction lifecycle, safe DOM rendering.
- `spotter-core.mjs`: testable input validation and receipt decoding helpers.
- `tests/offline.test.mjs`: standalone Node.js tests (no external downloads).
- `scripts/build.mjs`: syntax check and static dist builder.
- `SETUP.md`: review walkthrough; `TESTS.md`: automated and manual evidence matrix.

**Limitations:** Studionet is experimental. Validator web access and AI interpretation may vary. URL content can change and a page hash proves only the bytes observed during that evaluation, not enduring truth. Job discovery/indexing is not implemented. No escrow, bounty distribution, dispute market, wallet automation, or production mainnet security guarantees.

For a reproducible acceptance decision, review the actual on-chain `get_job` result and a real wallet-signed transaction in a fresh session. CI validates syntax and frontend safety logic **offline**; it does not prove live GenVM consensus or MetaMask interoperability. The SDK version and wallet/GenLayer hash distinction are pinned and covered by regression tests.


### Recovering an accepted Job from a wallet address

The deployed `Spotter.py` contract stores `last_job` under the **exact string** returned by `str(gl.message.sender_address)`. Because this is a string-keyed map, a lowercase EVM wallet address can return an empty result when the stored string uses different checksum casing. The frontend first tries the connected address, then reads existing finalized Job records (bounded IDs 1–16) to obtain the **exact `poster` string as saved on-chain** and retries `last_job_of` with that value. It then verifies poster, question, rubric and the original pre-write baseline. This does not submit a replacement blockchain transaction.

Two identical recent `open_job` actions from the same wallet are not uniquely attributable by contract state alone. Use the Studio transaction details and the real `open_job` return for indisputable attribution; never claim this heuristic proves which wallet transaction created which Job.

### Distinguish a GenLayer transaction from its wallet receipt

On GenLayer Studio the hash returned by MetaMask can already appear as the **GenLayer transaction hash** in Studio Explorer. Do not require a separate EVM `NewTransaction` event to recognize it. On **Resume previous transaction**, Spotter first calls the SDK's read-only `getTransaction({ hash: savedHash })`. Only if that direct lookup is unavailable does it fall back to the EVM log lookup and cautious contract-state comparison.

A directly confirmed `FINALIZED / SUCCESS` transaction is **not** automatically assigned a Job ID. Spotter accepts only a distinct returned Job ID that matches the stored question, rubric, poster and pre-write baseline. If the SDK does not expose the output, open the exact hash in Studio Explorer and inspect **GenVM Execution → Return Value**. Do not create another Job or clear the old pending record just to bypass the missing return.
