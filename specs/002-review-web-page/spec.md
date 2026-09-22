# Feature Specification: Review Web Page (Part B)

**Feature Branch**: `002-review-web-page`
**Created**: 2026-09-22
**Status**: Draft
**Input**: User description: "Build the review web page (Part B): a person uploads a PDF and sees the extraction result from Part A — the line items it found, and, with equal visual weight, everything it refused to extract or flagged as ambiguous, in language a non-technical person can understand and trust."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the extracted numbers and see where each came from (Priority: P1)

Someone at a trade business uploads their own invoice and sees the line items that were
extracted. Next to each value is the page it came from and the exact text on that page that
supports it, close enough that the connection is obvious at a glance. They can decide
whether to trust a number without asking anyone technical and without clicking anything.

**Why this priority**: This is the reason the page exists. Part A's guarantee — that no
number is returned without evidence — is worth nothing if the evidence never reaches the
screen. Delivered alone, this already lets someone verify extracted numbers against their
own paperwork.

**Independent Test**: Upload a clean invoice. Confirm each extracted value displays its page
number and source text without any expansion, hover, or navigation, and that the source text
matches the document.

**Acceptance Scenarios**:

1. **Given** a clean, fully extractable document, **When** processing completes, **Then**
   every extracted line item is displayed with its values and the page number and source text
   supporting them, all visible without interaction.
2. **Given** a clean document where nothing was refused, **When** the result is displayed,
   **Then** no refusals section, warning, or error styling appears implying that something
   went wrong when nothing did.
3. **Given** a file has been submitted, **When** processing is underway, **Then** the person
   sees a state that names what is happening to their document, not an unlabelled spinner.
4. **Given** a displayed line item, **When** the person compares it to the original document,
   **Then** the page number shown leads them to the right page and the source text appears on
   it word for word.

---

### User Story 2 - Understand exactly what was not extracted, and why (Priority: P2)

The document has values that could not be read. The person sees those refusals as a
first-class part of the result — not hidden in a toast, a collapsed panel, or a corner —
each naming the specific item or value affected and giving a reason they can understand
without technical background.

**Why this priority**: A person who cannot tell why something is missing cannot safely act
on what remains. A partial result presented as if it were complete is more dangerous than no
result. Depends on User Story 1 being visible but is independently observable.

**Independent Test**: Upload a document with values that cannot be read. Confirm the
refusals are visible in the same view as the line items, with no clicking or scrolling past
the results to find them, and that each names its specific item and a plain-language reason.

**Acceptance Scenarios**:

1. **Given** a document with some values that could not be extracted, **When** processing
   completes, **Then** both the extracted line items and the refusals are visible without
   expanding, clicking through, or hunting for the refusal detail.
2. **Given** any refusal on screen, **When** the person reads it, **Then** it names the
   specific item, value, or page it concerns and gives the reason in plain language — never
   a code, an identifier, or wording that assumes technical knowledge.
3. **Given** a document that produced no extractable line items at all, **When** the result
   is displayed, **Then** the refusals are the primary content of the result, presented as a
   valid and informative outcome rather than as a failure or an apology.
4. **Given** a line item where some values were extracted and others refused, **When** the
   result is displayed, **Then** the reason appears inline within that line item, next to the
   value it concerns, so the person never sees an unexplained gap where a number should be.
5. **Given** any refusal shown inline within a line item, **When** the person looks at the
   refusals section, **Then** the same refusal also appears there with the same reason text,
   so that section remains a complete inventory of everything the document did not give up.

---

### User Story 3 - Tell a contradiction apart from something unreadable (Priority: P3)

The document disagrees with itself — a total that does not match its line items, two
different figures for the same fact. The person sees this presented as its own distinct
kind of result, clearly not the same thing as a value that could not be read, because the
two call for completely different next actions.

**Why this priority**: "I could not read this" means go and look at the paperwork. "This
document contradicts itself" means go back to the supplier. Collapsing them into one
category destroys the information the person needs to decide what to do next.

**Independent Test**: Upload a document whose stated total disagrees with its line items.
Confirm the contradiction appears as its own distinct section or treatment, visually and
textually separate from both the line items and the refusals, showing every conflicting
value.

**Acceptance Scenarios**:

1. **Given** a document with a self-contradicting total, **When** processing completes,
   **Then** the contradiction is displayed as its own distinct thing, folded into neither the
   line items nor the refusals.
