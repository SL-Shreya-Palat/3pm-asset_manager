/**
 * Buddy AI — Workflow schema types
 *
 * Defines the structure for workflow field definitions and step definitions.
 * Used by create-project-schema, workflow registry, and future workflows.
 *
 * @see BUDDY_AGENT_UI_PLAN.md § 3.4 Workflow Schema
 * @see BUDDY_AI_V3_UPGRADE_PLAN.md Phase 2
 */

/**
 * Tool name for fetching dropdown options.
 * When adding new workflows: extend this type and add the case in
 * lib/buddy-ai/utils/resolve-id-to-label.ts getOptionsForField().
 */
export type OptionsFromTool =
  | "list_business_contacts"
  | "get_staff_directory"
  | "get_sites_for_contact"
  | "list_projects";

/** Field type in workflow schema */
export type WorkflowFieldType = "text" | "dropdown" | "date" | "chips";

/** Role filter for list_business_contacts (client dropdown = clients only) */
export type BusinessContactRoleFilter = "client" | "supplier" | "subcontractor";

/**
 * Field priority — determines the order fields are collected.
 * Higher number = asked first. Assigned via the field engine.
 */
export enum FieldPriority {
  /** System/auto-generated fields — never asked */
  HIDDEN = 0,
  /** Optional fields — skip option provided */
  OPTIONAL = 1,
  /** Required data fields (dates, email, phone, amounts) */
  REQUIRED_DATA = 2,
  /** Descriptive fields — AI generation offered in Phase 6 (description, scopeOfWork) */
  REQUIRED_DESCRIPTIVE = 3,
  /** Must-have core fields (projectName, clientName) */
  REQUIRED_CORE = 4,
  /** Critical linked IDs — asked first (clientId, projectId) */
  REQUIRED_IDENTITY = 5,
}

/**
 * Field group name — related fields collected together.
 * When the primary field of a group is next, batched fields are included.
 */
export type FieldGroupName = "dates";

/** Single field definition in a workflow schema */
export type WorkflowFieldDefinition = {
  name: string;
  type: WorkflowFieldType;
  label: string;
  required: boolean;
  optionsFrom?: OptionsFromTool;
  /** Field names that must be collected first (e.g. site depends on client) */
  dependsOn?: string[];
  /** When optionsFrom is list_business_contacts: filter by role (e.g. client dropdown = clients only) */
  roleFilter?: BusinessContactRoleFilter;
  /** Field group — related fields batched together (e.g. "dates" for startDate + endDate) */
  group?: FieldGroupName;
  /** Whether this is a descriptive/long-text field (AI generation offered in Phase 6) */
  descriptive?: boolean;
  /** For type "chips": static options (Client, Supplier, Subcontractor, etc.) */
  chipOptions?: { value: string; label: string }[];
  /** For type "chips": allow multiple selection (default false) */
  multiSelect?: boolean;
};

/** Choice gate option — action button with value, label, and next step */
export type ChoiceGateOption = {
  value: string;
  label: string;
  /** Next step id when selected (e.g. "collect_name", "done") */
  nextStep: string;
  /** Optional redirect message when selected (e.g. form path) */
  redirectMessage?: string;
};

/** Choice gate step definition — schema-driven action buttons */
export type ChoiceGateStepDefinition = {
  message: string;
  title?: string;
  instruction?: string;
  options: ChoiceGateOption[];
};

/** Workflow schema — required and optional fields */
export type WorkflowSchema = {
  workflow: string;
  requiredFields: WorkflowFieldDefinition[];
  optionalFields: WorkflowFieldDefinition[];
};

/** Workflow definition — extends schema with entry step and choice gate */
export type WorkflowDefinition = WorkflowSchema & {
  /** Intent key for classifier mapping (e.g. "create_project") */
  intent: string;
  /** First step id when no workflow state (e.g. "choice_gate") */
  entryStep: string;
  /** Optional choice gate shown at entry */
  choiceGate?: ChoiceGateStepDefinition;
};
