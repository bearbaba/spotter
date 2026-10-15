# Spotter V3 — Verifiable software work on GenLayer

**Stage:** V3 Preview candidate (not yet promoted to Production).  
**Network:** GenLayer Studionet (chain ID 61999).  
**New work contract:** [Open GenLayer Studio](https://studio.genlayer.com/?import-contract=0x506205eBc1ba011707D63d8a152625baaC63002D) — `0x506205eBc1ba011707D63d8a152625baaC63002D`.  
**Deployment transaction:** [Explorer](https://explorer-studio.genlayer.com/tx/0xd7f3d90b020734129699f207cab4e11b4562a3d7f5876c2903cfb69c2b2aa4b5).  
**GitHub review:** [V3 rollout and release gates](https://github.com/bearbaba/spotter/pull/28).

Spotter locks each software contribution to a real GitHub PR, target repository/branch, optional label, nominated worker and a mandatory acceptance rubric. GenLayer independently verifies GitHub merge metadata before qualitative AI checks PR title and description. Only an ACCEPTED Work can become CERTIFIED by the assigned client or worker.

## New V3 on-chain example

Work #1 on **V3 (not the old contract)** was created, submitted, assessed as ACCEPTED and issued a CERTIFIED acceptance record for [bearbaba/spotter PR #26](https://github.com/bearbaba/spotter/pull/26).

- **Certificate tx link:** [GenLayer Explorer](https://explorer-studio.genlayer.com/tx/0x614e11c3675f0ab6c9d77fad4e713d2f8deb5ad5f47d6fbc99447021c1c310b0).
- **Locked merge commit:** `84c1b5d74bc7ca8a63b7a363cb919f53c331ea0a`.
- **Evidence digest:** `9aff4aca44f1395a2d6348f9f43719f8a98b7a44d8ca4669bbc0b9c65881ab22`.
- **Observed contract readback:** `get_version() = "3.0.0"`; `get_work("1").state = "CERTIFIED"`. These are operator-supplied Studio observations; independent receipt/source-parity validation is still outstanding.

V3 browser history is scoped to the **new contract**; old Work IDs and old browser transaction locks are not imported into V3.

## Source and verification

- [Intelligent Contract](./contracts/proofgate.py)
- [Locked evidence and security policy](./REVIEWER.md)
- [V3 acceptance specification](./docs/SPOTTER_V3_SPEC.md)
- [Deployment/runbook](./docs/SPOTTER_V3_DEPLOY.md)
- [Deployment evidence and outstanding audits](./deployments/studionet-v3.json)

```bash
npm run verify
python3 -m unittest discover -s tests -p 'test_proofgate*.py' -v
```

Spotter is experimental testnet software. A certificate records consensus-assisted acceptance, **not an audited payment, code security guarantee, GEN transfer or escrow release**. The main website remains unchanged until V3 Preview and release gates have been validated.
