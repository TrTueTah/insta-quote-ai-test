import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileRejected } from '../../src/components/states/FileRejected';
import { Unreachable } from '../../src/components/states/Unreachable';
import { BadShape } from '../../src/components/states/BadShape';
import { ServiceRejected } from '../../src/components/states/ServiceRejected';
import { Processing } from '../../src/components/Processing';
import { ResultView } from '../../src/components/ResultView';
import { allCorpusNames, corpus } from '../helpers/load';

const BANNED = [/something went wrong/i, /an error occurred/i, /unexpected error/i];

describe('US4: four situations, four different outcomes', () => {
  it('renders each failure with distinct wording', () => {
    // SC-005: zero pairs share a message.
    const texts = [
      render(<FileRejected reason="That file is empty." />).container.textContent,
      render(<Unreachable detail="The service could not be reached." />).container.textContent,
      render(<BadShape detail="Invalid input at lineItems.0" />).container.textContent,
      render(<ServiceRejected message="This PDF is password-protected." />).container.textContent,
    ];

    expect(new Set(texts).size).toBe(4);

    // And their headline sentences differ, not merely their detail text.
    const headlines = texts.map((t) => t!.slice(0, 40));
    expect(new Set(headlines).size).toBe(4);
  });

  it('distinguishes an unreachable service from an unreadable reply', () => {
    // These two are the pair most likely to collapse: both are "the service misbehaved".
    // They call for different actions -- retry versus escalate -- so they read differently.
    const unreachable = render(<Unreachable detail="x" />).container.textContent!;
    const badShape = render(<BadShape detail="y" />).container.textContent!;

    expect(unreachable).toMatch(/Couldn't reach/);
    expect(unreachable).toMatch(/Try again/);

    expect(badShape).toMatch(/can't read/);
    expect(badShape).toMatch(/Retrying is unlikely to help/);
  });

  it('shows the extraction service\'s own message verbatim', () => {
    const message = 'This PDF is password-protected, so its contents could not be read.';
    render(<ServiceRejected message={message} />);

    expect(screen.getByTestId('service-message').textContent).toBe(message);
  });

  it('names what is being processed rather than showing a bare spinner', () => {
    render(<Processing fileName="IB-55871.pdf" />);

    expect(screen.getByTestId('processing').textContent).toMatch(/Reading IB-55871\.pdf/);
  });

  it('every failure state offers another attempt', () => {
    // FR-020, SC-009: no reload required.
    const texts = [
      render(<FileRejected reason="x" />).container.textContent!,
      render(<Unreachable detail="x" />).container.textContent!,
      render(<ServiceRejected message="x" />).container.textContent!,
    ];

    for (const text of texts) {
      expect(text).toMatch(/try again/i);
    }
  });
});

describe('no generic error text anywhere', () => {
  it('none of the failure components contain a banned phrase', () => {
    const containers = [
      render(<FileRejected reason="That file is empty." />).container,
      render(<Unreachable detail="a" />).container,
      render(<BadShape detail="b" />).container,
      render(<ServiceRejected message="c" />).container,
      render(<Processing fileName="x.pdf" />).container,
    ];

    for (const container of containers) {
      for (const phrase of BANNED) {
        expect(container.textContent, container.textContent?.slice(0, 40)).not.toMatch(phrase);
      }
    }
  });

  it.each(allCorpusNames())('%s renders without a banned phrase', (name) => {
    const { container } = render(<ResultView result={corpus(name)} fileName={`${name}.pdf`} />);

    for (const phrase of BANNED) {
      expect(container.textContent).not.toMatch(phrase);
    }
  });
});

describe('no internal identifiers reach the screen', () => {
  it.each(allCorpusNames())('%s shows no ids, codes or property names', (name) => {
    const { container } = render(<ResultView result={corpus(name)} fileName={`${name}.pdf`} />);
    const text = container.textContent ?? '';

    // FR-021: `p1-r2`, `value_not_provided` and `unitPrice` are ours, not the reader's.
    expect(text).not.toMatch(/\bp\d+-r\d+\b/);
    expect(text).not.toMatch(/\bp\d+-llm\d+\b/);
    expect(text).not.toMatch(/value_not_provided|source_text_not_found|no_text_on_page|page_unreadable|source_text_ambiguous|value_not_in_source_text|document_unreadable|document_encrypted/);
    expect(text).not.toMatch(/unitPrice|lineItemId|sourceText|material_mismatch|rounding_difference/);
  });
});

describe('ordering keeps refusals visible on a long result', () => {
  it('puts the refusal section before the line items for IB-STMT47', () => {
    // 21 line items and one refused page. Below the items, that refusal is off-screen --
    // satisfying the markup requirement while defeating its intent.
    const { container } = render(
      <ResultView result={corpus('IB-STMT47')} fileName="IB-STMT47.pdf" />,
    );

    const inventory = screen.getByTestId('refusal-inventory');
    const items = screen.getByTestId('line-items-section');

    expect(inventory.compareDocumentPosition(items) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container).toBeTruthy();
  });

  it('puts contradictions before the line items too', () => {
    render(<ResultView result={corpus('IB-56150')} fileName="IB-56150.pdf" />);

    const ambiguities = screen.getByTestId('ambiguity-section');
    const items = screen.getByTestId('line-items-section');

    expect(
      ambiguities.compareDocumentPosition(items) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows a summary when there is something to flag', () => {
    render(<ResultView result={corpus('IB-STMT47')} fileName="IB-STMT47.pdf" />);

    expect(screen.getByTestId('result-summary')).toBeVisible();
  });

  it('shows no summary at all for a clean result', () => {
    // IB-55871 is the control. "0 not extracted" is still a report about problems, and a
    // reviewer reading it has been handed something to worry about that does not exist.
    render(<ResultView result={corpus('IB-55871')} fileName="IB-55871.pdf" />);

    expect(screen.queryByTestId('result-summary')).toBeNull();
  });
});
