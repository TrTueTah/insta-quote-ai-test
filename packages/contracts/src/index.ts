/**
 * Single source of truth for the shapes crossing the API boundary.
 *
 * Imported for real by apps/extraction-api and apps/web. Never copied, never kept in sync
 * by hand.
 */
export {
  EvidenceSchema,
  EvidencedStringSchema,
  EvidencedNumberSchema,
  evidencedValue,
  type Evidence,
  type EvidencedValue,
} from './evidence.js';

export {
  RefusalSchema,
  RefusalCodeSchema,
  RefusalScopeSchema,
  LineItemFieldSchema,
  type Refusal,
  type RefusalCode,
  type RefusalScope,
  type LineItemField,
} from './refusal.js';

export {
  AmbiguitySchema,
  AmbiguityKindSchema,
  AmbiguityTypeSchema,
  type Ambiguity,
  type AmbiguityKind,
  type AmbiguityType,
  type ConflictingValue,
} from './ambiguity.js';

export {
  LineItemSchema,
  ExtractionResultSchema,
  ApiErrorSchema,
  type LineItem,
  type ExtractionResult,
  type ApiError,
} from './result.js';
