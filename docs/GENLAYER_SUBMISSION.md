# Spotter V3 — GenLayer Builder Project Submission

**Project name:** Spotter

**Primary category:** AI & Intelligent Contracts / Verifiable Work

**One-liner:** Spotter uses a GenLayer Intelligent Contract to verify merged GitHub contributions against locked acceptance criteria and issue on-chain work certificates.

## Description

Spotter turns software-contribution acceptance into an auditable, on-chain
workflow. A creator locks a nominated contributor, an exact GitHub PR,
repository, target branch, optional required label and written acceptance
criteria in a GenLayer Intelligent Contract. The contributor submits the Work.
After the PR is merged, the Intelligent Contract verifies the locked GitHub
evidence boundary and uses GenLayer AI-backed consensus to evaluate the PR's
title and description against those criteria. Only Work with an on-chain
ACCEPTED outcome can be certified by an authorized creator or contributor.

This is a consequential workflow: the consensus-assisted acceptance verdict
controls the contract's ability to issue a persistent CERTIFIED Work record.
It is not a generic web-page classification demo. The app includes explicit
MetaMask signing, finalized Work readback, transaction-hash history, and
evidence-aware receipt status reporting.

The video follows **Work #3 / GitHub PR #32** through creation, contribution
submission, GitHub merge, AI evaluation and certification on GenLayer Studionet.
All footage is from actual application interactions, with embedded English
explanatory subtitles. The final recorded Work state is CERTIFIED.

**Scope boundary:** Spotter is experimental Studionet software. It checks
GitHub PR metadata and textual evidence, not full source-code correctness.
AI verdicts do not guarantee truth. No payment, escrow, code-security audit,
independent receipt audit or deployed-source byte-for-byte verification is
claimed.

## Evidence

- **Demo video:** https://youtu.be/BJSXW3iZNFM
- **Live website:** https://spotter-weld.vercel.app/
- **GitHub repository:** https://github.com/bearbaba/spotter
- **Demo contribution:** https://github.com/bearbaba/spotter/pull/32
- **PR #32 merge commit:** `b6956267a431e2feeb0c4f5205cfdd1b3aef12d5`
- **GenLayer Studio contract:** https://studio.genlayer.com/?import-contract=0x506205eBc1ba011707D63d8a152625baaC63002D
- **Network:** GenLayer Studionet, chain ID 61999
- **Contract version:** 3.0.0
- **Readback to inspect:** `get_work("3")`, recorded state `CERTIFIED`
- **Review and evidence policy:** https://github.com/bearbaba/spotter/blob/main/REVIEWER.md

## Reviewer quick path

1. Watch the 3:16 video with burned-in English captions.
2. Open PR #32 and confirm its merge into `main`.
3. Check the V3 contract in GenLayer Studio, and read finalized Work #3.
4. Compare the locked PR/rubric, merge SHA, evidence digest and state.
5. Treat contract Work state and individual transaction receipts as distinct checks.
