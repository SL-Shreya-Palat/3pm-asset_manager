/**
 * Buddy AI — Schema-derived workflow progress
 *
 * Computes progress 0–100 from workflow definition and current state.
 * No hardcoded step names — derives from requiredFields, optionalFields, choiceGate.
 *
 * @see BUDDY_AGENT_UI_PLAN.md
 */

import type { WorkflowDefinition } from "../workflows/types";

type ProgressContext = {
  pendingOptionalFields?: string[];
  skippedFields?: string[];
};

/**
 * Compute workflow progress from schema and state.
 * Returns undefined when done or when progress is not applicable.
 */
export function computeWorkflowProgress(
  workflowDef: WorkflowDefinition,
  currentStep: string,
  collectedData: Record<string, unknown>,
  context?: ProgressContext
): number | undefined {
  if (currentStep === "done") return undefined;

  const { requiredFields, optionalFields, choiceGate } = workflowDef;
  const totalMilestones = 6;
  let completed = 0;

  // 1. Choice gate done
  if (choiceGate && currentStep !== "choice_gate") {
    completed += 1;
  }

  // 2. Required fields (one per field)
  const requiredCollected = requiredFields.filter(
    (f) =>
      collectedData[f.name] != null &&
      String(collectedData[f.name]).trim() !== ""
  ).length;
  completed += requiredCollected;

  // 3. Optional phase done
  const inOptionalPhase =
    currentStep === "optional_selector" || currentStep.startsWith("optional_");
  const pastOptionalPhase =
    currentStep === "confirm_button" ||
    currentStep === "confirmation" ||
    currentStep === "edit_selector" ||
    currentStep.startsWith("edit_");
  if (pastOptionalPhase) {
    completed += 1;
  } else if (inOptionalPhase) {
    const pending = context?.pendingOptionalFields ?? [];
    if (pending.length === 0) {
      completed += 1;
    } else {
      const optionalCollected = pending.filter(
        (f) =>
          collectedData[f] != null && String(collectedData[f]).trim() !== ""
      ).length;
      completed += optionalCollected >= pending.length ? 1 : 0.5;
    }
  }

  // 4. Confirm button reached
  if (currentStep === "confirm_button" || currentStep === "confirmation") {
    completed += 1;
  }

  // 5. At confirmation step
  if (currentStep === "confirmation") {
    completed += 0.5;
  }

  return Math.min(100, Math.round((completed / totalMilestones) * 100));
}
