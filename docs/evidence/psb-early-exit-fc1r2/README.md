# PSB bootstrap suite exited mid-mutation and left a mutant — **OPEN** (D-S8-B3-188)

Raw, unedited output of the FC1-R2 full regression that ABORTED at suite 376 of 692 (2026-10-21, HEAD
`4de48727` candidate before its evidence commit). Kept so the cause can still be investigated; a later
clean run is **not** taken as closing it.

| file | what |
|---|---|
| `sweep-aborted.json` | the sweep's own record: 376 executed, `aborted.after_suite = product-strategy-capability-bootstrap-p1-b8d-r10d`, `suite_exit_code 1`, `NO_SUMMARY`, 33,655 ms, not timed out; `polluted_entries: [" M assets/js/api/operation-system-db-api.js"]`, `diff_stat 1 insertion, 1 deletion`, `restore_command git checkout -- assets/js/api/operation-system-db-api.js` |
| `sweep-aborted.stdout.txt` | the sweep console, including the ABORTED line |
| `sweep-aborted.stderr.txt` | the sweep's stderr (one git EOL warning naming the polluted file) |

**What is known.** The suite exits non-zero before printing its summary, while one of its own source
mutants is applied to `operation-system-db-api.js`, so its restore never ran. The polluted line alone was
restored with the sweep's own command and verified against the HEAD blob. Run alone it passed (205/0),
and it passed in FC1-R2's final full regression.

**What is not known.** Why it exited. The sweep records no output sample for a `NO_SUMMARY` exit, and
the suite's console of that run was not kept. Other NOT_CLEAN entries in this pass were captures pinned
to sources that round changed, and were re-taken.

**Status: OPEN.** Next step when it is worked: run the suite in a loop under the sweep's own runner with
its stdout/stderr captured per iteration, and make its mutate→restore path restore in a `finally`.
