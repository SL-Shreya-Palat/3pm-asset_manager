/**
 * Buddy AI — State Machine
 *
 * Explicit state transitions with validation. Every state change
 * should go through this module for safety.
 *
 * Wraps the existing currentStep system: the state machine operates
 * at a higher level (WorkflowStatus) while currentStep remains the
 * detailed step indicator within each status.
 *
 * State Diagram:
 *
 *   IDLE ──────────► CHOICE_GATE ──────► COLLECTING ──────► REVIEWING ──────► EXECUTING
 *     │                  │                    │                  │                 │
 *     │              (manual)                 │              (edit back)        success
 *     │                  │                    │                  │                 │
 *     │                  ▼                    │                  ▼                 ▼
 *     │                IDLE                   │             COLLECTING           IDLE
 *     │                                       │                                   │
 *     ├──(express)──► COLLECTING              │                               failure
 *     │                                       │                                   │
 *     ├──(express)──► REVIEWING               │                                   ▼
 *     │                                       │                              COLLECTING
 *     │                                       │
 *   Any state ──── cancel/stop/reset ────► IDLE
 *
 * @see BUDDY_AI_V3_UPGRADE_PLAN.md Phase 1
 */

import type { WorkflowStateType } from "../types";

export type WorkflowStatus = "idle" | "choice_gate" | "collecting" | "reviewing" | "executing";

const STATUS_TO_STATE_TYPE: Record<WorkflowStatus, WorkflowStateType> = {
  idle: "IDLE",
  choice_gate: "CHOICE_GATE",
  collecting: "COLLECTING",
  reviewing: "REVIEWING",
  executing: "EXECUTING",
};

/**
 * Valid transitions: from → [allowed next statuses].
 * Cancel (→ idle) is always allowed and handled separately by resetToIdle.
 */
const VALID_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  idle: ["choice_gate", "collecting", "reviewing"],
  choice_gate: ["collecting", "idle"],
  collecting: ["reviewing", "collecting", "idle"],
  reviewing: ["executing", "collecting", "reviewing", "idle"],
  executing: ["idle", "collecting"],
};

const MAX_RETRY_COUNT = 2;

// ============================================
// Status Derivation (from existing currentStep)
// ============================================

/**
 * Derive WorkflowStatus from a currentStep string.
 * Bridge between the existing step-based system and the new state machine.
 */
export function deriveStatusFromStep(currentStep: string): WorkflowStatus {
  if (currentStep === "done") return "idle";
  if (currentStep === "choice_gate") return "choice_gate";
  if (
    currentStep.startsWith("collect_") ||
    currentStep === "optional_selector" ||
    currentStep.startsWith("optional_")
  ) {
    return "collecting";
  }
  if (
    currentStep === "confirm_button" ||
    currentStep === "confirmation" ||
    currentStep === "edit_selector" ||
    currentStep.startsWith("edit_")
  ) {
    return "reviewing";
  }
  return "collecting";
}

/**
 * Convert WorkflowStatus to the existing WorkflowStateType (for backward compat).
 */
export function statusToStateType(status: WorkflowStatus): WorkflowStateType {
  return STATUS_TO_STATE_TYPE[status];
}

/**
 * Derive WorkflowStateType from a currentStep (backward-compatible wrapper).
 * Drop-in replacement for the old getStateFromStep().
 */
export function getStateFromStep(currentStep: string): WorkflowStateType {
  return statusToStateType(deriveStatusFromStep(currentStep));
}

// ============================================
// Transition Validation
// ============================================

/**
 * Check if a transition from one status to another is valid.
 */
export function isValidTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Assert that a transition is valid; logs a warning if not.
 * Does NOT throw — we don't want to break production flows.
 * Once the state machine is proven stable, this can be upgraded to throw.
 */
export function assertValidTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  if (!isValidTransition(from, to)) {
    console.warn(
      `[Buddy AI State Machine] Invalid transition: "${from}" → "${to}". ` +
        `Allowed from "${from}": [${(VALID_TRANSITIONS[from] ?? []).join(", ")}]`
    );
    return false;
  }
  return true;
}

// ============================================
// Transition Functions
// ============================================

/**
 * Validate a step change and return the formal state.
 * Call this before setting currentStep in the orchestrator.
 *
 * @param currentStep - The current step BEFORE the change
 * @param nextStep - The step we're transitioning TO
 * @returns The WorkflowStateType for the next step
 */
export function validateStepTransition(
  currentStep: string,
  nextStep: string
): WorkflowStateType {
  const fromStatus = deriveStatusFromStep(currentStep);
  const toStatus = deriveStatusFromStep(nextStep);

  if (fromStatus !== toStatus) {
    assertValidTransition(fromStatus, toStatus);
  }

  return statusToStateType(toStatus);
}

/**
 * Reset to idle. Used for cancel, stop, reset commands.
 * Always valid from any state.
 *
 * @returns Clean workflow response data for cancellation
 */
export function resetToIdle(
  workflowKey: string,
  reason: string = "cancelled"
): {
  message: string;
  collectedData: Record<string, unknown>;
  nextStep: string;
  state: WorkflowStateType;
} {
  const messages: Record<string, string> = {
    cancelled: "Workflow cancelled.",
    user_cancelled: "No problem, I've cancelled the workflow. What would you like to do instead?",
    user_reset: "All clear! How can I help you?",
    no_active_task: "No active workflow. How can I help you?",
    schema_not_found: "Something went wrong. Let's start fresh.",
  };

  console.log(`[Buddy AI State Machine] Reset to idle: ${reason} (workflow: ${workflowKey})`);

  return {
    message: messages[reason] ?? "Workflow cancelled.",
    collectedData: {},
    nextStep: "done",
    state: "IDLE",
  };
}

/**
 * Check if express path to COLLECTING is valid from the current step.
 * Express = skip choice gate, go directly to field collection.
 */
export function canExpressToCollecting(currentStep: string): boolean {
  const from = deriveStatusFromStep(currentStep);
  return isValidTransition(from, "collecting");
}

/**
 * Check if express path to REVIEWING is valid from the current step.
 * Express = skip choice gate AND collection, go directly to confirmation.
 */
export function canExpressToReviewing(currentStep: string): boolean {
  const from = deriveStatusFromStep(currentStep);
  return isValidTransition(from, "reviewing");
}

/**
 * Check if we can transition to EXECUTING from the current step.
 */
export function canExecute(currentStep: string): boolean {
  const from = deriveStatusFromStep(currentStep);
  return isValidTransition(from, "executing");
}

/**
 * Determine retry state after execution failure.
 * Returns "collecting" if retries remain, "idle" if max exceeded.
 */
export function getRetryStatus(retryCount: number): {
  status: WorkflowStatus;
  exceeded: boolean;
} {
  if (retryCount >= MAX_RETRY_COUNT) {
    return { status: "idle", exceeded: true };
  }
  return { status: "collecting", exceeded: false };
}
