# Spotter — web evidence, on-chain verdicts

**GenLayer Studionet 61999** · [Live GitHub Pages](https://bearbaba.github.io/spotter/) · [Contract in Studio](https://studio.genlayer.com/?import-contract=0x730143dF831778569e15975Ef44dFDeCB668609b) · [Explorer](https://explorer-studio.genlayer.com/address/0x730143dF831778569e15975Ef44dFDeCB668609b)

Spotter lets a poster define a question and a decision rubric. A hunter submits a live public URL; GenLayer's validators fetch and evaluate it. The on-chain record exposes a **HIT**, **MISS**, or **DEAD** verdict, an explanation, and fetch metadata such as the returned page hash. **This is an experimental AI-assisted evaluation, not a guarantee of factual truth or immutable historical webpage content.** There is no bounty or payment system in Spotter v1.

## Verify without signing anything (recommended reviewer path)

1. Open **https://bearbaba.github.io/spotter/** and choose **Read sample job #1 (no wallet)**.
2. The application must read `get_job("1")` on Studionet, display the on-chain status, URL and stored `page_hash`.
3. You can also paste Job IDs **2** and **3** and press **Read**, or view them directly through the Studio contract. Historical expected snapshots (verify on the chain, do not trust this list alone):
   - Job 1: HIT, `https://example.org`, `13f5e50297bde87abbf51cd1cd43678109b1a72a52c1cefa3b56844464e4f25c`
   - Job 2: HIT on docs.genlayer.com, `9910555ca131ba1af5cbd1a6fc66c1f33d7534682fb54df4e7e1da6ca7f7d1bf`
   - Job 3: historical SUBMITTED / PARSE case. **The question `__PARSE_TEST__` is NOT a deterministic fixture in the deployed Python contract.** Do not expect a new transaction to reproduce PARSE.
4. If the website or RPC is unavailable, use [the Studio contract](https://studio.genlayer.com/?import-contract=0x730143dF831778569e15975Ef44dFDeCB668609b) and call `get_job` with string IDs `"1"`, `"2"`, or `"3"`.

The deployed contract on Studionet has not been replaced. Read-only checks do not require a wallet or GEN.

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
2. Select Example HIT or write a question and decision rubric; click **Open job** and approve the wallet prompt.
3. Wait for transaction finalization. The Job ID must come from the `open_job` return. If the SDK cannot decode it, use the transaction in Studio to obtain that exact ID. **Never guess the ID or use a latest-job account shortcut under concurrency.**
4. Submit a public HTTP(S) URL, approve, wait; then click **Judge**, approve and wait.
5. Press **Read** to display the chain's accepted job state. HIT/MISS/DEAD are the only terminal verdicts. A PARSE issue remains SUBMITTED, not settled.

**Transaction safety:** One click makes at most one `writeContract` request. The pinned **genlayer-js v0.18.10** SDK estimates EVM gas internally; the app does not call unsupported v2 fee-estimation methods. A wallet write first yields an EVM hash. The UI decodes the distinct GenLayer ID from the Studionet consensus `NewTransaction` event, then checks `waitForTransactionReceipt({status: "ACCEPTED"})`. Pending requests remain locked until independently resolved; **Resume latest transaction** only reads, never resends. This is a client-side safeguard; users must still review each MetaMask prompt. The UI never asks for a seed phrase or private key. A read-only check never creates blockchain transactions.

## Implementation

- `Spotter.py`: deployed-compatible GenLayer Intelligent Contract source (unchanged by reviewer-readiness fixes).
- `index.html`: static page; `app.mjs`: wallet, RPC, transaction lifecycle, safe DOM rendering.
- `spotter-core.mjs`: testable input validation and receipt decoding helpers.
- `tests/offline.test.mjs`: standalone Node.js tests (no external downloads).
- `scripts/build.mjs`: syntax check and static dist builder.
- `SETUP.md`: review walkthrough; `TESTS.md`: automated and manual evidence matrix.

**Limitations:** Studionet is experimental. Validator web access and AI interpretation may vary. URL content can change and a page hash proves only the bytes observed during that evaluation, not enduring truth. Job discovery/indexing is not implemented. No escrow, bounty distribution, dispute market, wallet automation, or production mainnet security guarantees.

For a reproducible acceptance decision, review the actual on-chain `get_job` result and a real wallet-signed transaction in a fresh session. CI validates syntax and frontend safety logic **offline**; it does not prove live GenVM consensus or MetaMask interoperability. The SDK version and wallet/GenLayer hash distinction are pinned and covered by regression tests.
