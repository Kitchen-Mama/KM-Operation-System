# This capture is SUPERSEDED, and it is kept on purpose

`scope-reuse.json` here is the CP2X-R1 real-Chrome capture. It is no longer read by any suite, and the
page it pins has since changed, so its source hashes will not match the working tree. **Do not re-pin
them.** The current capture is `docs/evidence/cp2x-r2-scope-reuse/scope-reuse.json`.

## Why it is still here

It is the record of a measurement that could not prove what it set out to prove, and of how that was
reported. CP2X-R1 drove this capture to establish cross-site reuse; the Marketplace select never offered
the second site, every phase after the first silently ran against the same scope, and the round reported
that limitation (`mktMoved: false`) and asserted it rather than quietly presenting same-scope reuse as
cross-site reuse.

CP2X-R2 found the cause, and it was in the harness rather than the page: the scope registry offered two
marketplaces while `inventoryReplenishment.workspace.get` described one, and the select is rebuilt from
the read model that read hydrates. See **D-S8-B3-147** in
`docs/planning/SUPPLY_PLANNING_DECISION_REGISTER.md`.

Keeping both captures makes the correction checkable: the shape of the failure is still on disk next to
the run that fixed it.
