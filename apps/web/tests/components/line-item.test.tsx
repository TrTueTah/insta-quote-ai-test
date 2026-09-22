import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultView } from '../../src/components/ResultView';
import { corpus } from '../helpers/load';

describe('US1: extracted line items with their evidence', () => {
  it('renders all four line items from the clean invoice', () => {
    const result = corpus('IB-55871');
    render(<ResultView result={result} fileName="IB-55871.pdf" />);

    expect(screen.getAllByTestId('line-item')).toHaveLength(4);
    expect(screen.getByText('FX-201')).toBeInTheDocument();
    expect(screen.getByText('Framing nail gun coil, 90mm galv')).toBeInTheDocument();
    expect(screen.getByText('$1,248.00')).toBeInTheDocument();
  });

  it('shows the page number and source text for every item', () => {
    const result = corpus('IB-55871');
    render(<ResultView result={result} fileName="IB-55871.pdf" />);

    const quotes = screen.getAllByTestId('source-text');
    expect(quotes).toHaveLength(4); // one shared quote per item

    expect(
      screen.getByText('FX-201 Framing nail gun coil, 90mm galv 24 box $52.00 $1,248.00'),
    ).toBeInTheDocument();
  });

  it('shows evidence without requiring any interaction', () => {
    // FR-006 is about no clicks, not about the string existing somewhere. Evidence inside a
    // <details>, a hidden element, or a title attribute would pass a naive text query and
    // fail the requirement.
    render(<ResultView result={corpus('IB-55871')} fileName="IB-55871.pdf" />);

    for (const quote of screen.getAllByTestId('source-text')) {
      expect(quote.closest('details')).toBeNull();
      expect(quote.closest('[hidden]')).toBeNull();
      expect(quote).toBeVisible();
    }
  });

  it('attributes each item to the page it came from', () => {
    render(<ResultView result={corpus('IB-STMT47')} fileName="IB-STMT47.pdf" />);

    const pages = screen.getAllByTestId('line-item').map((el) => el.dataset['page']);
    expect(new Set(pages)).toEqual(new Set(['1', '2', '3', '5', '6', '7', '8']));
  });

  it('keeps a long source text intact rather than truncating it', () => {
    render(<ResultView result={corpus('IB-55871')} fileName="IB-55871.pdf" />);

    for (const quote of screen.getAllByTestId('source-text')) {
      expect(quote.textContent).not.toMatch(/…|\.\.\.$/);
    }
  });
});

describe('evidence integrity', () => {
  it.each(['IB-55871', 'IB-56010', 'IB-STMT47'] as const)(
    '%s renders every source text character for character',
    (name) => {
      const result = corpus(name);
      render(<ResultView result={result} fileName={`${name}.pdf`} />);

      const rendered = screen.getAllByTestId('source-text').map((el) => el.textContent);

      for (const item of result.lineItems) {
        const evidence =
          item.code?.evidence ?? item.description?.evidence ?? item.quantity?.evidence;
        expect(rendered, `${item.id}`).toContain(evidence?.sourceText);
      }
    },
  );
});

describe('a clean result is not decorated with problems it does not have', () => {
  it('renders no refusals section, no summary and no warning for IB-55871', () => {
    render(<ResultView result={corpus('IB-55871')} fileName="IB-55871.pdf" />);

    expect(screen.queryByTestId('refusal-inventory')).toBeNull();
    expect(screen.queryByTestId('ambiguity-section')).toBeNull();
    expect(screen.queryByTestId('result-summary')).toBeNull();
    expect(screen.queryByText(/not extracted/i)).toBeNull();
  });
});
