# Product Strategy — Competitive Market Blueprint

```
PHASE                  = POST_PHASE1
PRIORITY               = PHASE2_1_FIRST_PRODUCT_TASK
IMPLEMENTATION_STARTED = NO
DOCUMENT_STATUS        = BLUEPRINT / NOT A DESIGN FREEZE
RUNTIME_MUTATIONS      = 0   (no code, DB schema, API action, test, cache token or UI ships with this file)
```

This document defines **what the Competitive Market capability is for** and **what must be decided before it can
be built**. It is deliberately not a design freeze: several of its load-bearing inputs are open questions
(§10), and freezing a design on top of an undecided data source would produce a specification that has to be
rewritten the first time a real answer arrives.

Nothing here has been implemented. No table exists, no API action is routed, no page is built.

---

## 1 · Vision

A **Product Strategy** tab that answers, for one country at a time, at the grain of a single product:

> Where does this product actually sit against the competitors a shopper sees next to it, and what should we
> do about it this quarter?

Three commitments shape everything below.

**Country-specific.** A product's competitive position is a property of a marketplace, not of a company. The
same SKU can lead in the US and be an also-ran in the UK against an entirely different competitor set. Facts
observed in one market are never silently reused to describe another.

**Brand- and Series-led.** The unit of strategy is not the SKU alone. Kitchen Mama competes as a brand and
plans as a Series; a Series is where positioning, price ladder and feature story are actually decided, and the
product is where they are expressed. The board has to make both visible at once.

**Evidence before advice.** Every competitive claim carries where it came from, when it was observed and how
confident we are. A strategy tool whose facts cannot be traced is a tool that will be argued with rather than
used.

The first release is an **analysis and advisory** surface. It does not change a price, a bid, a listing or a
forecast.

---

## 2 · Hierarchy

```
market / country
  └── marketplace                 (Amazon US, Amazon CA, Shopify US, … — the site identity the rest
      └── brand                    of the system already uses: company | country | marketplace)
          └── Series               (the planning grain: CO1100, SP3320, …)
              └── product          (the Master SKU, and its marketplace_sku_id in that marketplace)
                  └── competitor set
                      └── scenario / time window
```

Two rules fall out of this shape and are not negotiable:

- **A competitor set belongs to a (country, marketplace, product) triple**, never to a product alone. The same
  product has different rivals in different places.
- **A scenario is always scoped to a time window.** "We are third on price" is meaningless without "as of
  when", and a BFCM price is not an evergreen price.

The hierarchy reuses the site identity already canonical elsewhere in this system —
`company | country | marketplace` — rather than inventing a second notion of "market". Series and SKU likewise
come from the existing master data. This capability adds **competitor** and **observation**; it does not
re-describe Kitchen Mama's own catalogue.

---

## 3 · Core workspaces

Six surfaces, each answering one question. They share one scope selector and one evidence model.

| Workspace | The question it answers |
|---|---|
| **Market & Portfolio Map** | Where does our whole portfolio sit in this country — which Series lead, which are exposed, where is there nothing of ours at all? |
| **Product Intelligence** | Everything known about one product: its own facts, its competitor set, its trajectory. |
| **Comparison Lab** | One of ours against several of theirs, feature by feature, price by price, review by review. Also ours against ours. |
| **Opportunity & Positioning Map** | Where is the unserved or weakly-served space, and which of our Series could credibly move into it? |
| **Scenario Strategy** | What changes under BFCM / Prime Day / a launch / a defend posture, and what would we do differently? |
| **AI Strategist** | A narrative reading of the above, with its facts, its inferences and its recommendations kept visibly apart. |

The first three are the minimum viable capability. The last three depend on the first three being trustworthy,
and should not be started before they are.

---

## 4 · Product and competitor dimensions

Every dimension below is recorded for **both** our products and competitor products, so a comparison never has
richer data on one side than the other.

**Descriptive**
- product features
- key specifications
- strengths and weaknesses
- target audience
- jobs-to-be-done / use cases
- positioning and messaging

**Commercial**
- price and promotion (list, current, deal; with the currency snapshot, never an implied USD)
- availability and lifecycle stage

**Reception**
- rating
- review volume
- review sentiment (themes, not only a score — "hard to clean" is a strategy input; 4.3 is not)

**Provenance — required on every row above, without exception**
- `evidence_source` — where the claim came from
- `observed_at` — when it was true
- `confidence` — how sure we are

The provenance triple is not metadata to be added later. A dimension recorded without it is not usable for
strategy, because nobody downstream can tell a scraped fact from an assumption someone typed in a hurry. The
data model must make it impossible to store a competitive claim without all three.

---

## 5 · Comparison contract

- **One Kitchen Mama product against multiple competitors** is the primary mode.
- **Series-to-Series internal comparison** is a first-class mode, not an afterthought — cannibalisation and
  ladder gaps inside our own range are as decision-relevant as external rivalry.
- **Same-market comparison by default.** A comparison is scoped to one (country, marketplace) unless the
  operator explicitly asks for a cross-market view, and a cross-market view is labelled as such on every panel.
- **Facts are never silently mixed across countries.** If a US price is shown in a UK comparison it must be
  visibly marked as a US observation, not quietly converted or averaged. Where a value cannot be compared
  honestly, the cell says so rather than showing a number.
- **Comparison snapshots are retained historically.** A comparison is a dated document. "What did we believe in
  Q3 and what did we decide?" must remain answerable after the underlying observations have moved on.

---

## 6 · Scenario model

