# Project instructions — Kitchen Mama Operation System

## REMOTE WRITE PROHIBITION (RG-1, 2026-08-04) — highest priority

**The default boundary for any agent working in this repository is a LOCAL COMMIT. Never write to a remote.**

Unless the user gives a **separate, explicit, current-turn** command to push or deploy, the agent must **never** execute any of:

- `git push` (including `--force` / `--force-with-lease`)
- `gh pr create` · `gh pr merge` · `gh release create` · any `gh` remote write
- `git push`-containing scripts, aliases, or chained `commit && push`
- `clasp push` · `clasp deploy` · any Apps Script deployment
- GitHub Pages manual deploy · any remote API write · any change to remote branch state

These task words do **NOT** imply push or deploy: *finish, complete, land, checkpoint, commit, sync, update repository, ship, release*. A **local commit is the maximum default action**. After committing, **STOP** and hand the user the exact manual commands.

### Required end-of-task report line
When a task creates a commit, end with:

> **LOCAL COMMIT CREATED — NOT PUSHED — USER ACTION REQUIRED.** Local commit `<hash>`; `origin` unchanged.

### Manual release is USER-owned (two separate steps)
GitHub push and Apps Script sync are **separate, manual, user-only** operations. The agent presents these commands but must not run them:

```
cd "C:/Users/viczh/Desktop/KM/品牌資源/Vibe Coding/Operation System/Operation System"
git status
git log -1 --oneline
git diff HEAD^ HEAD --stat
git push origin main          # USER runs this after review
```

Apps Script: after push, the **user** opens the correct Apps Script project, copies only the `APPS_SCRIPT_SYNC_REQUIRED` files from the Completion Report (the generated bundle only if `BUNDLE_REBUILD_REQUIRED`), saves, and creates a deployment version where needed — never `clasp`/auto-deploy. See `docs/planning/DEPLOYMENT_RELEASE_GOVERNANCE.md`.

Do not place credentials or remote URLs in agent instructions. Do not configure automatic periodic fetch/push.

## Governance ownership
- `AUTOMATIC_REMOTE_WRITE = PROHIBITED` · `DEFAULT_BOUNDARY = LOCAL_COMMIT_ONLY` · `PUSH_OWNER = USER` · `APPS_SCRIPT_SYNC_OWNER = USER` · `DEPLOYMENT_OWNER = USER`.
- Full release process: `docs/planning/DEPLOYMENT_RELEASE_GOVERNANCE.md`; release ledger: `docs/planning/DEPLOYMENT_RELEASE_LOG.md`.
- Never modify `C:/km-lb`.
