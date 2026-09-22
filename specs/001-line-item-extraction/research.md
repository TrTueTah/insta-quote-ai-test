# Phase 0 Research: Line-Item Extraction Service

**Feature**: `001-line-item-extraction` | **Date**: 2026-09-22
**Input**: [spec.md](./spec.md) | **Governing**: [constitution.md](../../.specify/memory/constitution.md) v1.0.0

All findings below were produced by running the real extractors against the real sample
corpus in `sample-files-variant/`, not by assumption. Commands used are recorded in
[quickstart.md](./quickstart.md) so they can be re-run.

## R1. Corpus survey — what the six sample documents actually contain

Probed with `pypdf` (per-page `extract_text()`) and independently with `pdfjs-dist@4.10.38`
(`getTextContent()` + y-clustering). Both agree on which pages carry a text layer.

| Document | Pages | Text layer | What it is | Which spec scenario it exercises |
|----------|-------|-----------|------------|----------------------------------|
| `IB-55871.pdf` | 1 | yes | Clean invoice. 4 line items, Subtotal/GST/Total all internally consistent | US1 — the control document |
| `IB-56150.pdf` | 1 | yes | 4 line items, line sum matches Subtotal, but **stated Total is $41.30 higher than Subtotal + GST** | US3 — planted material mismatch |
| `IB-56088.pdf` | 1 | yes | 3 line items, Total matches line sum exactly, but prose says **"9 cartons dispatched"** in one place and **"11 cartons picked and loaded"** in another | US3 — planted non-monetary contradiction |
| `IB-56010.pdf` | 1 | yes | 4 rows, **no Amount column and no document total**; a `Weight` column sits where `Unit` sits on other docs; prices carry suffixes (`$74.00 /carton`) | US2 — "document does not provide this value" refusals |
| `IB-STMT47.pdf` | 8 | 7 of 8 pages | 21 line items across 7 pages; **page 4 has zero text items** while "Page 3 of 8"/"Page 5 of 8" markers prove content is missing | US4 — page-scoped fault isolation |
| `IB-55902.pdf` | 1 | **none** (0 text items, 186 KB) | Image-only scan | US2 — "no extractable text on page" refusal |

**Decision**: These six documents are the acceptance corpus. Every refusal case and both
ambiguity kinds are represented by a real file, so no synthetic fixture is needed to
demonstrate the headline behaviors.

**Rationale**: The corpus is clearly constructed as a test set — one control, one monetary
contradiction, one prose contradiction, one no-price layout, one damaged multi-page, one
image-only. Designing against it directly is designing against the assessment.

**Alternatives considered**: Building synthetic fixtures first. Rejected for the headline
behaviors — the real files are better evidence. Synthetic *text* fixtures are still used
for the verification-gate unit tests (see R5), because those must run without any PDF.

## R2. Page text representation — the most consequential decision in the feature

Under the constitution, evidence is valid only if it **literally substring-matches the
extracted text on the claimed page**. That makes "what is the page's text, exactly?" the
foundation the entire guarantee rests on. Two extractors give materially different answers
for the same page:

- `pypdf.extract_text()` emits **one cell per line**. A row becomes six separate lines:
  `FX-201` / `Framing nail gun coil, 90mm galv` / `24` / `box` / `$52.00` / `$1,248.00`.
- `pdfjs-dist` `getTextContent()` returns positioned items. Joined naively they run
  together; **clustered by rounded y-coordinate and sorted by x**, a row becomes one line:
  `FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00`.

**Decision**: Use `pdfjs-dist`, and build each page's text by y-clustering text items into
rows (round `transform[5]`, sort each row by `transform[4]`, join with a single space,
join rows with `\n`). This joined string is the page's canonical text and the **sole**
input to the verification gate.

**Rationale**: Three reasons, in order of weight.

1. **A row-shaped page text makes row-shaped evidence possible.** With pdfjs row-clustering,
   the whole line `FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00` is a
   literal substring of the page text, so a line item's evidence can be the row it came
   from — human-verifiable at a glance. With pypdf's cell-per-line output, no such string
   exists anywhere on the page, and evidence would have to degrade to bare fragments like
   `24`, which are useless to a reviewer and collide constantly (see R4).
