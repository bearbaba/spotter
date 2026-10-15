# Deploy Spotter V3 as a fresh GenLayer Intelligent Contract

**Not deployed yet.** This procedure requires the owner's own wallet signature. No private key or seed phrase should be shared with ChatGPT, GitHub, or a deployment script.

## Predeployment freeze

1. Choose the frozen V3 GitHub commit and inspect `contracts/proofgate.py` in its entirety. It is intentionally a **new instance**, not a code update of the old contract.
2. Confirm GitHub CI for that exact SHA is green. Check that `get_version()` is `3.0.0`, `get_work_count()` exists, and `create_work` rejects empty rubrics.
3. In GenLayer Studio, choose **Studionet**, chain ID `61999`. Open the exact source file with **Add From File**. The constructor `__init__()` requires **zero** parameters.
4. Deploy with your own authorized wallet. Do not retry an uncertain submission; first inspect its transaction hash.

## Trust but verify the actual deployment

Record the *real* values after checking FINALIZED + GenVM SUCCESS:

| Verification | Value |
| --- | --- |
| Studionet chain ID | `61999` |
| GitHub source SHA | *Not frozen yet* |
| Deployed source SHA256 | *Not recorded yet* |
| New contract address | *Not deployed yet* |
| Deployment transaction | *Not deployed yet* |
| GenVM execution result | *Unverified* |
| `get_version()` | Expect `3.0.0` |
| `get_work_count()` | Expect `0` |
| `get_work("1")` | Expect `{}` |

Do not call an old deployment V3. GenLayer Studio guidance: https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio/deploying-contract

## Real-chain smoke tests before connecting the website

Perform these on the **new address**, using test PRs deliberately prepared for these scenarios:

- Happy path: client creates Work #1 with locked target PR, branch and specific rubric; worker submits; GenLayer evaluates; inspect `get_work("1")` until actual ACCEPTED; then client/worker issues certificate; verify CERTIFIED and digest.
- Long reason: check a known valid AI response over 200 chars is not rejected solely for its explanation length. Offline tests simulate the old 222-character failure; the real Studio test must confirm no equivalent `ValueError`.
- Wrong worker: a wallet other than the nominated worker cannot submit.
- Negative evidence: unmerged PR or wrong locked branch/repo/required label stays REVIEW/REJECTED and cannot issue a certificate.
- Outsider: a wallet not matching client/worker cannot issue a certificate, even when Work is ACCEPTED.
- Receipt: verify finality **and execution** separately. A successful transaction can legitimately store REVIEW; the UI must reflect the true work state.
- Browser: verify wallet selection/network, read Work ID, transaction hashes, recovery and cross-tab signing safety. Never reset or forge stored transaction outcomes.

## Safe website cutover

**Only when checks above pass:** replace the old contract address in `proofgate-ui.mjs` and `index.html`, remove all hardcoded old Work #1 certificate links/cards, and update README, REVIEWER and any links to the new Studio/Explorer record. Do a final search for the old address and legacy certificate tx. Build, test and deploy **one Preview**; read Work #1 from the new contract, then merge and publish Production.

Contract source and owner-signed deploy always come before a new frontend address. No legacy Work is migrated.
