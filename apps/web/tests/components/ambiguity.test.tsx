import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ResultView } from '../../src/components/ResultView';
import { AmbiguityCard } from '../../src/components/AmbiguityCard';
import { corpus, fixture } from '../helpers/load';

describe('US3: contradictions as their own distinct thing', () => {
  it('shows the total mismatch with every figure and its evidence', () => {
    const result = corpus('IB-56150');
    render(<ResultView result={result} fileName="IB-56150.pdf" />);

    const ambiguity = screen.getByTestId('ambiguity');
    expect(within(ambiguity).getAllByTestId('conflicting-value')).toHaveLength(3);
    expect(within(ambiguity).getByText('Subtotal: $1,270.00')).toBeVisible();
    expect(within(ambiguity).getByText('Total (incl GST): $1,501.80')).toBeVisible();
    expect(within(ambiguity).getByTestId('ambiguity-reason').textContent).toMatch(/\$41\.30/);
  });

  it('marks the computed figure as calculated, not printed on the document', () => {
    render(<ResultView result={corpus('IB-56150')} fileName="IB-56150.pdf" />);

    const computed = screen.getByTestId('computed-value');
    expect(computed.textContent).toMatch(/\$1,460\.50/);
    expect(computed.textContent).toMatch(/calculated, not printed on the document/);
  });

  it('nominates no winner among the conflicting values', () => {
    render(<ResultView result={corpus('IB-56150')} fileName="IB-56150.pdf" />);

    const values = screen.getAllByTestId('conflicting-value');
    // FR-012: no value may carry a treatment the others lack.
    const classes = values.map((v) => v.className);
    expect(new Set(classes).size).toBe(1);

    expect(screen.queryByText(/correct value|the right|use this one/i)).toBeNull();
  });

  it('keeps contradictions separate from refusals and line items', () => {
    render(<ResultView result={fixture('refusals-and-ambiguities')} fileName="both.pdf" />);

    const ambiguitySection = screen.getByTestId('ambiguity-section');
    const refusalSection = screen.getByTestId('refusal-inventory');

    // FR-010, SC-004: distinguishable without reading the detail text of each.
    expect(ambiguitySection).not.toContainElement(refusalSection);
    expect(refusalSection).not.toContainElement(ambiguitySection);
    expect(within(ambiguitySection).queryAllByTestId('refusal')).toHaveLength(0);
    expect(within(refusalSection).queryAllByTestId('ambiguity')).toHaveLength(0);
  });

  it('renders the prose count conflict from IB-56088', () => {
    render(<ResultView result={corpus('IB-56088')} fileName="IB-56088.pdf" />);

    const ambiguity = screen.getByTestId('ambiguity');
    expect(ambiguity.textContent).toMatch(/9 cartons dispatched/);
    expect(ambiguity.textContent).toMatch(/11 cartons picked and loaded/);
  });
});

describe('severity is labelled but never ranked', () => {
  // No sample document produces a rounding_difference, so this is the ONLY coverage
  // FR-028 and SC-012 have. Deleting the fixture silently removes it.
  const both = fixture('both-ambiguity-kinds');

  it('labels each kind', () => {
    render(<ResultView result={both} fileName="both.pdf" />);

    const labels = screen.getAllByTestId('ambiguity-kind-label').map((el) => el.textContent);
    expect(labels).toContain('Rounding difference');
    expect(labels).toContain("Figures don't match");
  });

  it('gives both kinds identical size, padding and structure', () => {
    render(<ResultView result={both} fileName="both.pdf" />);

    const cards = screen.getAllByTestId('ambiguity');
    expect(cards).toHaveLength(2);

    // FR-028: they may differ only in label and accent. The card itself must be identical.
    const [first, second] = cards as [HTMLElement, HTMLElement];
    expect(first.className).toBe(second.className);
  });

  it('collapses or hides neither kind', () => {
    render(<ResultView result={both} fileName="both.pdf" />);

    for (const card of screen.getAllByTestId('ambiguity')) {
      expect(card.closest('details')).toBeNull();
      expect(card.closest('[hidden]')).toBeNull();
      expect(card).toBeVisible();
      expect(within(card).getByTestId('ambiguity-reason')).toBeVisible();
    }
  });

  it('does not reorder by severity', () => {
    // FR-029: sorting is how "equally prominent" quietly becomes a hierarchy.
    render(<ResultView result={both} fileName="both.pdf" />);

    const rendered = screen.getAllByTestId('ambiguity').map((el) => el.dataset['kind']);
    expect(rendered).toEqual(both.ambiguities.map((a) => a.kind));
    expect(rendered[0]).toBe('rounding_difference'); // the lesser kind is NOT demoted
  });

  it('renders the two kinds with the same markup shape', () => {
    const rounding = both.ambiguities.find((a) => a.kind === 'rounding_difference')!;
    const material = both.ambiguities.find((a) => a.kind === 'material_mismatch')!;

    const { container: a } = render(<AmbiguityCard ambiguity={rounding} />);
    const { container: b } = render(<AmbiguityCard ambiguity={material} />);

    const shapeOf = (root: HTMLElement) =>
      [...root.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid'));

    // The rounding card has a `computed` figure and the material one does not, so compare the
    // structure they share rather than demanding identical trees.
    expect(shapeOf(a)).toContain('ambiguity-kind-label');
    expect(shapeOf(b)).toContain('ambiguity-kind-label');
    expect(shapeOf(a)).toContain('ambiguity-reason');
    expect(shapeOf(b)).toContain('ambiguity-reason');
  });
});