2. **Canonical text must be defined once and shared.** The gate compares candidate evidence
   against this string, so the extractor and the joining rule are part of the contract, not
   an implementation detail. Swapping extractors later changes what evidence is valid.
3. It is the library already named in the constitution's tech stack.

**Alternatives considered**:
- `pdf-parse` (permitted by the constitution as an alternative): wraps an old pdfjs build
  and returns whole-document text with weaker page attribution. Rejected — page numbers are
  a hard requirement of Principle I, so per-page fidelity cannot be traded away.
- Naive `items.map(i => i.str).join('')`: rejected, produces one unbroken run with no row
  or word boundaries.
- Keeping pypdf: rejected per reason 1. (pypdf was used only as an independent cross-check
  that a page has or lacks a text layer; both extractors agree on all six documents.)

**Risk recorded honestly**: y-clustering is a heuristic. A document with slightly slanted
or overlapping baselines could split one visual row into two clusters. All six sample
documents cluster cleanly at integer-rounded y. This is listed in the README as a known
limitation rather than claimed as solved.

## R3. Rules vs. LLM — where rules actually break, measured

The constitution requires rules first, with escalation to the LLM permitted only where a
sample document's layout demonstrably defeats them, and the README must name the document.

Against the row-clustered text from R2, four of the five text-bearing documents share one
strict shape:

```
<CODE> <description words> <qty> <unit> $<unit price> $<amount>
```

matched by a single anchored pattern (code token, greedy description, integer/decimal
quantity, alphabetic unit, two currency values). This covers `IB-55871`, `IB-56150`,
`IB-56088`, and all seven readable pages of `IB-STMT47` — 32 of the 36 line items in the
corpus.

**`IB-56010` is the document that defeats the rules**, and specifically:

- It has **five columns, not six** — there is no `Amount`. A positional rule expecting a
  trailing amount either fails the row outright or silently promotes the unit price into
  the amount slot, which would be a fabricated number.
- The fourth column is **`Weight` (`20kg`, `640g total`, `1.4kg`)** where the other
  documents put `Unit` (`box`, `ea`). `640g total` is two tokens, so even token-counting
  breaks. A column-position rule would file a weight as a unit of measure.
- Prices carry **trailing qualifiers**: `$74.00 /carton`, `$0.02 /ea`, `$28.50 /kit`.

**Decision**: Rules handle the six-column shape. `IB-56010`-style layouts escalate to an
OpenAI structured-output call that *proposes* candidates with claimed page + source text.
Every proposal then passes the identical verification gate as rule output. The README will
name `IB-56010.pdf` and state exactly the three reasons above.

**Rationale**: This is the narrowest defensible escalation — one document, three concrete
structural reasons, no "the model is better at this in general" hand-waving. And because
the gate is downstream of both paths, an LLM that invents `$40.00` as the amount for the
washers row (2000 × $0.02 — arithmetically tempting and entirely absent from the page) is
**auto-refused**, because that string appears nowhere in the page text.

**Alternatives considered**:
- Rules only, refusing `IB-56010` wholesale: satisfies the constitution but discards four
  recoverable line items and their evidenced quantities. Rejected — Principle III favors
  partial value.
- LLM for everything: rejected. It makes the deterministic path untestable without network
  access and violates the constitution's rules-first ordering.

**Explicit non-goal**: the service must never *compute* a missing amount. `IB-56010`'s
washers row has quantity `2000` and unit price `$0.02`; the product `$40.00` is not on the
page, so the amount is a refusal (`value not provided by the document`), not a derivation.
This is the single clearest test of Principle I in the corpus.

### Correction after implementation (2026-09-22)

**The claim above was overstated.** A second deterministic rule for the five-column
no-amount shape handles `IB-56010.pdf` completely, and all 36 corpus line items are extracted
by rules alone. The three structural observations are accurate; the conclusion that they
*defeat* rules was not — they defeat a rule written for the six-column shape, which is a
different and much weaker statement.

