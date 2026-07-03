/**
 * Buddy AI — Field Engine
 *
 * Central module for field collection, validation, and UI rendering.
 * Import from here instead of individual files.
 *
 * @see BUDDY_AI_V3_UPGRADE_PLAN.md Phase 2
 */

export {
  classifyFieldPriority,
  getSortedFields,
  isFieldEmpty,
  getMissingFields,
  getMissingRequiredFields,
  getNextRequiredField,
  nextFieldToStep,
  calculateProgress,
  isCollectionComplete,
  getFieldByName,
  isOptionalField,
  isDescriptiveField,
  getRemainingOptionalFields,
  getCollectedSummary,
  areDependenciesSatisfied,
  type PrioritizedField,
  type NextFieldResult,
  type FieldProgress,
} from "./collector";

export {
  validateFieldValue,
  validateCollectedData,
  type FieldValidationResult,
  type BatchValidationResult,
} from "./validator";

export {
  renderFieldCollectionUI,
  renderEmptyOptionsUI,
  renderOptionalSelectorUI,
  renderConfirmButtonUI,
  renderEditSelectorUI,
  type RenderFieldCollectionOptions,
  type EmptyOptionsMeta,
  type EditFieldEntry,
} from "./renderer";

export {
  resolveExtractedFields,
  normalizeExtractedFields,
  canExpressToReview,
  classifyUpdateExpressPath,
  getEntityRefFromExtracted,
  getEntityRefKeys,
  type ResolveResult,
} from "./express-resolver";
