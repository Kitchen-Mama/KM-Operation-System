# Sweep Evidence Format — `km-sweep-evidence/1`

## Why this exists

The R47-D baseline was measured once over 626 suites and its raw output was discarded. The
classified records survived only in a session-scoped scratch file that was never committed. When the
collector was later found to be mis-parsing two mutation dialects, those suites could not be
**re-classified** — only re-run. The arithmetic reconciled and the thirteen affected suites were
re-verified individually, but the baseline itself was **not independently reproducible**.

This format closes that gap. A sweep now leaves behind the bytes it judged, so any later correction
to the collector can be replayed against the original evidence instead of requiring another sweep.

## Layout

```
docs/evidence/s8-r48-sweep/<run-id>/
  manifest.json
  raw/<suite>.out.txt      stdout, verbatim
  raw/<suite>.err.txt      stderr, verbatim
```

**The two streams are stored apart.** Classification reads them concatenated, because a suite that
dies writes only to stderr — but merging them in storage would throw away the very distinction that
revealed the ten dead F1A harnesses, whose stdout was empty.

## Manifest

Top level: `schema_version`, `run_id`, `classified_at`, `git_commit`, `collector_sha256`,
`suite_registry_hash`, `registered_count`, `secret_scan`.

Per record: `suite_name`, `exit_code`, `stdout_ref`, `stderr_ref`, `stdout_sha256`, `stderr_sha256`,
`combined_sha256`, `passed_assertions`, `failed_assertions`, `fail_lines`, `mutant_count`,
`survived_mutants`, `vacuity_verdict`, `verdict`, `reason_codes`.

`collector_sha256` records **which collector produced these verdicts**, so a replay under a different
collector is a visible comparison rather than a silent substitution. `suite_registry_hash` states
which suite set the run describes.

Refs are always POSIX-separated. `path.join` would bake in backslashes on Windows and the evidence
would replay only on the machine that wrote it — most of what was wrong with the scratch file this
replaces.

## Usage

```
node assets/tools/run-regression-sweep.js --evidence docs/evidence/s8-r48-sweep --run-id <id>
```

Replay and integrity checking live in `assets/tools/sweep-evidence.js`
(`readEvidence`, `verifyIntegrity`, `replay`), gated by
`assets/tests/sweep-evidence-replay-s8-r48f.test.js`.

## Fail-closed guarantees

Each is a test, not a convention: unknown `schema_version` refuses; a missing raw file refuses; a
hash mismatch refuses (and replay refuses with it); duplicate suite records refuse; an existing run
directory is **never** overwritten; suite names that are not `[A-Za-z0-9._-]+` are rejected before
they become paths.

## Security

Raw output is committed, so it is scanned **before anything is written**: Apps Script `/exec` URLs
and deployment ids, bearer tokens, authorization headers, cookies, Google API keys, private-key
blocks, AWS access keys and email addresses. A hit **anywhere in the batch refuses the entire
write** and leaves nothing on disk — a partially-written run would be worse than none, because it
would look complete.

`secret_scan: "CLEAN"` in a manifest means the scan ran and found nothing, not that it was skipped.

### Quarantine

The scan can only run once the sweep has produced output, and a full sweep is authorized one run at
a time. A refusal that also destroyed the bytes would cost the entire run — and ten suites in this
registry carry Apps Script `/exec` URLs in their source, so the risk is live.

```
node assets/tools/run-regression-sweep.js --evidence docs/evidence/s8-r48-sweep \
     --quarantine <a path OUTSIDE the repository> --run-id <id>
```

On a hit the batch is written to the quarantine root instead — preserved verbatim, never scrubbed,
never committed — the offending suites are named, and the run exits nonzero. **The repository path
still refuses unconditionally**; quarantine preserves evidence for inspection, it does not make it
committable. Without `--quarantine` the refusal is exactly as before: nothing is written anywhere.

## Reproducibility limits — read this before trusting a replay

- A replay reproduces **classification**, not execution. It proves what the collector concludes from
  those bytes; it does not re-prove the bytes.
- Hashes detect tampering and loss. **A hash alone does not permit reclassification** — that needs
  the stored bytes, which is why they are stored.
- Non-deterministic suites (timing, dates, environment) may produce different bytes on a later run.
  Evidence captures one run, not a guarantee about the next.
- The committed `fixture-r48f-controlled` run is a **format fixture from five controlled suites**,
  not a baseline. The authoritative baseline remains `S8_R47_D_BASELINE_CLOSURE.md`:
  **499 CLEAN / 6 FAILING / 121 UNVERIFIABLE** across 626 suites.