The LLM path is still implemented and still gated, because the genuinely hard case is a
layout nobody has inspected yet. But no document in this corpus demonstrates that, and the
README says so rather than letting the escalation look better-justified than it is.

## R4. Evidence matching — why "substring exists on page" is necessary but not sufficient

The gate the constitution mandates is `pageText.includes(candidate.sourceText)`. Tested
against the corpus, this has a real hole: `IB-STMT47` repeats `$60.00`, `$105.00`, and
`$162.00` on all seven readable pages, and `5 ea $12.00 $60.00` appears on every one of
them. A bare fragment like `$60.00` substring-matches trivially while proving nothing about
*which* row it came from. The spec calls this out as an edge case ("a number that appears
identically in several places").

**Decision**: Keep the substring check as the mandatory gate, and add two deterministic
requirements on top, all three enforced by the same pure function:

1. `sourceText` MUST be a literal substring of the claimed page's canonical text (the
   constitutional gate; failure → refusal `source text not found on page N`).
2. `sourceText` MUST occur **exactly once** on that page. Multiple occurrences → refusal
   `source text is ambiguous on page N` — a new refusal case, because a fragment matching
   three rows is not evidence for any one of them.
3. The extracted value's own literal form MUST appear within `sourceText` (the amount
   `1248.00` must be backed by a `sourceText` containing `$1,248.00`). Failure → refusal
   `value not present in its own source text`. Currency symbols, thousands separators, and
   surrounding whitespace are normalized for this check only — never for the page match.

Rule-derived candidates therefore use the **whole clustered row** as `sourceText`, which is
unique on the page in every document in the corpus.

**Rationale**: Requirement 1 alone would let a model pass the gate with a fragment it did
not actually read a value from. The gate exists to make evidence *mean* something; a check
that a repeated `$60.00` "exists somewhere on page 6" does not. These additions are
strictly stronger than the constitution's minimum and never weaker, so they comply.

**Alternatives considered**: fuzzy/normalized matching against the page (Levenshtein,
whitespace-insensitive). Rejected outright — it directly contradicts Principle I's
"literal substring, not a paraphrase". Normalization is confined to requirement 3, which
compares a value to its own source text and never widens what counts as present on the page.

## R5. Testing strategy — deterministic suite with zero network

**Decision**: Three tiers.

- **Gate unit tests** — the verification gate is a pure function over
  `(candidates, pageTexts)`. Tested with hand-written string fixtures only: no PDF, no
  network, no framework. Must include a candidate whose source text is absent, one that
  occurs twice, and one whose value is missing from its own source text.
- **Pipeline tests against the real corpus** — run the full pipeline over the six sample
  PDFs with the LLM step stubbed by a recorded fixture, asserting the classification of
  every value. These are the acceptance tests for US1–US4.
- **No live OpenAI calls in any suite.** The LLM boundary is an injected interface; tests
  supply a fake. This is required by the constitution's tech-stack section.

**Rationale**: FR-021/FR-022/FR-023 promise stable classification across runs. That is only
testable if the suite is itself deterministic.

**Alternatives considered**: recording live API responses via a VCR-style cassette on first
run. Rejected as unnecessary complexity for a fixed six-document corpus.

## R6. Total reconciliation — arithmetic on stated values, not tax logic

The spec puts "NZ/AU tax-specific logic" out of scope, which raises a question the corpus
answers sharply. Comparing the line-item sum directly against a stated *tax-inclusive*
total produces a **false ambiguity on the clean control document**:

- `IB-55871` (clean): line sum `$3,259.00` vs stated `Total (incl GST): $3,747.85` — differs
  by the GST amount. Naive comparison flags the one document that is definitively correct.
- `IB-55871` reconciles properly: line sum `3,259.00` = stated `Subtotal: $3,259.00` ✓, and
  `3,259.00 + 488.85 = 3,747.85` = stated Total ✓. Fully consistent.
