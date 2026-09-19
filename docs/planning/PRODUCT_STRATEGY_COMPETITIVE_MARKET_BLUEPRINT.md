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
(§12), and freezing a design on top of an undecided data source would produce a specification that has to be
rewritten the first time a real answer arrives.

Nothing here has been implemented. No table exists, no API action is routed, no page is built.

---

## 0 · Product location

The Competitive Market Blueprint is a **dedicated tab inside Product Strategy**. It is not a separate
application, not a second board, and not a replacement for the existing Product Strategy Board — it sits
beside it and shares its navigation, its scope selector and its site identity.

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
country
  └── marketplace                  (the site identity the rest of the system already uses:
      └── brand                     company | country | marketplace)
          └── category
              └── Series            (the planning grain: CO1100, SP3320, …)
                  └── product / SKU (the Master SKU, and its marketplace_sku_id in that marketplace)
                      └── competitor brand
                          └── competitor product
```

Three rules fall out of this shape and are not negotiable:

- **A competitor set belongs to a (country, marketplace, product) triple**, never to a product alone. The same
  product has different rivals in different places.
- **A scenario is always scoped to a time window.** "We are third on price" is meaningless without "as of
  when", and a BFCM price is not an evergreen price.
- **Same-country and same-marketplace comparison is the default.** A cross-market comparison must be an
  explicit request and must be visibly labelled as one on every panel that shows it.

The hierarchy reuses the site identity already canonical elsewhere in this system —
`company | country | marketplace` — rather than inventing a second notion of "market". Category, Series and
Master SKU likewise come from the existing master data. This capability adds **competitor brand**,
**competitor product** and **observation**; it does not re-describe Kitchen Mama's own catalogue.

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

**Identity**
- product name / model
- brand
- category and Series
- market: country and marketplace

**Descriptive**
- positioning
- target audience
- key use cases / jobs-to-be-done
- core product features
- key specifications
- advantages
- disadvantages
- message / claim
- packaging and content strengths

**Commercial**
- price and price band
- promotion / deal price
- channel and listing status
- availability and lifecycle stage

Prices are stored with the currency they were observed in and are never implicitly USD.

**Reception**
- rating, where sourced
- review volume, where sourced
- review sentiment — themes, not only a score ("hard to clean" is a strategy input; 4.3 is not)
- customer pain points
- opportunity points

**Provenance — required on every row above, without exception**
- `evidence_source` — where the claim came from
- `observed_at` — when it was true
- `confidence` — how sure we are
- `data_owner` — who is accountable for it
- `snapshot_id` / version identity — which dated document it belongs to

The provenance set is not metadata to be added later. A dimension recorded without it is not usable for
strategy, because nobody downstream can tell a scraped fact from an assumption someone typed in a hurry. The
data model must make it impossible to store a competitive claim without all of it.

**UNKNOWN stays UNKNOWN.** Where a dimension has not been observed, it is recorded and displayed as unknown.
No inference, no AI summary and no default may convert missing competitor evidence into a stated fact.

---

## 5 · Comparison modes

All seven are first-class. None is a special case of another.

| Mode | Use |
|---|---|
| **One internal product vs one competitor** | The focused head-to-head |
| **One internal product vs multiple competitors** | The primary mode — position within a real competitive set |
| **One Series vs a competing product cluster** | Series-level positioning, where the ladder is actually decided |
| **Internal Series vs internal Series** | Cannibalisation and ladder gaps inside our own range |
| **Current snapshot vs previous snapshot** | What moved, and when |
| **Country / market comparison** | Explicit, labelled, never the default |
| **Scenario comparison** | The BFCM answer beside the evergreen answer |

Rules that hold across every mode:

- **Same-market by default.** A comparison is scoped to one (country, marketplace) unless the operator
  explicitly asks otherwise, and a cross-market view is labelled as such on every panel.
- **Facts are never silently mixed across countries.** If a US price appears in a UK comparison it is visibly
  marked as a US observation, not quietly converted or averaged. Where a value cannot be compared honestly,
  the cell says so rather than showing a number.
- **Comparison snapshots are retained historically.** A comparison is a dated document. "What did we believe in
  Q3 and what did we decide?" must remain answerable after the underlying observations have moved on.

---

## 6 · Scenario model

```
BAU / evergreen           the standing position, no event
Q1 · Q2 · Q3 · Q4         quarterly strategy windows
Prime Day                 major event
BFCM                      major event
launch                    a new product entering the set
clearance                 exiting inventory or lifecycle
defensive response        a competitor is attacking our position
premium positioning       trading the product up
value positioning         trading the product down
user-defined              an operator-named window
```

A scenario carries its own time window, its own competitor set snapshot and its own recommendations. Scenarios
are **compared, not merged** — the value is in seeing that the BFCM answer and the evergreen answer differ.

**A scenario may assign a product a different strategic role without rewriting its permanent brand
positioning.** A product that is premium all year can be a traffic-acquisition play for one event. These are
separate records and must not overwrite one another:

| Layer | Lifetime | Example |
|---|---|---|
| **Permanent positioning** | Standing brand truth | "The premium one-touch opener" |
| **Scenario strategy** | One window | "Defend share against a cheaper entrant" |
| **Campaign message** | One window | "Gift-ready, arrives before the 24th" |
| **Price / promotion stance** | One window | "Hold list, fund a coupon" |
| **Advertising stance** | One window | "Bid up on competitor-brand terms" |
| **Site / listing placement** | One window | "Lead image swap, A+ module reorder" |
| **Inventory / FC implication** | One window | "Pull demand forward by one month" |

The last row is a hand-off, not a write: the Competitive Market tab states the implication, and the forecast
remains owned by FC Summary. Nothing in this capability writes a forecast.

Event scenarios are expected to align with the existing Special Event / campaign records (`campaigns`,
`campaign_sku_lines`, `fc_special_events`) rather than defining a second, parallel notion of "BFCM". Whether
that alignment is a link or a copy is an open decision (§12).

---

## 7 · Series opportunity system

**The primary output of this capability is not a competitor score.** A single number that ranks us against a
rival compresses away the thing the operator actually needs: *where is there something to do, and what is it?*
A score is a summary of the past; an opportunity is a proposal about the future.

The system must identify, per country and marketplace:

**Space**
- whitespace not owned by any competitor
- over-crowded attributes — where everyone already competes and differentiation is expensive
- price gaps and specification gaps
- audience gaps — a buyer nobody is speaking to
- message gaps — a claim nobody is making

**Our own range**
- internal Series overlap and cannibalisation
- a missing entry / mid / premium tier in a ladder

**Role candidates within a Series**
- hero SKU candidate
- defensive SKU
- traffic-acquisition SKU
- conversion SKU
- bundle and cross-sell opportunity

**Timing and place**
- market-specific opportunity — real in one country, absent in another
- Q1–Q4 strategic role

**Every opportunity is a record, not a sentence.** It carries:

```
evidence            the observations it rests on, each with provenance
confidence          how strong that evidence is
impact              what it is worth if it works
effort              what it costs to try
timing              the window in which it is live
affected_market     country + marketplace
affected_scope      Series and/or SKU
risk                what could go wrong, including cannibalisation
next_action         the specific proposed step
```

An opportunity without evidence and confidence is an opinion, and the system must not present it as an
output.

---

## 8 · The interactive surface

### 8.1 Workspace layout

Eight regions, in reading order:

| # | Region | Contents |
|---|---|---|
| 1 | **Context bar** | Country · Marketplace · Scenario · Quarter · Date snapshot — sticky, always visible |
| 2 | **Product stage** | The focal internal product or Series: positioning and key metrics |
| 3 | **Competitor rail** | Swipe / arrow / keyboard navigation across the competitor set |
| 4 | **Comparison canvas** | Feature, specification, price, audience, strength and weakness matrix |
| 5 | **Opportunity map** | Price × differentiation, or audience × unmet need, as a quadrant |
| 6 | **Scenario strategy** | BAU / Q1–Q4 / event-specific recommendations |
| 7 | **Evidence drawer** | Source, observation time, confidence and change history for any claim |
| 8 | **AI strategy panel** | Scoped questions against the selected market, products, scenario and snapshot |

The context bar is sticky because every number below it is meaningless without the market and date it belongs
to. A reader who has scrolled past the scope is a reader who will misattribute a fact.

### 8.2 Visual direction

**Preserve the supplied concept.** A comparison surface with a fixed focal product — ours — anchored so the
eye always knows whose side it is on; swipeable competitor cards moving against that anchor; a comparison
centre where the two are read side by side; and arrows and pagination indicators making the size and position
of the competitor set obvious.

**Extend it with:**

- a premium, restrained **strategic command centre** aesthetic, working in both light and dark
- **layered cards and panels**, with glass and depth effects used sparingly enough to stay legible
- **subtle depth or parallax**, never enough to distract from a number
- a **smooth product / competitor carousel**, horizontally swipeable and draggable
- **animated transitions that preserve spatial context** — the reader should never lose track of what moved
- **radar, quadrant, timeline and comparison-matrix charts only where each communicates real data**; a chart
  that decorates is a chart that misleads
- **hover and focus reveal supporting evidence**, not merely a tooltip restating the label
- a **reduced-motion mode** honouring `prefers-reduced-motion`, with identical information available
- **full keyboard access** — carousel, comparison centre and evidence drawer all reachable and operable
  without a pointer

**Constraint.** No decorative animation that delays access to data. A transition that makes the operator wait
to read a number, or that obscures whether data is loading, stale or absent, is a defect regardless of how it
looks. Loading, stale and empty are states that must be *shown*, not animated over.

---

## 9 · User flow

1. Select **Country** and **Marketplace**.
2. Select an internal **Series or SKU**.
3. Select **one or multiple competitors**.
4. Choose a **snapshot date** and a **scenario**.
5. Review structured facts and their evidence.
6. Compare strengths, weaknesses and positioning.
7. Inspect the **opportunity map** and internal Series overlap.
8. Ask the AI a **scoped strategic question**.
9. Review recommendations with their evidence and confidence.
10. Save a **scenario snapshot** or a decision note.
11. Compare that decision against a **future snapshot**.

Step 11 is the one that makes the rest worth building: a strategy tool that cannot show you what you believed
last quarter cannot tell you whether you were right.

---

## 10 · AI contract

**AI is advisory only.**

It **may**:
- summarise differences between products
- identify opportunities its evidence supports
- propose positioning
- propose campaign messages
- recommend advertising emphasis
- recommend listing and site placement
- highlight missing evidence
- generate scenario alternatives

It **must not**:
- invent competitor facts
- silently merge countries or markets
- overwrite canonical product data
- write forecasts, prices, campaigns or ads automatically
- present a recommendation without its evidence snapshot
- conceal uncertainty

Every AI output is classified, and the classification is visible in the UI, not buried in a payload:

| Class | Meaning | Requirement |
|---|---|---|
| `FACT` | An observation with provenance | Must carry evidence link + `observed_at` |
| `INFERENCE` | Derived from facts, not itself observed | Must name the facts it derives from |
| `RECOMMENDATION` | A suggested action | Must name the inference and the scenario it serves |
| `UNKNOWN` | Not known | Must be shown, never silently omitted or filled with a plausible guess |

Rules:

- **Citations and timestamps are mandatory** on `FACT` and on anything derived from one.
- **`UNKNOWN` is a first-class answer.** The most common failure mode of a tool like this is a confident
  sentence built on absent data; showing the gap is more useful than filling it.
- **The first release is advisory-only.** No automatic price change, no ad bid change, no listing mutation, no
  forecast write. The AI Strategist produces a document a human acts on.
- Who is allowed to approve an AI recommendation, and whether approval ever becomes execution, is an open
  decision (§12) and must not be assumed by an implementation.

---

## 11 · Phase plan

```
Phase 2.1A   spec and identity; evidence / snapshot model; read-only comparison; manual competitor entry
Phase 2.1B   one-to-many comparison; Series opportunity map; scenario workspace; internal overlap analysis
Phase 2.1C   AI advisory panel; evidence-grounded recommendations; saved scenario snapshots
Phase 2.1D   approved external data ingestion; change detection; alerting and historical trends
```

Supporting sequence within those phases:

```
1. Spec                      this document → a design freeze, once §12 is answered
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