```
baseline / evergreen      the standing position, no event
Q1 · Q2 · Q3 · Q4         quarterly strategy windows
Prime Day                 major event
BFCM                      major event
launch                    a new product entering the set
defend                    a competitor is attacking our position
growth                    we are pushing for share
clearance                 we are exiting inventory or lifecycle
user-defined              an operator-named window
```

A scenario carries its own time window, its own competitor set snapshot and its own recommendations. Scenarios
are **compared, not merged** — the value is in seeing that the BFCM answer and the evergreen answer differ.

Event scenarios are expected to align with the existing Special Event / campaign records (`campaigns`,
`campaign_sku_lines`, `fc_special_events`) rather than defining a second, parallel notion of "BFCM". Whether
that alignment is a link or a copy is an open decision (§10).

---

## 7 · AI contract

Every AI output is classified, and the classification is visible in the UI, not buried in a payload:

| Class | Meaning | Requirement |
|---|---|---|
| `VERIFIED_FACT` | An observation with provenance | Must carry evidence link + `observed_at` |
| `INFERENCE` | Derived from facts, not itself observed | Must name the facts it derives from |
| `RECOMMENDATION` | A suggested action | Must name the inference and the scenario it serves |
| `UNKNOWN` | Not known | Must be shown, never silently omitted or filled with a plausible guess |

Rules:

- **Citations and timestamps are mandatory** on `VERIFIED_FACT` and on anything derived from one.
- **`UNKNOWN` is a first-class answer.** The most common failure mode of a tool like this is a confident
  sentence built on absent data; showing the gap is more useful than filling it.
- **The first release is advisory-only.** No automatic price change, no ad bid change, no listing mutation, no
  forecast write. The AI Strategist produces a document a human acts on.
- Who is allowed to approve an AI recommendation, and whether approval ever becomes execution, is an open
  decision (§10) and must not be assumed by an implementation.

---

## 8 · Visual direction

**Preserve the supplied concept.** The concept that motivated this capability is a comparison surface with:

- a **fixed focal product** — ours — anchored so the eye always knows whose side it is on
- **swipeable competitor cards** moving against that fixed anchor
- a **comparison centre** where the focal product and the current competitor are read side by side
- **arrows and pagination indicators** making the size and position of the competitor set obvious

**Extend it with:**

- a **multi-product carousel**, so the focal product itself can be changed without leaving the surface
- a **motion-reduced mode** honouring `prefers-reduced-motion`, with the same information available
- **full keyboard access** — the carousel, the comparison centre and the evidence drawer must all be reachable
  and operable without a pointer
- an **evidence drawer**: any claim opens to its source, `observed_at` and confidence
- an **opportunity heatmap** for the Opportunity & Positioning Map
- a **portfolio positioning chart** for the Market & Portfolio Map

**Constraint.** No ornamental animation that delays analysis or hides state. A transition that makes the
operator wait to read a number, or that obscures whether data is loading, stale or absent, is a defect
regardless of how it looks. Loading, stale and empty are states that must be *shown*, not animated over.

---

## 9 · Phase plan

```
1. Spec                     this document → a design freeze, once §10 is answered
2. Source & data governance  where competitive data comes from, licensing, refresh, ownership
3. DB                        competitor / observation / comparison-snapshot tables
4. Mapping                   competitor product ↔ our marketplace_sku_id ↔ Series
5. Read APIs                 scoped, workspace-shaped reads (the house pattern, not a whole-DB load)
6. Product Strategy tab      Market & Portfolio Map · Product Intelligence · Comparison Lab
7. Scenario engine           windows, snapshots, scenario comparison
8. AI advisory               the four-class contract, advisory-only
```

Steps 3 and onward are blocked on step 2. Building a schema before the data source is chosen is how a schema
ends up modelling a scraper rather than a business question.

---

## 10 · Open decisions — recorded, not invented

None of the following has been decided. Each is recorded here so that an implementation round cannot quietly
pick an answer and have it become fact by default.

| # | Open decision | Why it blocks |
|---|---|---|
| 1 | **Competitive data sources and licensing** | Determines what may be stored and displayed at all |
| 2 | **Manual entry vs external APIs** (or both) | Changes the schema, the refresh model and the confidence model |
| 3 | **Update frequency** | Decides whether `observed_at` is a day, a week or a quarter, and what "stale" means |
| 4 | **Country / marketplace scope for the first release** | Decides how much of the hierarchy ships |
| 5 | **Scoring weights** for positioning and opportunity | A weighted score invented by an implementation is a business decision made by accident |
| 6 | **Confidence thresholds** — when is a fact too weak to show | Governs the `UNKNOWN` boundary |
| 7 | **Image ownership and rights** for competitor product imagery | Legal, and it constrains the visual concept |
| 8 | **Who approves an AI recommendation** | Governs whether advisory output ever becomes action |
| 9 | **Whether advertising execution stays outside the system** | Decides if there is an execution boundary at all |

---

## Appendix — relationship to existing system contracts

This capability **reuses** and does not redefine:

- site identity `company | country | marketplace` (the existing canonical scope)
- Series and Master SKU from existing master data
- `marketplace_sku_id` as the canonical marketplace-SKU identity
- the campaign / special-event records for event windows (link or copy — see §6 and §10)
- the currency-snapshot discipline already used by `campaign_sku_lines.price_units`: a price is stored with the
  currency it was observed in and is never implicitly USD

It **adds**: competitor entities, dated observations with provenance, comparison snapshots, scenarios and
advisory output.

It **must not**: write to any existing forecast, campaign, pricing or inventory table in its first release.
```
CAPABILITY_BOUNDARY = READ_AND_ADVISE_ONLY
EXISTING_TABLE_WRITES = NONE
```