- `IB-56150` (planted fault): line sum `1,270.00` = stated `Subtotal: $1,270.00` ✓, but
  `1,270.00 + 190.50 = 1,460.50` ≠ stated `Total (incl GST): $1,501.80`. **Off by $41.30 —
  a material mismatch under FR-025.**
- `IB-56088`: no tax line at all; `Total: $2,050.00` = line sum ✓.
- `IB-56010`, `IB-STMT47`: no stated total — no reconciliation attempted, none reported.

**Decision**: Reconcile along the ladder the document itself prints — line sum → stated
subtotal → plus stated tax → stated total — comparing only numbers literally present on the
page, each carrying its own evidence. Every rung is optional; a missing rung means that
comparison is skipped, never assumed.

**Rationale**: Adding up three numbers a document prints is checking the document's own
internal arithmetic, not applying tax rules. The out-of-scope boundary is honored precisely:
the service **never** validates that 15% is the correct rate, never computes GST from a
subtotal, and never infers a tax-exclusive figure from a tax-inclusive one. It only asks
whether the printed figures agree with each other.

**Alternatives considered**: comparing line sum against every stated total and reporting all
mismatches. Rejected — it flags `IB-55871`, and a detector that cries wolf on the control
document trains a reviewer to ignore ambiguities, which defeats Principle II.

## R7. Gap found in the spec — `IB-56088`'s contradiction is not covered by FR-015

`IB-56088` contains `Summary: 9 cartons dispatched from Ironbark warehouse this run.` and
`Warehouse notes: 11 cartons picked and loaded onto the truck.` Its monetary figures are
fully consistent, so **every detector required by FR-015 passes this document cleanly** and
the planted contradiction goes unreported.

FR-015's mandated minimum covers total-vs-sum, differing stated totals, and differing unit
prices — all monetary. This conflict is a non-monetary count stated in prose.

**Decision**: Add a fourth detector — conflicting stated counts of the same document-level
unit noun — and report it as an ambiguity of kind `material mismatch` carrying both
statements with their own evidence. Implemented as a deterministic scan for
`<number> <unit noun>` pairs over a small closed noun list (`carton`, `cartons`, `pallet`,
`pallets`, `box`, `boxes`, `item`, `items`, `package`, `packages`), reporting a conflict
only when the same noun is stated with differing counts on the same document.

**Rationale**: Principle II says a contradiction is surfaced explicitly and never silently
resolved. A reviewer told "3 line items, total $2,050.00, no issues" for a document that
disagrees with itself about whether 9 or 11 cartons shipped has been given a confident,
incomplete answer — exactly the failure the constitution exists to prevent. The closed noun
list keeps it deterministic and testable; it does not attempt general-purpose contradiction
detection over prose.

**This exceeds the spec as written and requires a spec amendment** (FR-015 gains a fourth
detector). Flagged to the user rather than silently expanding scope; see the Complexity
Tracking table in [plan.md](./plan.md).

**Alternatives considered**: leaving it undetected and documenting it as a known limitation
in the README. Honest, and permitted — but the corpus plants this conflict deliberately in
the one document whose numbers are otherwise perfect, which reads as a direct test of
whether "ambiguity is a result" was implemented narrowly or genuinely.

## R8. Resolved unknowns from Technical Context

| Unknown | Resolution |
|---------|-----------|
| PDF text extractor and page-text construction | `pdfjs-dist@^4.10`, y-clustered rows (R2) |
| Node version | Node 25.9.0 present locally; target Node 20+ LTS for deploy portability |
| Which document forces LLM escalation | `IB-56010.pdf`, for three named structural reasons (R3) |
| Refusal case enumeration | Eight cases, fixed set (see [data-model.md](./data-model.md)) |
| Rounding threshold for ambiguity kind | `$0.01 × line item count` per FR-025, already resolved in spec |
| Upload limits | 20 MB / 50 pages per spec assumptions; corpus max is 186 KB / 8 pages |
| Test runner | Vitest per constitution; no live API calls in any suite (R5) |

No `NEEDS CLARIFICATION` items remain.
