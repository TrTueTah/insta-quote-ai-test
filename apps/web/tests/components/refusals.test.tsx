import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ResultView } from '../../src/components/ResultView';
import { corpus, fixture, allCorpusNames } from '../helpers/load';

describe('US2: refusals inline and in the inventory', () => {
  it('shows each missing amount inline, within its own line item', () => {
    const result = corpus('IB-56010');
    render(<ResultView result={result} fileName="IB-56010.pdf" />);

    const items = screen.getAllByTestId('line-item');
    expect(items).toHaveLength(4);

    for (const item of items) {
      const missing = within(item).getByTestId('missing-amount');
      expect(within(missing).getByText('Not extracted')).toBeVisible();
      expect(within(item).getByTestId('inline-refusal-reason').textContent).toMatch(
        /does not state an amount/,
      );
    }
  });

  it('lists every refusal in the inventory as well', () => {
    const result = corpus('IB-56010');
    render(<ResultView result={result} fileName="IB-56010.pdf" />);

    expect(screen.getAllByTestId('refusal')).toHaveLength(result.refusals.length);
  });

  it('inline and inventory carry identical reason text, neither shortened', () => {
    // FR-025 and FR-026, and SC-011. The tidy-up this forbids -- replacing one copy with
    // "see below" -- is the change that would quietly turn the chosen design into the one
    // that was rejected.
    render(<ResultView result={corpus('IB-56010')} fileName="IB-56010.pdf" />);

    const inline = screen.getAllByTestId('inline-refusal-reason').map((el) => el.textContent);
    const inventory = screen.getAllByTestId('refusal-reason').map((el) => el.textContent);

    for (const reason of inline) {
      expect(inventory, 'every inline reason must also appear in the inventory').toContain(reason);
      expect(reason).not.toMatch(/see below|see above|\.\.\.|…/);
    }
  });

  it('renders page-scoped refusals in the inventory', () => {
    render(<ResultView result={corpus('IB-STMT47')} fileName="IB-STMT47.pdf" />);

    const refusals = screen.getAllByTestId('refusal');
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.textContent).toMatch(/Page 4/);
  });

  it('makes refusals the primary content when nothing was extracted', () => {
    // FR-013: an informative outcome, not a failure to apologise for.
    render(<ResultView result={corpus('IB-55902')} fileName="IB-55902.pdf" />);

    expect(screen.getByTestId('refusal-inventory')).toBeVisible();
    expect(screen.queryByTestId('line-items-section')).toBeNull();
    expect(screen.getByTestId('no-line-items-note')).toBeVisible();
    expect(screen.getByTestId('refusal-reason').textContent).toMatch(/scanned image/);
  });

  it('surfaces an unexplained gap rather than rendering a silent blank', () => {
    render(<ResultView result={fixture('unexplained-gap')} fileName="gap.pdf" />);

    expect(screen.getByTestId('missing-unitPrice')).toBeVisible();
    expect(screen.getByTestId('inline-refusal-reason').textContent).toMatch(
      /did not say why|incompletely read/,
    );
  });
});

describe('reasons are the service\'s own words', () => {
  it.each(allCorpusNames())('%s renders every reason verbatim', (name) => {
    const result = corpus(name);
    render(<ResultView result={result} fileName={`${name}.pdf`} />);

    for (const refusal of result.refusals) {
      // SC-003: word for word, not re-worded or re-categorised.
      expect(screen.getAllByText(refusal.reason).length).toBeGreaterThan(0);
    }
  });
});