2. **Given** a displayed contradiction, **When** the person reads it, **Then** every
   conflicting value is shown with the page and source text it came from, and no single value
   is presented as the correct one.
3. **Given** a result containing both refusals and contradictions, **When** the person looks
   at the page, **Then** they can tell the two apart without reading the detail text of each.
4. **Given** contradictions of differing severity — a minor rounding difference and a
   material mismatch — **When** they are displayed, **Then** both are labelled with their
   severity and both are given the same size, the same position in the reading order, and the
   same expansion state, so neither reads as the more important one.

---

### User Story 4 - Know which thing went wrong when something does (Priority: P4)

When the page cannot produce a result, the person is told which of several different things
happened — the service could not be reached, the service replied with something unusable, or
the file itself could not be submitted. Each reads differently. None of them is "something
went wrong."

**Why this priority**: A generic error tells the person nothing about whether to retry, wait,
or pick a different file. This is the failure mode the whole project exists to avoid,
applied to the page itself rather than to the document.

**Independent Test**: Trigger each failure separately — stop the extraction service, make it
return a malformed response, and select a non-PDF file — and confirm three visibly different
messages, none of them shared or generic.

**Acceptance Scenarios**:

1. **Given** the extraction service is unreachable or does not respond in time, **When** the
   person submits a file, **Then** they see a message naming that specific situation, such as
   the service not being reachable.
2. **Given** the extraction service replies with something that does not match the expected
   result shape, **When** this happens, **Then** the person sees a message clearly different
   from the unreachable-service message, naming that the reply could not be understood.
3. **Given** a file that is not a PDF, or is empty, **When** the person tries to submit it,
   **Then** they are told why before any request is sent, not after a failed round trip.
4. **Given** the extraction service successfully returns refusals for specific content,
   **When** the result is displayed, **Then** it is rendered as a normal result per User
   Stories 2 and 3 — never as an application error.
5. **Given** any of these failure states, **When** the person reads the message, **Then** it
   does not say "something went wrong", "an error occurred", or any equivalent that fails to
   name what happened.

---

### Edge Cases

- **A very large result** (dozens of line items across many pages): all sections remain
  navigable, and refusals do not get pushed so far down the page that they are effectively
  hidden — which would defeat User Story 2 by layout rather than by markup.
- **A result with many refusals and few line items**: the proportions on screen reflect the
  result; a document that mostly failed to extract must not look like a mostly successful one.
- **Source text long enough to disrupt layout** (a full-width table row): displayed in full
  without breaking the page, since truncating evidence would undermine the verification it
  exists for.
- **A second file uploaded after a result is already displayed**: the previous result is
  cleared, so no value from the old document can be read as belonging to the new one.
- **The person navigates away or closes the tab mid-processing**: no partial or stale result
  is shown on return; nothing is saved.
- **The service responds successfully but with an empty result in every category**: treated
  as a response that does not match the expected shape, since a result explaining nothing is
  exactly what the extraction service promises never to return.
- **A file that exceeds the accepted size or page limit**: named before submission where the
  page can tell, and rendered as a named rejection where only the service can tell.
- **The person submits with no file selected**: told so, with no request sent.
- **Very slow processing** (a large document taking tens of seconds): the in-progress state
  persists and continues to indicate work is happening, rather than appearing stalled.

## Requirements *(mandatory)*

### Functional Requirements

**Upload and progress**

- **FR-001**: The page MUST let a person select one PDF file and submit it for processing.
- **FR-002**: The page MUST validate, before sending any request, that a file has been
  selected, is not empty, and is a PDF. Failures MUST be reported immediately with a reason
  naming which of those conditions failed.
- **FR-003**: While processing, the page MUST display a state that names what is happening to
  the document rather than showing an unlabelled loading indicator.
- **FR-004**: The page MUST accept only one file per submission.

**Displaying results**

- **FR-005**: Extracted line items, refusals, and contradictions MUST each be displayed as
  first-class content in the main result view. None may be placed in a transient notification,
  a collapsed section that starts closed, or any treatment requiring interaction to reveal.
- **FR-006**: Every displayed extracted value MUST show the page number and the source text
  supporting it, positioned so the connection to the value is apparent without interaction.
- **FR-007**: Source text MUST be displayed exactly as received, without truncation,
  reformatting, or summarizing, because its purpose is letting the person match it against
  their document.
