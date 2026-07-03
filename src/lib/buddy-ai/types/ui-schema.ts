/**
 * Buddy AI — UI Contract Types
 *
 * Shared types for the schema-driven UI. Used by:
 * - Backend: orchestrator, structured output
 * - Frontend: BuddyChatPanel, schema-driven components
 *
 * @see BUDDY_AGENT_UI_PLAN.md § 3. UI Contract
 */

/** Dropdown/select option: value (id) + label (display) */
export type DropdownOption = {
  value: string;
  label: string;
};

/** Field types supported by the UI contract */
export type UISchemaFieldType =
  | "text"
  | "dropdown"
  | "date"
  | "chips"
  | "confirmation"
  | "skip"
  | "optional_field_selector"
  | "edit_field_selector"
  | "confirm_button";

/** Base field definition (shared by field_collection and others) */
export type UISchemaFieldBase = {
  name: string;
  label: string;
  type: UISchemaFieldType;
  required?: boolean;
};

/** Dropdown field — options from tool (e.g. list_business_contacts) */
export type UISchemaFieldDropdown = UISchemaFieldBase & {
  type: "dropdown";
  options: DropdownOption[];
};

/** Chips field — quick choices (single or multi-select) */
export type UISchemaFieldChips = UISchemaFieldBase & {
  type: "chips";
  options: DropdownOption[];
  multiSelect?: boolean;
};

/** Date field */
export type UISchemaFieldDate = UISchemaFieldBase & {
  type: "date";
};

/** Text field */
export type UISchemaFieldText = UISchemaFieldBase & {
  type: "text";
};

/** Confirmation — Yes, No, Edit buttons */
export type UISchemaConfirmation = {
  type: "confirmation";
  message: string;
  summary: Record<string, unknown>;
  /** Custom button labels: yesLabel, noLabel, editLabel */
  yesLabel?: string;
  noLabel?: string;
  editLabel?: string;
};

/** Optional field selector — chips for "Add any? [End Date] [Description] …" */
export type UISchemaOptionalFieldSelector = {
  type: "optional_field_selector";
  message: string;
  fields: Array<{ name: string; label: string }>;
  skipLabel?: string; // e.g. "None" or "Done"
  /** Show Confirm button to skip to review */
  showConfirm?: boolean;
};

/** Edit field selector — chips for "Which field to change? [Name] [Client] …" */
export type UISchemaEditFieldSelector = {
  type: "edit_field_selector";
  message: string;
  fields: Array<{ name: string; label: string; value?: unknown }>;
  /** Special option value for "Add more optional fields" */
  addMoreOptionalsValue?: string;
};

/** Gated Confirm button — shown after required + optional phase complete */
export type UISchemaConfirmButton = {
  type: "confirm_button";
  message: string;
};

/** Choice gate — action buttons flow: "Chat with AI" vs "Fill Form Manually" */
export type UISchemaChoiceGate = {
  type: "choice_gate";
  message: string;
  /** Card header e.g. "Create Project" */
  title?: string;
  /** Instruction inside card e.g. "Choose how you'd like to proceed" */
  instruction?: string;
  options: Array<{ value: string; label: string }>;
};

/**
 * Empty options — shown when a dropdown has no data (e.g. no clients exist).
 * Displays a helpful message with a link to create the missing entity.
 */
export type UISchemaEmptyOptions = {
  type: "empty_options";
  message: string;
  /** Entity label (e.g. "Client", "Project Manager") */
  entityLabel: string;
  /** Link to the page where the user can create the missing entity */
  createLink?: string;
  /** Label for the create link button (e.g. "Go to Business Contacts") */
  createLinkLabel?: string;
  /** Field name (so workflow knows which field was blocked) */
  fieldName: string;
  /** Is this a required field? (determines whether Cancel or Skip is shown) */
  isRequired: boolean;
};

/** Field collection — asking for a single field value */
export type UISchemaFieldCollection = {
  type: "field_collection";
  field:
    | UISchemaFieldDropdown
    | UISchemaFieldDate
    | UISchemaFieldText
    | UISchemaFieldChips;
  /** Show Skip button (skip this optional field, go to next) */
  showSkip?: boolean;
  /** Show Confirm button (skip to review, skip remaining optionals) */
  showConfirm?: boolean;
};

/** Union of all UI schema types */
export type UISchema =
  | UISchemaFieldCollection
  | UISchemaConfirmation
  | UISchemaOptionalFieldSelector
  | UISchemaEditFieldSelector
  | UISchemaConfirmButton
  | UISchemaChoiceGate
  | UISchemaEmptyOptions;

/** Formal workflow state (Agent Creation Flow) */
export type WorkflowStateType =
  | "IDLE" // No workflow active
  | "CHOICE_GATE"
  | "COLLECTING"
  | "REVIEWING"
  | "EXECUTING"; // Tool running

/** Structured response from the agent (workflow mode) */
export type StructuredResponse = {
  message: string;
  uiSchema: UISchema | null;
  collectedData: Record<string, unknown>;
  workflow: string;
  nextStep: string;
  /** Formal state (for transitions, cancel, etc.) */
  state?: WorkflowStateType;
  /** Show Cancel button (available at each step except done) */
  showCancel?: boolean;
  /** Show Back button (go to previous step) */
  showBack?: boolean;
  /** Optional: for create_project, fields user chose to add */
  pendingOptionalFields?: string[];
  /** Optional: fields user explicitly skipped */
  skippedFields?: string[];
  /** Progress 0–100 when in workflow. Omit when done. */
  progress?: number;
  /** Step history for back navigation */
  stepHistory?: string[];
  /** Number of createTool failures (for retry limit) */
  createRetryCount?: number;
  /** Extracted fields from routing, applied when user selects "Chat with AI" */
  prefillData?: Record<string, unknown>;
  /**
   * The org pool couldn't cover this action — the client renders the
   * out-of-credits card instead of plain message text.
   */
  creditsExhausted?: boolean;
};

/** Structured input from user (chip/dropdown selection) */
export type StructuredInput = {
  field: string;
  value: string | string[];
};
