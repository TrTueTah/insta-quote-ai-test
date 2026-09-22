# Feature Specification: Line-Item Extraction Service (Part A)

**Feature Branch**: `001-line-item-extraction`
**Created**: 2026-09-22
**Status**: Draft
**Input**: User description: "Build the line-item extraction service (Part A): given an uploaded PDF (invoice, packing list, or delivery docket from a construction/trade business), produce a structured result containing every line item the system was able to extract, and every item or value it explicitly could not extract, with a reason."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Extract line items with traceable evidence (Priority: P1)

A construction/trade business uploads an invoice, packing list, or delivery docket. The
service returns the line items it found — description, quantity, and monetary value — and
for every single value it returns, it also returns the page that value came from and the
exact text on that page that supports it. A reviewer can put the result next to the
original document and confirm each number without guessing.

**Why this priority**: This is the core value of the feature and the first thing under
test. Without evidence attached to every value, the output is unverifiable and therefore
useless to someone who has to trust the numbers. A result that extracts nothing but
evidences everything it returns is still a shippable MVP; a result that returns numbers
with no evidence is not.

**Independent Test**: Upload a clean, well-formatted invoice. For each returned value,
confirm the reported page number is correct and the reported source text appears
character-for-character in that page's text. Delivers value on its own: a reviewer can
verify the extracted quantities and prices against the source document.

**Acceptance Scenarios**:

1. **Given** a clean, well-formatted single-page invoice with five line items, **When** it
   is processed, **Then** all five line items are returned, and each returned value carries
   a page number and source text that is present verbatim on that page.
2. **Given** a multi-page delivery docket with line items on pages 2 and 3, **When** it is
   processed, **Then** each line item reports the page it actually appeared on, not the
   first page or the document as a whole.
3. **Given** any processed document, **When** the result is audited against the document's
   text, **Then** zero returned values have source text that cannot be found on the page
   they claim.

---

### User Story 2 - Get a specific, named reason for anything not extracted (Priority: P2)

When the service cannot tie a value to evidence, it says so explicitly: which item, which
value, and a concrete reason drawn from a known set of cases. A reviewer never has to
wonder whether a missing price means "the document doesn't have one" or "the system gave
up." Partially readable line items still return the parts that are evidenced.

**Why this priority**: A refusal is the honest alternative to a guess, and it is only
useful if it is specific. This is the second thing under test. It depends on User Story 1
existing but is independently observable.

**Independent Test**: Upload a document with one smudged/illegible price. Confirm that
item's description and quantity are still returned with evidence, that a refusal names the
missing price specifically with a reason from the known set, and that the remaining line
items are unaffected.

**Acceptance Scenarios**:

1. **Given** a document where one line item's price is illegible, **When** it is processed,
   **Then** that item's description and quantity are returned with evidence, the illegible
   price appears as a refusal naming that specific item and value, and every other line
   item in the document is returned normally.
2. **Given** a value that cannot be traced to literal text anywhere in the document,
   **When** it is processed, **Then** it never appears as an extracted value under any
   circumstance — it appears as a refusal with a reason, or not at all.
3. **Given** any refusal in any result, **When** its reason is read, **Then** the reason
   is one of the enumerated refusal cases and names the specific item or value affected —
   never a generic message such as "couldn't process this document."
4. **Given** a page containing no extractable text at all (for example, an image-only
   scan), **When** it is processed, **Then** a refusal names that page and states that no
   text could be extracted from it.

---

### User Story 3 - See contradictions surfaced instead of silently resolved (Priority: P3)

When the document disagrees with itself — two different totals, a stated total that does
not match the sum of the line items, two different unit prices for what appears to be the
same item — the service reports the conflict as its own distinct result, showing both
conflicting values and where each came from. It never picks one.

**Why this priority**: Messy real-world paperwork contains contradictions, and silently
choosing one value is the most dangerous possible behavior: it produces a confident number
that is wrong. Distinct from a refusal (nothing was unreadable) and distinct from a
successful extraction (there is no single answer).

**Independent Test**: Upload a document whose stated total does not equal the sum of its
line items. Confirm the result contains an explicit ambiguity entry showing both the stated
total and the computed sum, each with its own evidence, and that neither value is presented
as the answer.

**Acceptance Scenarios**:

1. **Given** a document where the stated total does not match the sum of its line items,
   **When** it is processed, **Then** an ambiguity is reported containing both the stated
   total (with page and source text) and the computed sum, and neither is silently adopted.
2. **Given** a document that states two different totals in two places, **When** it is
   processed, **Then** an ambiguity is reported listing both values with their separate
   evidence, rather than the first, the larger, or the cleaner-looking one being returned.