- **FR-008**: Every refusal MUST display the specific item, value, or page it concerns.
- **FR-009**: Every refusal MUST display the reason exactly as supplied by the extraction
  service. The page MUST NOT re-word it, replace it with its own text, map it into generic
  categories, or substitute a code or identifier.
- **FR-010**: Contradictions MUST be displayed in a way that is distinguishable from refusals
  without reading the detail text of each.
- **FR-011**: Every contradiction MUST display all of its conflicting values, each with the
  page and source text it came from.
- **FR-012**: The page MUST NOT present one of a contradiction's conflicting values as the
  correct one, whether by selecting it, ordering it first as an answer, or styling it as
  resolved.
- **FR-013**: When a result contains no extracted line items, the refusals MUST be the
  primary content of the result view, presented as an informative outcome rather than as an
  error or a failure.
- **FR-014**: When a result contains no refusals and no contradictions, the page MUST NOT
  display empty sections, warnings, or error styling that imply a problem.
- **FR-015**: Where some of a line item's values were extracted and others refused, the page
  MUST make clear which values are missing from that item and why, without requiring the
  person to match identifiers between separate lists.

**Failure states**

- **FR-016**: The page MUST distinguish at minimum these four situations, and MUST NOT render
  any two of them with the same message:
  1. the extraction service could not be reached, or did not respond in time;
  2. the extraction service responded with something that does not match the expected result
     shape;
  3. the file could not be submitted at all (not a PDF, empty, none selected);
  4. the extraction service returned refusals or contradictions — which is a successful
     result, rendered per FR-005 through FR-015 and never as an application failure.
- **FR-017**: No failure message may be generic. "Something went wrong", "an error occurred",
  "unexpected error" and equivalents MUST NOT appear anywhere in the page.
- **FR-018**: A failure message MUST state what happened in terms the person can act on.
- **FR-019**: The page MUST validate the shape of the extraction service's response before
  displaying it, and MUST report a mismatch by name rather than displaying a partial result
  or failing silently.
- **FR-020**: A failure MUST NOT leave the page in the in-progress state; the person is
  always returned to a state from which they can try again.

**Language and comprehension**

- **FR-021**: All text the person reads MUST be understandable without technical background.
  Field identifiers, status codes, and internal names MUST NOT be displayed.
- **FR-022**: Where the extraction service supplies wording intended for the person, the page
  MUST display it verbatim, per FR-009.

**Placement of line-item refusals**

- **FR-023**: A refusal belonging to a specific line item MUST be displayed in BOTH places:
  inline within that line item, next to or in place of the value it concerns, AND as an entry
  in the refusals section.
- **FR-024**: The refusals section MUST be a complete inventory of every refusal in the
  result — line-item, page, and document scoped alike. No refusal may appear only inline.
- **FR-025**: The inline refusal and its refusals-section entry MUST carry the same reason
  text, since both come verbatim from the extraction service (FR-009). The page MUST NOT
  shorten one of them into a different sentence.
- **FR-026**: Where the same reason appears both inline and in the inventory, the repetition
  MUST NOT be reduced by collapsing, truncating, or replacing either occurrence with a
  reference such as "see below".

**Severity of contradictions**

- **FR-027**: Where the extraction service classifies a contradiction's severity, the page
  MUST show that classification.
- **FR-028**: Contradictions of differing severity MUST be given equal visual prominence —
  the same size, the same position in the reading order, and the same expansion state. They
  MAY differ only in their label and in a non-hierarchical accent such as colour.
- **FR-029**: The page MUST NOT sort, group, or style contradictions so that a lesser
  severity reads as less important, and MUST NOT collapse, truncate, or hide any severity.
  A reviewer who learns to skip one class of contradiction will eventually skip a real one.

### Key Entities

- **Upload**: The single PDF a person submits. Not stored; exists only for the current
  attempt.
- **Result**: What comes back for one upload — the extracted line items, the refusals, and
  the contradictions together. Displayed as one view.
- **Line Item**: One extracted row shown to the person, carrying whichever values were
  extracted, each with its own supporting page and source text.
- **Evidence**: The page number and exact source text shown alongside a value. The thing that
  makes a number checkable rather than merely asserted.
- **Refusal**: A named thing the extraction service would not extract, shown with what it
  concerns and the reason as supplied.
- **Contradiction**: A conflict the document makes with itself, shown with every conflicting
  value and its evidence, and no winner.
