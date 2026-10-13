# Spotter — Verified work on GenLayer

**One official website:** https://bearbaba.github.io/spotter/  
**Network:** GenLayer Studionet (61999)  
**Work contract:** [Spotter on GenLayer Studio](https://studio.genlayer.com/?import-contract=0xD57aE10754C44223ABf3bA04a43AC2023d92aBE7)

Spotter verifies software work against a locked GitHub PR source and an acceptance rubric. Create work, submit for review, evaluate with GenLayer, and issue a certificate only when the work is accepted. The main website now presents this single work-certification experience.

## Live proof

Work #1 reached **CERTIFIED** for [bearbaba/spotter PR #24](https://github.com/bearbaba/spotter/pull/24). [Finalized successful certificate-issuance transaction](https://explorer-studio.genlayer.com/tx/0xc3d1a5c2611111a8763d74582c07c75bdb8f4694a89f6363e3fabca933107599).

- Work contract source: [contracts/proofgate.py](./contracts/proofgate.py).
- Acceptance/evidence policy and limitations: [REVIEWER.md](./REVIEWER.md).
- Frontend: [index.html](./index.html), [proofgate-ui.mjs](./proofgate-ui.mjs), [proofgate-core.mjs](./proofgate-core.mjs).
- The prior webpage classification experiment is retained in repository history and supporting files for regression/reference. It is **not loaded by the official website**.

## Verification

```bash
npm run verify
python3 -m unittest discover -s tests -p 'test_proofgate*.py' -v
```

The website is experimental testnet software. A certificate records a consensus-assisted acceptance decision; it is not an audited payment, escrow release or guarantee that contributed code is secure. Independent live negative-case tests, deployed-source parity and end-to-end wallet verification remain outstanding.
