# Spotter — Builder Project reviewer evidence

**Project:** Spotter · **Network:** GenLayer Studionet (chain ID 61999)  
**Website:** https://bearbaba.github.io/spotter/  
**Repository:** https://github.com/bearbaba/spotter  
**Deployed contract:** https://explorer-studio.genlayer.com/address/0x730143dF831778569e15975Ef44dFDeCB668609b  
**Studio import:** https://studio.genlayer.com/?import-contract=0x730143dF831778569e15975Ef44dFDeCB668609b

## Reviewer quick-start: prove it works without a wallet

1. Open the website. The main focus is **Verify a public claim**: claim + rubric + public URL → Create → Submit → Verify. No historical activity is promoted in the homepage hero.
2. To browse old jobs, select **Find and continue your work** in the workspace. This opens **Activity & history** below the primary workflow. It lazily loads finalized on-chain records without a wallet, ID or hash, and shows retryable RPC failures.
3. For a stable historical reference, choose **Sample verification** (Job #1). The prior live HIT case was `https://example.org` with SHA-256 `13f5e50297bde87abbf51cd1cd43678109b1a72a52c1cefa3b56844464e4f25c`. Confirm it again via the actual contract read; historical values are not assertions about future web contents.
4. Optionally connect a Studionet MetaMask wallet. In the secondary history panel, **My jobs** lists jobs whose recorded poster or hunter matches that wallet. Use **All jobs** to participate in others' public OPEN/SUBMITTED work. Selecting a Job only reads finalized state and does not request a signature.
5. An eligible **OPEN** Job can accept an HTTP(S) URL by an authorized wallet transaction (`submit_url`). A **SUBMITTED** Job can be evaluated via a separate wallet-approved `judge` call. On-chain outcomes are HIT/MISS/DEAD; malformed consensus parsing remains SUBMITTED / PARSE, not falsely labeled final.

The site is read-only until someone deliberately approves a write in MetaMask. It never requests private keys or seed phrases, and has no payments, escrow, reward or bounty distribution.

## Prior on-chain evidence

- Contract deployed and accessible on Studionet: `0x730143dF831778569e15975Ef44dFDeCB668609b`.
- Job #1 previously verified **HIT** for `https://example.org` with recorded page hash `13f5e50297bde87abbf51cd1cd43678109b1a72a52c1cefa3b56844464e4f25c`.
- Job #2 previously verified **HIT** for a GenLayer documentation page with page hash `9910555ca131ba1af5cbd1a6fc66c1f33d7534682fb54df4e7e1da6ca7f7d1bf`.
- GenLayer Studio confirmed `0xaa6cead7f9e18e900c1d74a91c4adfc54019dadb2299c4a6f1619d8aca0bbe06` as a successful FINALIZED `open_job`; its explicit return is Job **#5**, previously OPEN.
- GenLayer Studio confirmed `0x2c998a84010127893291b9819e19105d94c65077d394ba0e4a1dab3d158d8bdd` as a successful FINALIZED `open_job`; its explicit return is Job **#6**, previously OPEN.

These are historical observations, not a claim that Jobs #5/#6 have achieved HIT/MISS/DEAD. View the current states directly on-chain.

## Reproduce the repository build

Use Node.js 20+ and Python 3. No npm install, paid account, API keys or environment secrets needed.

```bash
git clone https://github.com/bearbaba/spotter.git
cd spotter
npm run verify
python3 -m py_compile Spotter.py
python3 -m http.server 8080
```

Open `http://localhost:8080` in a browser. `npm run verify` checks modules, builds the static `dist/` site and runs offline regression tests. GitHub Actions **Verify Spotter** runs equivalent Node and Python checks. GitHub Pages publishes the static frontend. Static checks are not a substitute for real live GenVM consensus or wallet testing.

## Contract design and accurate limitations

The deployed GenLayer `Spotter.py` defines `open_job(question,rubric) -> job ID`, `submit_url(job ID,url)`, `judge(job ID)`, `get_job(job ID)`, `get_status(job ID)`, and `last_job_of(address string)`. The first hunter locks a pending URL from other hunter overwrites. GenLayer's web rendering and equality principle evaluate the actual fetched source, recording reason, observed characters and SHA-256 digest. The contract currently has no enumeration endpoint, so the frontend implements *bounded client-side discovery* by reading sequential numeric IDs in batches with `latest-final`; it is not a scalable production indexer.

The contract does not guarantee the objective truth of AI verdicts, immutable public sources, or successful URL fetches. Studionet is a trial environment, and no real payments or warranties are provided.

## Ready-to-paste submission fields

**One-liner:** Verify public web claims using GenLayer consensus: automatically discover jobs, submit evidence, and inspect on-chain HIT/MISS/DEAD receipts.

**Project overview:** Spotter is a permissionless public-web verification workflow built on GenLayer Studionet. A poster creates a question and evaluation rubric; a hunter submits a live URL, and GenLayer validators read the page and record a HIT, MISS or DEAD verdict with a reason and SHA-256 hash. The responsive web app automatically discovers existing on-chain jobs without a wallet, displays public evidence, filters a connected wallet's activity and lets users continue an eligible job without remembering IDs or transaction hashes. Writes require explicit MetaMask approval; read-only verification requires no wallet. A job's pending URL is locked to its first hunter. PARSE errors remain nonfinal. Source, frontend, setup guide and regression tests are published in GitHub; the existing contract is deployed on Studionet 61999. This is a testnet prototype with no reward payments or guarantees of objective truth.

**How to use:** Open the website → browse Explore verifications → select Read proof → optionally connect wallet and view My jobs → select an OPEN job and Submit evidence with MetaMask approval → choose Run verification with separate approval → view finalized result.

**Expected outcome:** From the live contract, Job #1 has a historical HIT on example.org and a stored page hash; Jobs #5 and #6 have separately verified successful open_job transactions. A fresh user-created flow should transition OPEN → SUBMITTED → HIT/MISS/DEAD or remain SUBMITTED/PARSE if consensus parsing fails. All statuses must be independently read from the contract. No approval is needed for read-only inspection.

**Demo video:** A new recording that shows this *current* interface is recommended before submitting a new Projects contribution; do not reuse an outdated video without reviewing its accuracy.
