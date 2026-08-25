# Request Order — Allocation Draft Creation Boundary (CANONICAL)

**Status:** ACTIVE · **Owner decision:** USER-AUTHORIZED, F1-7N-FB-3C (2026-08-25)
**Supersedes:** the R4E4/R6B rule *"AI Plan remains the draft-creation boundary"* — narrowly, and only as stated below.

This document exists because F1-7N-FB-3C changes a standing business rule. A rule change that lives only in
runtime is a rule nobody can find, so the smallest possible extension is recorded here in the owning canonical
document rather than being inferred from code comments.

---

## 1. The rule

> **AI Plan is an INITIAL / DEFAULT allocation-draft source. It is NOT the exclusive draft-creation boundary.**
>
> **A deliberate user quantity edit is ALSO an authorized canonical draft-creation / update boundary.**

Nothing else about the allocation-draft lifecycle changes.

## 2. Why the previous rule had to be extended

The previous rule was coherent while the browser created drafts during Send: a SKU the AI never materialized was
still sendable, because `handleSendRequest` minted a `RAD-M-…` draft for it inside the Send transition.

F1-7N-FB-3B retired that path, correctly — it contradicted this very rule, and under the live flat-V2 cutover a
`RAD-M-…` id is not the canonical identity for its scope at all, so those rows were invisible to
`KMRDV2P.readActiveFlatForScope`, the read-back the page uses to prove a draft exists.

Retiring it left a real hole. `_roSaveTierEditToCanonicalDraft_` returned early when no canonical draft existed,
so a user who typed a quantity onto a never-materialized SKU **wrote nothing at all**, and that SKU was then
permanently unsendable, because Send consumes persisted drafts only. The user's decision above closes it at the
point where the work was being dropped, rather than by reinstating creation inside Send.

## 3. Required behaviour

| # | Condition | Behaviour |
|---|---|---|
| 1 | A current canonical `request_order_allocation_drafts` row exists | **UPDATE it** through the existing canonical locked writer. Never replace it, never re-mint its identity. |
| 2 | No such row exists **and** the user changes a tier quantity | **CREATE** the canonical Flat-V2 draft during the edit/save: canonical `RD::MONTHLY_ORDER::<cycle>::company=..|country=..|draft_purpose=..|marketplace=..|sku=..` identity, persist the user quantity and the required lineage, **read it back**, return the persisted internal id. |
| 3 | — | **Do not wait until Send Request to create the draft.** |
| 4 | — | **Send Request consumes persisted drafts only.** |
| 5 | — | **Never create a new `RAD-M-…` identity.** |
| 6 | A 0 → positive user change | Sendable **after successful persistence**, with no further action. |
| 7 | A positive → 0 user change | **Persist 0.** The draft stays ACTIVE and the tier keeps its month; the canonical zero-quantity rule then **excludes that tier from the Send workset** (no Request Order line is created). The operator can raise it again later without re-creating anything. |
| 8 | Persistence fails at any step | The value remains **visibly UNSAVED** and **Send stays blocked**. |

## 4. What is deliberately NOT widened

- **Only an order quantity creates a draft.** A note-only edit on a SKU with no draft still creates nothing: a
  note is not an order decision, and creating a draft from one would materialize rows nobody asked for.
- **Provenance stays honest.** A draft created by this boundary is stamped `generation_type = user_created`, so it
  is distinguishable from `ai_plan` for ever. The AI recommendation snapshot (`tN_recommended_qty`) is **not**
  back-filled from the user quantity; it stays 0 because no AI default was ever produced for that tier.
- **No second writer.** The implementation is a COMPOSITION of two existing canonical writers, in this order:
  1. `KMRDV2P.generateMonthlyFlat` via `rpoGenerateMonthlyFlatResult_` (24_) — the canonical CREATE. It mints the
     identity through `KMRDV2.draftId`, applies the manual non-actionable gate (AI may never create an all-zero
     draft; a MANUAL create may), writes one flat 53-column row under the shared ScriptLock + optimistic token +
     run journal, and roundtrip-verifies the id/cycle text format.
  2. `KMRDV2P.editMonthlyFlat` via `rpoEditMonthlyFlatResult_` (24_) — the canonical QUANTITY write, under the
     optimistic token, stamping `user_edited` and never touching `recommended_qty`.
  The new handler authors no row, no id, no schema and no arithmetic of its own.
- **A writer's success flag is not persistence.** The handler always re-reads the row and compares the persisted
  tier quantity to the requested one. A mismatch is `ALLOCATION_DRAFT_QUANTITY_NOT_VERIFIED` and is **not**
  reported as saved.

## 5. Implementation

- **Action:** `requestOrder.allocationDraft.ensureAndEdit` (router 01_, owner 15_
  `handleRequestOrderAllocationDraftEnsureAndEdit_`).
- **Frontend:** `_roSaveTierEditToCanonicalDraft_` → `_roCreateCanonicalDraftFromEdit_`
  (`assets/js/pages/request-order.js`), which adopts the returned persisted id into the page's canonical draft map
  so the next edit takes the ordinary update path and the row is immediately eligible for Send.
- **Wire proof:** the response carries `canonical_identity: true|false`. The page refuses to adopt a
  non-canonical identity even if one were returned.

## 6. Consequences for pre-existing `RAD-M-…` rows

They are **not** migrated or deleted by F1-7N-FB-3C. They are:

- **not sendable** — `rosBuildWorkset_` (66_) treats two different ids for one business scope as
  `DUPLICATE_BUSINESS_IDENTITY` and withholds **both**, because which quantity is authoritative is a business
  decision and must not be guessed;
- **fully reported** — `system.allocationDraftIdentityDiagnostic` (67_) is strictly read-only and reports every
  non-canonical row, its masked id, its canonical counterpart, the quantity differences, whether Send currently
  ignores it and why, and an **idempotent proposed disposition**.

Executing that plan remains a **separate, USER-AUTHORIZED** action.