3. **Given** an ambiguity in any result, **When** the result is read, **Then** the
   ambiguity is clearly separate from both the extracted line items and the refusals.
4. **Given** an invoice whose stated total differs from the line-item sum by one cent
   because each line was rounded individually, **When** it is processed, **Then** the
   difference is still reported as an ambiguity, labelled a rounding difference rather than
   a material mismatch, and is not silently absorbed.

---

### User Story 4 - One bad page does not lose the rest of the document (Priority: P4)

A corrupted, malformed, or unreadable page inside an otherwise valid document does not
cause the upload to fail. Line items from the readable pages are returned as normal, and
the bad page produces its own page-scoped refusal.

**Why this priority**: Partial value beats zero value. A business that uploads a 12-page
docket with one bad page should not lose the other 11 pages of work. Independently testable
and valuable, but only observable once Stories 1 and 2 exist.

**Independent Test**: Upload a multi-page document with one deliberately corrupted page.
Confirm line items from the other pages are returned with evidence, a refusal names the bad
page, and the request succeeds rather than erroring.

**Acceptance Scenarios**:

1. **Given** a multi-page document with one corrupted page, **When** it is processed,
   **Then** line items from every other page are returned and a refusal names the corrupted
   page.
2. **Given** a document where a single line item cannot be processed at all, **When** it is
   processed, **Then** the failure is confined to that line item as a refusal, and all other
   line items on the same page are returned.
3. **Given** any accepted upload, **When** processing encounters internal failures, **Then**
   the caller still receives a complete, well-formed result containing extracted items,
   refusals, and ambiguities — not a bare failure.

---

### Edge Cases

- **Document with no line items at all** (for example, a bank statement or a cover letter
  uploaded by mistake): the result reports this explicitly rather than returning a silently
  empty list. See FR-016.
- **Image-only / scanned PDF with no text layer**: every page produces a "no extractable
  text" refusal. Reading text out of images is out of scope for this feature.
- **Password-protected or encrypted PDF**: a document-scoped refusal naming the reason;
  the service does not attempt to bypass protection.
- **File that is not a PDF, or a PDF that is structurally corrupt end-to-end**: a
  document-scoped refusal naming the reason.
- **Empty file, or file exceeding the accepted size or page limit**: rejected with a named
  reason before processing begins.
- **Line item with a quantity but no price anywhere in the document** (common on delivery
  dockets, which often carry no pricing): the quantity is extracted with evidence and the
  absent price is reported as a refusal describing that the document provides no value,
  distinguishable from a price that exists but is unreadable.
- **A number that appears identically in several places on a page** (e.g. `12.00` in three
  rows): evidence must still point at the correct occurrence, not merely at a page that
  happens to contain that string somewhere.
- **Description spanning multiple physical rows or wrapped across a page break**: whatever
  portion is evidenced is returned; anything not evidenced is refused rather than stitched
  together speculatively.
- **Zero, negative, or credit-note values**: returned as extracted when evidenced; the
  service does not treat a negative amount as an error.
- **Duplicate identical line items** (the same description, quantity, and price twice):
  both are returned; identical repetition is not treated as a contradiction.
- **Stated total differs from the line-item sum by a cent or two** because the document
  rounds each line separately: reported as an ambiguity of the rounding-difference kind, not
  suppressed and not treated as a material discrepancy.
- **Stated total cannot be found on any page**: no total-versus-sum comparison is possible,
  so no ambiguity of that kind is reported; the absent total is a refusal, not a conflict.

## Requirements *(mandatory)*

### Functional Requirements

**Extraction and evidence**

- **FR-001**: The service MUST accept a single uploaded PDF document and return one
  structured result containing three distinct collections: extracted line items, refusals,
  and ambiguities.
- **FR-002**: A line item MUST represent one billable or deliverable row from the document
  and MUST include a description, a quantity, and a monetary value wherever the document
  provides them and they can be evidenced.
- **FR-003**: Every value in an extracted line item MUST carry the page number it came from
  and the exact text from that page that supports it.
- **FR-004**: Evidence text MUST be literally present in the referenced page's text.
  Paraphrased, reformatted, normalized, or reconstructed evidence MUST NOT be returned.
- **FR-005**: If any individual value within a line item cannot be tied to evidence, that
  value MUST NOT be returned as extracted. It MUST become a refusal. It MUST NOT be
  returned as a guess, a default, a zero, or an empty value.
- **FR-006**: A line item whose other values ARE evidenced MUST still be returned with those
  values, alongside the refusal for the unevidenced part.
- **FR-007**: No value MUST ever appear as an extracted value unless its evidence check
  passed, regardless of how confident the system is about that value.

