/**
 * Buddy AI — Workflow registry
 *
 * Central registry of workflow definitions. Orchestrator routes by intent.
 * Add new workflows by extending WORKFLOW_REGISTRY.
 *
 * @see BUDDY_AGENT_UI_PLAN.md § 5.1 Orchestrator & Intent Classifier
 */

import type { WorkflowDefinition } from "./types";
import { CREATE_PROJECT_SCHEMA } from "./create-project-schema";
import { UPDATE_PROJECT_SCHEMA } from "./update-project-schema";
import { CREATE_BUSINESS_CONTACT_SCHEMA } from "./create-business-contact-schema";
import { UPDATE_BUSINESS_CONTACT_SCHEMA } from "./update-business-contact-schema";

const FORM_REDIRECT_MESSAGE_PROJECT =
  "You can create a new project by going to [Projects](/projects) and clicking the **Create** button.";

const FORM_REDIRECT_MESSAGE_CONTACT =
  "You can create a new contact by going to [Contacts](/business-contacts) and clicking the **Create** button.";

export const WORKFLOW_REGISTRY: Record<string, WorkflowDefinition> = {
  create_project: {
    ...CREATE_PROJECT_SCHEMA,
    intent: "create_project",
    entryStep: "choice_gate",
    choiceGate: {
      message: "I'd love to help you create a project. How would you like to proceed?",
      title: "Create Project",
      instruction: "Choose how you'd like to proceed",
      options: [
        {
          value: "chat",
          label: "Chat with AI",
          nextStep: "collect_name",
        },
        {
          value: "form",
          label: "Fill Form Manually",
          nextStep: "done",
          redirectMessage: FORM_REDIRECT_MESSAGE_PROJECT,
        },
      ],
    },
  },
  update_project: {
    ...UPDATE_PROJECT_SCHEMA,
    intent: "update_project",
    entryStep: "collect_projectId",
  },
  create_business_contact: {
    ...CREATE_BUSINESS_CONTACT_SCHEMA,
    intent: "create_business_contact",
    entryStep: "choice_gate",
    choiceGate: {
      message: "I'd love to help you create a contact. How would you like to proceed?",
      title: "Create Contact",
      instruction: "Choose how you'd like to proceed",
      options: [
        { value: "chat", label: "Chat with AI", nextStep: "collect_name" },
        {
          value: "form",
          label: "Fill Form Manually",
          nextStep: "done",
          redirectMessage: FORM_REDIRECT_MESSAGE_CONTACT,
        },
      ],
    },
  },
  update_business_contact: {
    ...UPDATE_BUSINESS_CONTACT_SCHEMA,
    intent: "update_business_contact",
    entryStep: "collect_contactId",
  },
};

/** Get workflow definition by intent */
export function getWorkflowByIntent(intent: string): WorkflowDefinition | null {
  return WORKFLOW_REGISTRY[intent] ?? null;
}
