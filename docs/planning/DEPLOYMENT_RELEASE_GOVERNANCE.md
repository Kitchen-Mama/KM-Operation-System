# Deployment & Release Governance — Manual, User-Controlled (2026-08-04)

> **Purpose:** freeze how source, runtime, and data move to production. **Nothing deploys automatically** because Claude changed local files, a commit exists, GitHub changed, or the generated bundle changed. Every release is explicitly reviewed and executed by the user. This document + `DEPLOYMENT_RELEASE_LOG.md` are the governance owners; this round adds **no automatic deployment**.
> **Status:** LANDED (governance only). No push, no Apps Script deployment, no live Spreadsheet access performed by this round.

---

## 1. Source of truth (frozen)

| Authority | Role | Rule |
|---|---|---|
| **Git repository** (`main`) | canonical **source** authority | the only place source changes originate; every deploy references a Git commit |
| **Apps Script project** | deployed **runtime copy** | never the sole home of a source change; manual edits must be synced back to Git or reverted |
| **Google Sheets (Operation System Database)** | production **data** authority | never manually edited as part of a code release; schema changes only via authorized S0-3 migration |

- The generated bundle `assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs` is **built** by `assets/tools/build-apps-script-bundle.js` from `assets/js/core/*.js` — **never edited manually** (in repo or in Apps Script).
- **Git push** and **Apps Script deployment** are **separate, explicit** operations. One never implies the other. Frontend (GitHub Pages) release is a third separate operation.

---

## 2. Manual release flow (frozen sequence)

1. Claude completes a task.
2. Local tests pass (report states which, and the pre-existing `replen-draft-completeness` failure honestly).
3. One clean checkpoint commit is created (no push).
4. The Completion Report lists the **exact changed files** + the **changed-file classification** (§4).
5. User reviews the changed files.
6. User explicitly approves the GitHub push.
7. User manually pushes the Git commit to GitHub; verify the remote commit hash.
8. User syncs **only** the files marked `APPS_SCRIPT_SYNC_REQUIRED` into the Apps Script project.
9. If a **bundled source** (`assets/js/core/*.js`) changed → run `node assets/tests/supply-planning-apps-script-bundle.test.js` (reproducibility) and the bundle build/check, then sync the regenerated `90_generated_supply_planning_bundle.gs` and record its build hash.
10. Save Apps Script source; verify functions parse (no red errors).
11. Create a new Apps Script **deployment version** where required.
12. Record **Git commit ↔ Apps Script deployment version** in the Release Log.
13. Run the authorized smoke test (read-first, then the specific action on the verification copy where applicable).
14. Record the result.
15. On failure: restore the prior Apps Script deployment version; **do not** manually modify live DB; open a separate hotfix.

No automatic push. No automatic deployment. No silent overwrite of every `.gs` file.

---

## 3. Manual Apps Script sync safety

**Before sync:** confirm exact project name; confirm Script ID (or masked identity); confirm the bound Spreadsheet identity (must be the intended target — recall S0.5 `PRODUCTION_DB_SPREADSHEET_ID_` is empty → fail-closed until the verification-copy id is set); confirm the changed-file list; confirm no migration is bundled implicitly.

**After sync:** compare Apps Script file names against the changed-file list; verify no unrelated file was overwritten; verify the bundle namespace/hash if the bundle was part of the release; do **not** run unapproved functions; never use "Deploy latest automatically".

---

## 4. Changed-file deployment classification

Every Completion Report classifies each changed file as exactly one of:

- `GIT_ONLY` — repo record only (specs, docs, frontend JS/CSS not on the live host yet, tests).
- `APPS_SCRIPT_SYNC_REQUIRED` — a `.gs` handler/router/config that must be copied into the Apps Script project.
- `BUNDLE_REBUILD_REQUIRED` — a `assets/js/core/*.js` changed → rebuild + sync `90_generated_*.gs`.
- `FRONTEND_GITHUB_PAGES_REQUIRED` — a frontend asset served to browsers (HTML/CSS/JS pages) that requires a Pages redeploy.
- `DOCUMENTATION_ONLY` — planning/governance docs.
- `NO_DEPLOYMENT` — nothing to deploy.

Only `APPS_SCRIPT_SYNC_REQUIRED` files are copied into Apps Script. **Do not copy every `.gs` on every release.** If shared-dependency drift requires extra files, list them explicitly with the reason.

---

## 5. Bundle governance

- The generated bundle is a **build output**, not source. Editing it manually (repo or Apps Script) is prohibited.
- A bundle change is only valid if it is the deterministic output of `build-apps-script-bundle.js` over the current `assets/js/core/*.js`, verified byte-for-byte by `supply-planning-apps-script-bundle.test.js`.
- Record the bundle sha256 (from the build/test output) in the Release Log whenever the bundle is part of a release.

---

## 6. Deployment equivalence (minimum evidence)

Do **not** claim "repository and live deployment are equivalent" without recording ALL of:

- Git commit hash;
- changed-file list + classification;
- Apps Script deployment version;
- generated bundle sha256 (when the bundle was part of the release);
- frontend deployed commit (when a frontend asset was part of the release);
- smoke-test result.

Frontend release does not imply Apps Script changed; Apps Script deployment does not imply the frontend updated. When one feature needs both, record **both** versions.

---

## 7. Release checklist (reusable)

**PRE-RELEASE:** working tree clean · tests reviewed · commit exists · changed files reviewed · no unexpected `.gs` changes · bundle check passes where applicable · DB migration status confirmed · backup requirement confirmed · target environment confirmed.

**GITHUB:** user approves push · push the exact commit · verify remote commit hash.

**APPS SCRIPT:** verify target project · verify bound Spreadsheet identity · sync only approved files · never edit the generated bundle manually · save · verify functions parse · create a deployment version if required.

**POST-DEPLOY:** run the authorized smoke test · record deployment version · record commit hash · record bundle hash · verify no Header/schema mutation (S0/S0.5 tokens) · record the rollback version.

---

## 8. Frontend GitHub Pages release (separate)

For static frontend changes: user pushes the approved commit → GitHub Pages deploys from the configured branch → verify the deployed commit/version → note that a browser cache refresh may be required. A frontend release does not touch Apps Script source, and vice-versa. Record both versions when a feature spans both.

---

## 9. Relationship to S0/S0.5 safety and API migration

- Schema safety (S0/S0.5) is enforced in code; this governance layer adds the **human release gate** on top. Neither replaces the other.
- **Future API migration releases (API-1+) follow this same manual, user-controlled deployment** — see `API_MIGRATION_MASTER_PLAN.md`. The API cutover phases (API-5 Verification Copy, checkpoints F5/F6) are release events governed by this document.

---

*Companion:* `DEPLOYMENT_RELEASE_LOG.md` (the append-only ledger + reusable template). Documentation only; no code/DB/deploy change implied.
