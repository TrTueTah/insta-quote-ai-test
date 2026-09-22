import type { LineItemField } from '@insta-quote/contracts';

/**
 * Field names as a person reads them.
 *
 * FR-021: no internal identifier reaches the screen. `unitPrice` is a property name; "unit
 * price" is what the document calls it.
 */
const FIELD_LABELS: Record<LineItemField, string> = {
  code: 'Code',
  description: 'Description',
  quantity: 'Quantity',
  unit: 'Unit',
  unitPrice: 'Unit price',
  amount: 'Amount',
};

export function fieldLabel(field: LineItemField): string {
  return FIELD_LABELS[field];
}

/** The order values are read in, matching how a document lays a row out. */
export const FIELD_ORDER: readonly LineItemField[] = [
  'code',
  'description',
  'quantity',
  'unit',
  'unitPrice',
  'amount',
];

export const MONEY_FIELDS: ReadonlySet<LineItemField> = new Set(['unitPrice', 'amount']);