**Refusals**

- **FR-008**: Every refusal MUST name the specific item, value, or page it concerns.
- **FR-009**: Every refusal MUST carry a reason drawn from a fixed, enumerated set of
  refusal cases, so that behavior is predictable and testable. The full set is enumerated
  during planning and MUST at minimum cover: text illegible or unreadable at that location;
  a claimed value with no matching source text on the claimed page; a page with no
  extractable text at all; a page that could not be read or is corrupt; a document that
  could not be opened at all; and a value the document simply does not provide.
- **FR-010**: Refusal reasons MUST NOT be generic. A reason such as "could not process" or
  "an error occurred" is not acceptable output.
- **FR-011**: The refusal reason returned by the service MUST be the exact string intended
  for display to the person reviewing the result, requiring no re-wording or
  re-classification by any consumer of this result.

**Ambiguities**

- **FR-012**: When the document contains contradictory values for what should be a single
  fact, the service MUST report an ambiguity as a result distinct from both extracted line
  items and refusals.
- **FR-013**: An ambiguity MUST include every conflicting value, each with its own page
  number and exact source text where that value came from the document.
- **FR-014**: The service MUST NOT resolve a contradiction by selecting one value — not the
  first, not the last, not the largest, not the most frequent, and not the most
  confidently-read one.
- **FR-015**: The service MUST detect at minimum these contradictions: a stated document
  total that does not match the sum of the extracted line items (classified per FR-025);
  two or more differing stated totals; differing unit prices given for the same item within
  one document; and differing stated counts of the same document-level unit (for example a
  document stating both "9 cartons dispatched" and "11 cartons picked and loaded").
  *Amended 2026-09-22: the fourth detector was added after planning found that a sample
  document's only contradiction is a non-monetary one stated in prose, which every
  money-based detector passes cleanly. See research.md R7.*
- **FR-015a**: Count-conflict detection MUST read only narrative lines. Line-item rows MUST
  be excluded, because two rows quantifying different products (`24 box`, `10 box`) are not
  a contradiction and treating them as one would flag an internally consistent document.

**Fault isolation and result integrity**

- **FR-016**: When a document yields no extractable line items at all, the result MUST state
  that explicitly with a named reason, rather than returning an empty list with no
  explanation.
- **FR-017**: A failure affecting one line item MUST NOT prevent other line items on the
  same page from being returned.
- **FR-018**: A failure affecting one page MUST NOT prevent line items on other pages from
  being returned.
- **FR-019**: Any accepted upload MUST produce a complete, well-formed result. Internal
  processing failures MUST be converted into refusals rather than aborting the request.
- **FR-020**: The service MUST reject before processing, with a named reason, any upload
  that is not a readable PDF, is empty, is password-protected, or exceeds the accepted size
  or page limit.

**Predictability**

- **FR-021**: Processing the same document twice MUST produce results with stable
  classification: the same values land in the same collection (extracted, refused, or
  ambiguous) with the same evidence attached. Byte-identical output is NOT required —
  the wording of a description and the ordering of entries MAY vary between runs.
- **FR-022**: A value's classification MUST NOT change between runs. A value that was
  extracted with evidence on one run MUST NOT be refused on the next, and a value that was
  refused MUST NOT become extracted, for the same input document.
- **FR-023**: Evidence MUST be stable across runs. Where a value is extracted on two runs,
  both runs MUST report the same page number, and both source texts MUST resolve to the
  same location in that page's text.
- **FR-024**: A stated document total MUST be compared against the sum of the extracted
  line items to the cent. Any difference MUST be reported as an ambiguity; no difference is
  silently absorbed.
- **FR-025**: A total-versus-sum difference MUST be classified into one of two distinct
  ambiguity kinds, and both kinds MUST be reported:
  - **Rounding difference** — the absolute difference is at most one cent multiplied by the
    number of line items included in the sum. This is the expected consequence of per-line
    rounding on trade invoices.
  - **Material mismatch** — any difference larger than that.
  Both kinds carry the same evidence obligations under FR-013, and neither is resolved in
  favour of one value under FR-014. The distinction exists so a reviewer can separate signal
  from expected arithmetic noise, NOT so the smaller kind can be hidden.

### Key Entities

- **Document**: One uploaded PDF. Has an ordered set of pages, each with page-scoped text
  that serves as the ground truth all evidence is checked against. Not persisted after the
  result is returned.
- **Line Item**: One extracted row. Holds a description, a quantity, and a monetary value —
  each of which is present only if independently evidenced. Belongs to a page.
- **Evidence**: The page number plus the exact source text supporting one specific value.
  Attached to a value, not to a whole line item, so that a partially readable row can carry
  evidence on its readable parts.