## 12 · Open decisions — recorded, not invented

None of the following has been decided. Each is recorded here so that an implementation round cannot quietly
pick an answer and have it become fact by default.

| # | Open decision | Why it blocks |
|---|---|---|
| 1 | **Competitor identity key** — what makes two observations the same competitor product | Without it, history cannot be joined and "what changed" is unanswerable |
| 2 | **Country / market ownership** — who owns the competitor set for a market | Governs who may add, edit and retire a competitor |
| 3 | **Price source** | Determines whether a price is authoritative, sampled or anecdotal |
| 4 | **Review / rating source** | Same, and it constrains what may legally be stored |
| 5 | **Manual entry vs automated collection** (or both) | Changes the schema, the refresh model and the confidence model |
| 6 | **Snapshot retention** — how long dated observations are kept | Decides whether trend analysis is possible at all |
| 7 | **Competitive data sources and licensing** | Determines what may be stored and displayed at all |
| 8 | **Update frequency** | Decides whether `observed_at` is a day, a week or a quarter, and what "stale" means |
| 9 | **Country / marketplace scope for the first release** | Decides how much of the hierarchy ships |
| 10 | **Scoring weights** for positioning and opportunity | A weighted score invented by an implementation is a business decision made by accident |
| 11 | **Confidence thresholds** — when is a fact too weak to show | Governs the `UNKNOWN` boundary |
| 12 | **Image ownership and rights** for competitor product imagery | Legal, and it constrains the visual concept |
| 13 | **AI model / provider** | Governs cost, data residency and what may be sent off-platform |
| 14 | **Permission model** — who sees and who edits | Competitive data is not uniformly shareable |
| 15 | **Export / presentation format** | Decides whether this feeds a meeting or only a screen |
| 16 | **Whether recommendations may create downstream drafts** | The boundary between advising and acting |
| 17 | **Who approves an AI recommendation** | Governs whether advisory output ever becomes action |
| 18 | **Whether advertising execution stays outside the system** | Decides if there is an execution boundary at all |

---

## Appendix — relationship to existing system contracts

This capability **reuses** and does not redefine:

- site identity `company | country | marketplace` (the existing canonical scope)
- category, Series and Master SKU from existing master data
- `marketplace_sku_id` as the canonical marketplace-SKU identity
- the campaign / special-event records for event windows (link or copy — see §6 and §12)
- the currency-snapshot discipline already used by `campaign_sku_lines.price_units`: a price is stored with the
  currency it was observed in and is never implicitly USD

It **adds**: competitor brands, competitor products, dated observations with provenance, comparison snapshots,
scenarios, opportunity records and advisory output.

It **must not**: write to any existing forecast, campaign, pricing or inventory table in its first release.
```
CAPABILITY_BOUNDARY = READ_AND_ADVISE_ONLY
EXISTING_TABLE_WRITES = NONE
```