- **Page State**: Which of the mutually exclusive states the page is in — waiting for a file,
  processing, showing a result, or showing one of the named failures.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person with no technical background can, for any extracted value on screen,
  state which page it came from and what text supports it, within 10 seconds and without
  clicking anything.
- **SC-002**: For a result containing refusals, 100% of testers notice the refusals without
  being prompted to look for them.
- **SC-003**: 100% of refusal reasons displayed are the reasons supplied by the extraction
  service, word for word. Zero are re-worded, re-categorized, or replaced.
- **SC-004**: Given a result containing both a refusal and a contradiction, a person can
  correctly say which is which in 9 out of 10 attempts, using only what is on screen.
- **SC-005**: The four situations in FR-016 produce four distinguishable outcomes on screen.
  Zero pairs share a message.
- **SC-006**: The phrases "something went wrong", "an error occurred", and "unexpected error"
  appear zero times across every state the page can reach.
- **SC-007**: For a document that produced no line items at all, a person can state why in
  under 15 seconds using only what is on screen.
- **SC-008**: Selecting a non-PDF or empty file produces a named explanation before any
  request is sent, in 100% of attempts.
- **SC-009**: After any failure, a person can attempt another upload without reloading the
  page, in 100% of attempts.
- **SC-010**: For a result with partial line items, a person can say which values are missing
  from a given item and why, without being shown how the page is organised.
- **SC-011**: For every refusal shown inline within a line item, a matching entry with
  identical reason text exists in the refusals section. Zero refusals appear in only one
  place.
- **SC-012**: Given a result containing both a rounding difference and a material mismatch,
  measurements of the two on screen show equal size, equal indentation, and neither collapsed.
  A tester asked which is more important can correctly say the page does not rank them.

## Out of Scope

- **The extraction logic itself** (Part A). This feature displays what the extraction service
  returns and adds no interpretation of its own.
- **Authentication, accounts, and permissions.**
- **Saving, listing, or revisiting past uploads.** Each visit starts empty.
- **Processing more than one file at a time**, and comparing results across documents.
- **Editing, correcting, or annotating** extracted values.
- **Exporting** the result to another format.
- **Viewing the uploaded PDF itself** in the page. The person verifies against their own copy
  of the document; evidence is given as a page number and source text rather than a rendered
  preview.
- **Re-running extraction** with different settings.

## Assumptions

- **One result at a time.** Submitting a new file replaces whatever is displayed; there is no
  comparison view and no history.
- **Nothing is persisted.** Closing the page loses the result, consistent with Part A storing
  nothing.
- **The extraction service supplies person-ready wording.** Part A's contract states that
  refusal and contradiction reasons are the exact strings intended for display, so this page
  renders them rather than composing its own. A reason that reads poorly is a defect to fix in
  the extraction service, not to paper over here.
- **A source text is short enough to display inline.** In practice it is a single line from
  the document.
- **All values within one line item usually share the same source text**, because they were
  read from the same row. The page may show shared evidence once per item rather than
  repeating the identical string against every value, provided the connection to each value
  remains apparent and differing evidence is shown separately.
- **Processing may take tens of seconds** for a large document, since the extraction service
  may consult a language model. The in-progress state is built for that duration rather than
  for an instant response.
- **A request that has not completed within 60 seconds** is treated as the service not
  responding in time.
- **Reviewers work on a desktop or laptop**, with the page remaining usable on a tablet.
  Phone-sized layouts are not a target.
- **The page is used by one person at a time** on their own document; there is no sharing or
  collaboration.
- **The sample documents in `sample-files-variant/`** are the working corpus for validating
  these scenarios, since they cover a clean result, partial refusals, a contradiction, and a
  document that yields nothing.
- **Duplication between inline refusals and the refusals inventory is intended, not a defect**
  (FR-023, resolved 2026-09-22). A document such as `IB-56010.pdf` will show the same
  "does not state an amount" sentence four times inline and four times in the inventory. The
  redundancy is the price of two different questions being answerable at a glance: "why is
  this number missing?" and "how much did this document not give me?"
- **Contradiction severity is shown but never ranked** (FR-028, resolved 2026-09-22). The
  extraction service distinguishes a rounding difference from a material mismatch so a
  reviewer can triage, explicitly not so the lesser one can be de-emphasised. Giving the
  quieter kind less visual weight here would undo that intent one design decision later, so
  the page labels both and sizes them identically.