- **Refusal**: A named thing the service would not extract. Holds what it concerns (an item,
  a value, or a page), a reason from the enumerated set, and the page number where
  applicable.
- **Ambiguity**: A contradiction found in the document. Holds what fact is in conflict, the
  two or more conflicting values, the evidence for each, and — for a total-versus-sum
  conflict — whether it is a rounding difference or a material mismatch. Never resolved
  into one value.
- **Extraction Result**: The single envelope returned for one document, containing the line
  items, the refusals, and the ambiguities together.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of returned values carry a page number and source text, and 100% of that
  source text is found verbatim on the page it claims, across every sample document. Zero
  exceptions is a pass; one exception is a failure.
- **SC-002**: Zero values appear in a result as extracted without passing the evidence
  check, measured by auditing every value in every sample document's result against that
  document's text.
- **SC-003**: A reviewer with no technical background can locate the origin of any extracted
  number in the original document in under 30 seconds using only the page number and source
  text in the result.
- **SC-004**: 100% of refusal reasons come from the enumerated set and name a specific item,
  value, or page. Zero generic reasons appear in any sample document's result.
- **SC-005**: Every sample document returns a complete result. Zero documents cause a total
  failure with no usable output, including documents containing unreadable or non-invoice
  pages.
- **SC-006**: For a document with a deliberately introduced unreadable value, 100% of the
  remaining readable line items in that document are still returned.
- **SC-007**: For a document whose stated total disagrees with its line-item sum, the
  conflict is reported as an ambiguity in 100% of runs, correctly classified as a rounding
  difference or a material mismatch, and the result never presents one of the conflicting
  values as the answer.
- **SC-008**: Processing the same document ten times produces the same classification for
  every value — extracted, refused, or ambiguous — and the same page number for every
  extracted value, in 100% of runs. Variation in description wording or entry ordering does
  not count as a failure.
- **SC-009**: A typical document of up to 10 pages returns a result within 30 seconds; a
  reviewer is never left without either a result or a named reason.
- **SC-010**: Every enumerated refusal case, and both ambiguity kinds, are covered by a test
  that exercises them, so each case's behavior is demonstrably reproducible.

## Out of Scope

The following are explicitly excluded from this feature:

- The web user interface (Part B). This feature delivers the extraction result only.
- Reading text from scanned or image-only documents. Such pages produce a named refusal;
  no image-to-text conversion is attempted.
- Multi-currency handling, and any New Zealand or Australian tax-specific logic (GST
  treatment, tax-inclusive vs. tax-exclusive reconciliation).
- Any persistence of uploaded documents or of extraction results. Nothing is stored.
- Correcting, normalizing, or enriching supplier data (product code lookup, unit conversion,
  price benchmarking).
- Batch or multi-document upload in a single request.
- User accounts, authentication, and access control.

## Assumptions

- **One document per request.** Each upload is a single PDF and produces a single result.
- **Text-based PDFs are the primary target.** The sample documents carry an extractable text
  layer. Documents without one are handled by refusal, not by image processing.
- **Totals, subtotals, and tax lines are not line items.** They are captured as
  document-level stated values used to detect contradictions against the line-item sum,
  rather than being returned as extracted rows.
- **Both unit price and line total are treated as monetary values** and are each evidenced
  separately when the document provides them, since a row may show either or both.
- **Delivery dockets and packing lists frequently carry no pricing at all.** An absent price
  on such a document is normal and produces a "value not provided by the document" refusal
  rather than being treated as a document defect.
- **Accepted upload limits**: a single PDF up to 20 MB and up to 50 pages. Uploads beyond
  these limits are rejected with a named reason rather than processed slowly.
- **Reviewers are not developers.** Reasons and evidence are written to be read by a
  merchant or estimator, not parsed by an engineer.
- **The sample documents in `sample-files-variant/` are the working corpus** for validating
  the acceptance scenarios and success criteria for this feature.
- **No authentication is required** for this feature; it is evaluated as a take-home
  assessment rather than deployed to production users.
- **Determinism is guaranteed at the classification level, not the byte level** (FR-021,
  resolved 2026-09-22). This deliberately leaves room to interpret a messy layout rather
  than refusing it wholesale, on the basis that the evidence check — not reproducible
  phrasing — is what makes a number trustworthy.
- **Per-line rounding is expected, not hidden** (FR-025, resolved 2026-09-22). A sub-cent-
  per-line difference between the stated total and the line-item sum is still reported as
  an ambiguity; it is merely labelled as a rounding difference so a reviewer can tell it
  apart from a real discrepancy.
