/**
 * Buddy AI — Generic creation workflow orchestrator
 *
 * One orchestrator for all creation flows. Schema-driven, AI-first interpretation.
 * No manual matching, no regex.
 *
 * @see BUDDY_AI_GENERIC_WORKFLOW_PLAN.md Step 4
 */

import type { BuddyAIContext } from "../utils/rbac";
import { chargeAiCredits } from "@/lib/ai-credits/guard";
import type {
  StructuredResponse,
  StructuredInput,
  UISchema,
  UISchemaFieldCollection,
  UISchemaConfirmation,
  UISchemaChoiceGate,
} from "../types";
import type { WorkflowState } from "../db/threads";
import type { ConsultantDelegateResponse } from "../handlers/types";
import type { CreateWorkflowConfig } from "./generic-types";
import {
  getOptionsForField,
  buildResolvedSummary,
  resolveValueToDisplay,
} from "../utils/resolve-id-to-label";
import { computeWorkflowProgress } from "../utils/compute-workflow-progress";
import { getStateFromStep, validateStepTransition, deriveStatusFromStep } from "../state-machine";
import { routeWithLLM, type RoutingResult } from "../utils/llm-routing";
import { interpretStepInput } from "../utils/llm-step-interpreter";
import { analyzeFieldInput } from "../utils/llm-field-analyzer";
import { getLastProjectForContextLookup, resolveContextLookup } from "../utils/context-lookup";
import {
  areDependenciesSatisfied,
  isFieldEmpty,
  getFieldByName as feGetFieldByName,
  getRemainingOptionalFields,
  renderFieldCollectionUI,
  renderEmptyOptionsUI,
  renderOptionalSelectorUI,
  renderConfirmButtonUI,
  renderEditSelectorUI,
  resolveExtractedFields,
  normalizeExtractedFields,
  canExpressToReview,
} from "../field-engine";

export type OrchestrateGenericInput = {
  context: BuddyAIContext;
  message: string;
  structuredInput: StructuredInput | null;
  workflowState: WorkflowState | null;
  threadId: string;
  routingResult?: RoutingResult | null;
  abortSignal?: AbortSignal;
};

const MAX_RETRY_COUNT = 2;

/**
 * Run one step of a generic creation workflow.
 */
export async function orchestrateGenericCreate(
  config: CreateWorkflowConfig,
  input: OrchestrateGenericInput
): Promise<StructuredResponse | ConsultantDelegateResponse> {
  const { context, message, structuredInput, workflowState, routingResult, abortSignal } = input;
  const { definition, createTool, validate, entityResolvers, emptyOptionsMeta, successMessage, confirmationLabels } =
    config;

  const schema = definition;
  const requiredFields = schema.requiredFields;
  const optionalFields = schema.optionalFields;
  const allFields = [...requiredFields, ...optionalFields];
  const choiceGate = schema.choiceGate;

  let collectedData: Record<string, unknown> = workflowState?.collectedData ?? {};
  let currentStep = workflowState?.currentStep ?? schema.entryStep;
  let pendingOptionalFields: string[] = (workflowState as { pendingOptionalFields?: string[] } | undefined)
    ?.pendingOptionalFields ?? [];
  let skippedFields: string[] = (workflowState as { skippedFields?: string[] } | undefined)?.skippedFields ?? [];
  let stepHistory: string[] = (workflowState as { stepHistory?: string[] } | undefined)?.stepHistory ?? [];
  let createRetryCount: number =
    (workflowState as { createRetryCount?: number } | undefined)?.createRetryCount ?? 0;
  let prefillData: Record<string, unknown> | undefined =
    (workflowState as { prefillData?: Record<string, unknown> } | undefined)?.prefillData;

  const mergeValue = (field: string, value: unknown) => {
    collectedData = { ...collectedData, [field]: value };
  };

  const getNextRequiredField = () =>
    requiredFields.find((f) => isFieldEmpty(collectedData[f.name])) ?? null;

  const getFieldByName = (name: string) => feGetFieldByName(schema, name);

  const workflowKey = config.intent;

  // --- Cancel ---
  if (structuredInput?.field === "_cancel" && structuredInput?.value === "cancel") {
    return {
      message: "Workflow cancelled.",
      uiSchema: null,
      collectedData: {},
      workflow: workflowKey,
      nextStep: "done",
    };
  }

  const isResume = structuredInput?.field === "_resume" && structuredInput?.value === "resume";
  const isBack = structuredInput?.field === "_back" && structuredInput?.value === "back";

  if (isBack && stepHistory.length > 0) {
    currentStep = stepHistory[stepHistory.length - 1];
    stepHistory = stepHistory.slice(0, -1);
  }

  const entryStep = currentStep;
  let validationError: string | null = null;
  let lookupConfirmation: string | null = null;

  const buildResponse = (
    msg: string,
    uiSchema: UISchema | null,
    nextStep: string,
    extra?: { createRetryCount?: number; prefillData?: Record<string, unknown> }
  ): StructuredResponse => {
    const progress =
      nextStep !== "done"
        ? computeWorkflowProgress(definition, currentStep, collectedData, {
            pendingOptionalFields,
            skippedFields,
          })
        : undefined;
    const state = nextStep !== "done" ? validateStepTransition(entryStep, nextStep) : undefined;
    const showCancel = nextStep !== "done";
    const showBack = nextStep !== "done" && nextStep !== "choice_gate" && stepHistory.length > 0;
    const finalMsg = lookupConfirmation ? `${lookupConfirmation}\n\n${msg}` : msg;
    lookupConfirmation = null;
    return {
      message: finalMsg,
      uiSchema,
      collectedData,
      workflow: workflowKey,
      nextStep,
      state,
      showCancel,
      showBack: showBack || undefined,
      pendingOptionalFields: pendingOptionalFields.length > 0 ? pendingOptionalFields : undefined,
      skippedFields: skippedFields.length > 0 ? skippedFields : undefined,
      progress,
      stepHistory: stepHistory.length > 0 ? stepHistory : undefined,
      ...(extra?.createRetryCount !== undefined && { createRetryCount: extra.createRetryCount }),
      ...(extra?.prefillData !== undefined && { prefillData: extra.prefillData }),
    };
  };

  // --- Routing ---
  let routing: RoutingResult | null = routingResult ?? null;
  if (message.trim() && !structuredInput && !routing) {
    routing = await routeWithLLM(
      context,
      message,
      { currentStep, workflow: workflowKey, collectedData },
      abortSignal
    );
  }
  if (routing && !workflowState && routing.userIntent !== "cancel") {
    routing = { ...routing, userIntent: "none" };
  }
  if (routing?.userIntent === "cancel") {
    return {
      message: "Workflow cancelled.",
      uiSchema: null,
      collectedData: {},
      workflow: workflowKey,
      nextStep: "done",
    };
  }

  // --- Structured input (chip/dropdown clicks) ---
  if (structuredInput && !isResume && !isBack) {
    const { field, value } = structuredInput;
    if (currentStep === "choice_gate" && choiceGate) {
      const optValue = typeof value === "string" ? value : Array.isArray(value) ? value[0] : "";
      const option = choiceGate.options.find((o) => o.value === optValue || field === `_${o.value}`);
      if (option) {
        if (option.redirectMessage) {
          return {
            message: option.redirectMessage,
            uiSchema: null,
            collectedData: {},
            workflow: workflowKey,
            nextStep: option.nextStep,
          };
        }
        if (option.value === "chat" && prefillData && Object.keys(prefillData).length > 0) {
          const resolveResult = await resolveExtractedFields(
            context,
            prefillData,
            [...requiredFields, ...optionalFields],
            entityResolvers ?? {},
            collectedData
          );
          collectedData = resolveResult.collectedData;

          if (resolveResult.status === "ambiguous") {
            prefillData = undefined;
            return buildResponse(
              "Which one did you mean?",
              {
                type: "field_collection",
                field: {
                  name: resolveResult.field.name,
                  label: resolveResult.field.label,
                  type: "dropdown",
                  options: resolveResult.matches,
                  required: resolveResult.field.required ?? true,
                },
              } as UISchemaFieldCollection,
              `collect_${resolveResult.field.name}`
            );
          }
          if (resolveResult.status === "not_found") {
            validationError = `No matching ${resolveResult.field.label.toLowerCase()}. Try a different name or select from the list.`;
            prefillData = undefined;
            currentStep = `collect_${resolveResult.field.name}`;
          } else {
            prefillData = undefined;
            const nextRequired = getNextRequiredField();
            currentStep = nextRequired ? `collect_${nextRequired.name}` : "confirmation";
          }
        } else {
          currentStep = option.nextStep;
        }
      }
    } else if (
      !["_yes", "_no", "_edit", "_confirm"].includes(field) &&
      currentStep.startsWith("collect_")
    ) {
      mergeValue(field, value);
      const nextRequired = getNextRequiredField();
      currentStep = nextRequired ? `collect_${nextRequired.name}` : "optional_selector";
    } else if (
      !["_yes", "_no", "_edit", "_confirm"].includes(field) &&
      currentStep === "optional_selector"
    ) {
      if (field === "_skip" || field === "_done" || field === "_confirm") {
        const availableOptional = optionalFields
          .filter((f) => areDependenciesSatisfied(f.name, allFields, collectedData))
          .map((f) => f.name);
        skippedFields = availableOptional.filter((n) => !pendingOptionalFields.includes(n));
        currentStep = "confirm_button";
      } else {
        pendingOptionalFields = [...new Set([...pendingOptionalFields, field])];
        const nextPending = pendingOptionalFields.find(
          (f) =>
            areDependenciesSatisfied(f, allFields, collectedData) &&
            isFieldEmpty(collectedData[f])
        );
        currentStep = nextPending ? `optional_${nextPending}` : "confirm_button";
      }
    } else if (
      !["_yes", "_no", "_edit", "_confirm"].includes(field) &&
      currentStep.startsWith("optional_")
    ) {
      if (field === "_skip" || field === "_confirm") {
        const fieldName = currentStep.replace("optional_", "");
        pendingOptionalFields = pendingOptionalFields.filter((f) => f !== fieldName);
        skippedFields = [...new Set([...skippedFields, fieldName])];
        const nextPending = pendingOptionalFields.find(
          (f) => isFieldEmpty(collectedData[f])
        );
        currentStep = nextPending ? `optional_${nextPending}` : "confirm_button";
      } else {
        mergeValue(field, value);
        const nextPending = pendingOptionalFields.find(
          (f) => isFieldEmpty(collectedData[f])
        );
        currentStep = nextPending ? `optional_${nextPending}` : "confirm_button";
      }
    } else if (
      !["_yes", "_no", "_edit", "_confirm"].includes(field) &&
      currentStep === "edit_selector"
    ) {
      if (field === "_add_more" || field === "add_more_optionals") {
        currentStep = "optional_selector";
      } else {
        currentStep = `edit_${field}`;
      }
    } else if (currentStep.startsWith("edit_")) {
      mergeValue(field, value);
      currentStep = "confirmation";
      createRetryCount = 0; // Reset retry count when user edits and returns to confirmation
    }
  }
  // --- Free text: use LLM step interpreter ---
  else if (message.trim()) {
    const userIntent = routing?.userIntent;

    // Resume: re-display current step, do not process message as field input
    if (!isResume) {
    // Express path: extracted fields from routing
    const extracted = normalizeExtractedFields(
      routing?.extractedFields
    );
    if (currentStep === "choice_gate" && choiceGate && extracted && Object.keys(extracted).length > 0) {
      if (!canExpressToReview(extracted, requiredFields)) {
        prefillData = extracted;
        currentStep = "choice_gate";
      } else {
        const resolveResult = await resolveExtractedFields(
          context,
          extracted,
          [...requiredFields, ...optionalFields],
          entityResolvers ?? {},
          collectedData
        );
        collectedData = resolveResult.collectedData;

        if (resolveResult.status === "ambiguous") {
          return buildResponse(
            "Which one did you mean?",
            {
              type: "field_collection",
              field: {
                name: resolveResult.field.name,
                label: resolveResult.field.label,
                type: "dropdown",
                options: resolveResult.matches,
                required: resolveResult.field.required ?? true,
              },
            } as UISchemaFieldCollection,
            `collect_${resolveResult.field.name}`,
            { createRetryCount }
          );
        }
        if (resolveResult.status === "not_found") {
          validationError = `No matching ${resolveResult.field.label.toLowerCase()}. Try a different name or select from the list.`;
          currentStep = `collect_${resolveResult.field.name}`;
        } else {
          const nextRequired = getNextRequiredField();
          currentStep = nextRequired ? `collect_${nextRequired.name}` : "confirmation";
        }
      }
    } else if (
      currentStep === "choice_gate" &&
      choiceGate &&
      (userIntent === "chat" || userIntent === "form") &&
      workflowState?.currentStep === "choice_gate" &&
      !(prefillData && Object.keys(prefillData).length > 0)
    ) {
      const option = choiceGate.options.find((o) => o.value === userIntent);
      if (option) {
        if (option.redirectMessage) {
          return {
            message: option.redirectMessage,
            uiSchema: null,
            collectedData: {},
            workflow: workflowKey,
            nextStep: option.nextStep,
          };
        }
        currentStep = option.nextStep;
      }
    } else if (currentStep === "optional_selector" && (userIntent === "skip" || userIntent === "confirm")) {
      currentStep = "confirm_button";
    } else if (currentStep.startsWith("collect_") || currentStep.startsWith("optional_") || currentStep.startsWith("edit_")) {
      const fieldName = currentStep.replace(/^(collect_|optional_|edit_)/, "");
      const field = getFieldByName(fieldName);
      if (field) {
        const fieldAction = await analyzeFieldInput(
          context,
          {
            workflow: workflowKey,
            currentStep,
            field,
            userMessage: message.trim(),
            allFieldNames: allFields.map((f) => f.name),
            isOptionalPhase: currentStep.startsWith("optional_"),
          },
          abortSignal
        );

        if (fieldAction.type === "cancel") {
          return {
            message: "Workflow cancelled.",
            uiSchema: null,
            collectedData: {},
            workflow: workflowKey,
            nextStep: "done",
          };
        }

        if (fieldAction.type === "skip" && currentStep.startsWith("optional_")) {
          pendingOptionalFields = pendingOptionalFields.filter((f) => f !== fieldName);
          skippedFields = [...new Set([...skippedFields, fieldName])];
          const nextPending = pendingOptionalFields.find(
            (f) => isFieldEmpty(collectedData[f]) && f !== fieldName
          );
          currentStep = nextPending ? `optional_${nextPending}` : "confirm_button";
        } else if (fieldAction.type === "skip_all" && currentStep.startsWith("optional_")) {
          const remainingOptional = optionalFields
            .filter((f) => areDependenciesSatisfied(f.name, allFields, collectedData))
            .filter((f) => isFieldEmpty(collectedData[f.name]));
          for (const f of remainingOptional) {
            skippedFields = [...new Set([...skippedFields, f.name])];
            pendingOptionalFields = pendingOptionalFields.filter((n) => n !== f.name);
          }
          currentStep = "confirm_button";
          validationError = null;
        } else if (fieldAction.type === "correction") {
          const corrField = getFieldByName(fieldAction.fieldName);
          if (corrField && allFields.some((f) => f.name === fieldAction.fieldName)) {
            let resolvedValue: unknown = fieldAction.value;
            if (entityResolvers?.[fieldAction.fieldName]) {
              const resolved = await entityResolvers[fieldAction.fieldName](
                context,
                String(fieldAction.value),
                collectedData
              );
              if (resolved && "id" in resolved) {
                resolvedValue = resolved.id;
              } else if (resolved && "status" in resolved && resolved.status === "ambiguous") {
                const corrStep =
                  corrField.required ?? true
                    ? `collect_${fieldAction.fieldName}`
                    : `optional_${fieldAction.fieldName}`;
                return buildResponse(
                  "Which one did you mean?",
                  {
                    type: "field_collection",
                    field: {
                      name: fieldAction.fieldName,
                      label: corrField.label,
                      type: "dropdown",
                      options: resolved.matches,
                      required: corrField.required ?? true,
                    },
                  } as UISchemaFieldCollection,
                  corrStep,
                  { createRetryCount }
                );
              } else {
                validationError = `No matching ${corrField.label.toLowerCase()}. Try a different name or select from the list.`;
                currentStep =
                  corrField.required ?? true
                    ? `collect_${fieldAction.fieldName}`
                    : `optional_${fieldAction.fieldName}`;
                resolvedValue = null;
              }
            }
            if (resolvedValue != null) {
              mergeValue(fieldAction.fieldName, resolvedValue);
              const corrStep =
                corrField.required ?? true
                  ? `collect_${fieldAction.fieldName}`
                  : `optional_${fieldAction.fieldName}`;
              const currentOrder = allFields.map((f) => f.name);
              const corrIdx = currentOrder.indexOf(fieldAction.fieldName);
              const currIdx = currentOrder.indexOf(fieldName);
              if (corrIdx < currIdx) {
                currentStep = corrStep;
              } else {
              if (currentStep.startsWith("collect_")) {
                const nextRequired = getNextRequiredField();
                currentStep = nextRequired ? `collect_${nextRequired.name}` : "optional_selector";
              } else if (currentStep.startsWith("optional_")) {
                const nextPending = pendingOptionalFields.find(
                  (f) => isFieldEmpty(collectedData[f]) && f !== fieldName
                );
                currentStep = nextPending ? `optional_${nextPending}` : "confirm_button";
              } else {
                currentStep = "confirmation";
                createRetryCount = 0;
              }
            }
            }
          } else {
            validationError = `Unknown field "${fieldAction.fieldName}". Please provide a value for ${field.label}.`;
          }
        } else if (fieldAction.type === "value" || fieldAction.type === "consultant_query") {
          if (fieldAction.type === "consultant_query") {
            return {
              type: "consultant_delegate",
              workflowState: {
                workflow: workflowKey,
                collectedData,
                currentStep,
                state: getStateFromStep(currentStep),
                status: deriveStatusFromStep(currentStep),
                pendingOptionalFields:
                  pendingOptionalFields.length > 0 ? pendingOptionalFields : undefined,
                skippedFields: skippedFields.length > 0 ? skippedFields : undefined,
                stepHistory: stepHistory.length > 0 ? stepHistory : undefined,
                createRetryCount: createRetryCount > 0 ? createRetryCount : undefined,
              },
            };
          } else if (userIntent !== "skip" && userIntent !== "confirm") {
            const options = field.optionsFrom
              ? await getOptionsForField(context, field, collectedData)
              : undefined;
            const todayIso = new Date().toISOString().slice(0, 10);
            const result = await interpretStepInput(
              context,
              {
                workflow: workflowKey,
                currentStep,
                field,
                options,
                collectedData,
                userMessage: message.trim(),
                todayIso,
              },
              abortSignal
            );
            if ("value" in result) {
              mergeValue(fieldName, result.value);
              const otherExtracted = fieldAction.type === "value" ? fieldAction.otherExtracted : undefined;
              let otherExtractedOk = true;
              if (otherExtracted && Object.keys(otherExtracted).length > 0) {
                const otherResult = await resolveExtractedFields(
                  context,
                  otherExtracted as Record<string, unknown>,
                  [...requiredFields, ...optionalFields],
                  entityResolvers ?? {},
                  collectedData
                );
                collectedData = otherResult.collectedData;

                if (otherResult.status === "ambiguous") {
                  const step =
                    otherResult.field.required ?? true
                      ? `collect_${otherResult.field.name}`
                      : `optional_${otherResult.field.name}`;
                  return buildResponse(
                    "Which one did you mean?",
                    {
                      type: "field_collection",
                      field: {
                        name: otherResult.field.name,
                        label: otherResult.field.label,
                        type: "dropdown",
                        options: otherResult.matches,
                        required: otherResult.field.required ?? true,
                      },
                    } as UISchemaFieldCollection,
                    step,
                    { createRetryCount }
                  );
                }
                if (otherResult.status === "not_found") {
                  validationError = `No matching ${otherResult.field.label.toLowerCase()}. Try a different name or select from the list.`;
                  currentStep =
                    otherResult.field.required ?? true
                      ? `collect_${otherResult.field.name}`
                      : `optional_${otherResult.field.name}`;
                  otherExtractedOk = false;
                }
              }
              if (otherExtractedOk) {
                validationError = null;
                if (currentStep.startsWith("collect_")) {
                  const nextRequired = getNextRequiredField();
                  currentStep = nextRequired ? `collect_${nextRequired.name}` : "optional_selector";
                } else if (currentStep.startsWith("optional_")) {
                  const nextPending = pendingOptionalFields.find(
                    (f) => isFieldEmpty(collectedData[f]) && f !== fieldName
                  );
                  currentStep = nextPending ? `optional_${nextPending}` : "confirm_button";
                } else {
                  currentStep = "confirmation";
                  createRetryCount = 0;
                }
              }
            } else {
              validationError = result.error;
            }
          } else {
            if (currentStep.startsWith("optional_")) {
              pendingOptionalFields = pendingOptionalFields.filter((f) => f !== fieldName);
              skippedFields = [...new Set([...skippedFields, fieldName])];
            }
            const nextPending = pendingOptionalFields.find(
              (f) => isFieldEmpty(collectedData[f]) && f !== fieldName
            );
            currentStep = nextPending ? `optional_${nextPending}` : "confirm_button";
          }
        } else if (fieldAction.type === "context_lookup") {
          const lastProject = await getLastProjectForContextLookup(context);
          if (lastProject) {
            const lookupResult = await resolveContextLookup({
              currentFieldName: fieldName,
              userMessage: message.trim(),
              lastProject,
              allFields,
              collectedData,
              context,
            });
            if (lookupResult.success) {
              for (const [fn, val] of Object.entries(lookupResult.appliedFields)) {
                mergeValue(fn, val);
              }
              lookupConfirmation = lookupResult.message;
              const nextRequired = getNextRequiredField();
              currentStep = nextRequired ? `collect_${nextRequired.name}` : "optional_selector";
              validationError = null;
            } else {
              validationError = lookupResult.error;
            }
          } else {
            validationError = "No previous project found to copy from. Please enter a value.";
          }
        } else if (userIntent === "skip" || userIntent === "confirm") {
          if (currentStep.startsWith("optional_")) {
            pendingOptionalFields = pendingOptionalFields.filter((f) => f !== fieldName);
            skippedFields = [...new Set([...skippedFields, fieldName])];
          }
          const nextPending = pendingOptionalFields.find(
            (f) => isFieldEmpty(collectedData[f])
          );
          currentStep = nextPending ? `optional_${nextPending}` : "confirm_button";
        }
      }
    }
    }
  }

  // --- Confirm button / Yes / No / Edit ---
  if (
    message === "[Confirm]" ||
    (structuredInput?.field === "_confirm" && structuredInput?.value === "confirm") ||
    (currentStep === "confirm_button" && routing?.userIntent === "confirm")
  ) {
    currentStep = "confirmation";
  }

  if (
    message === "[Yes]" ||
    (structuredInput?.field === "_yes" && structuredInput?.value === "yes") ||
    routing?.userIntent === "yes"
  ) {
    const preCreateErrors = validate ? validate(collectedData) : [];
    if (preCreateErrors.length > 0) {
      const summary = await buildResolvedSummary(context, allFields, collectedData);
      const progress = computeWorkflowProgress(definition, "confirmation", collectedData, {
        pendingOptionalFields,
        skippedFields,
      });
      return {
        message: `Please fix the following before creating:\n\n${preCreateErrors.map((e) => `- ${e}`).join("\n")}`,
        uiSchema: {
          type: "confirmation",
          message: "Please review the details below and confirm.",
          summary,
          yesLabel: confirmationLabels?.yesLabel ?? "Confirm",
          noLabel: confirmationLabels?.noLabel ?? "Don't create",
          editLabel: confirmationLabels?.editLabel ?? "Edit Details",
        } as UISchemaConfirmation,
        collectedData,
        workflow: workflowKey,
        nextStep: "confirmation",
        state: "REVIEWING",
        showCancel: true,
        pendingOptionalFields: pendingOptionalFields.length > 0 ? pendingOptionalFields : undefined,
        skippedFields: skippedFields.length > 0 ? skippedFields : undefined,
        progress,
      };
    }
    // The create is an AI-performed ACTION — charge 1 credit before executing.
    // Chatting/field-collection up to this point was free.
    const actionCharge = await chargeAiCredits(context.userId, context.tenantId, {
      feature: `workflow:${workflowKey}`,
    });
    if (!actionCharge.ok) {
      const summary = await buildResolvedSummary(context, allFields, collectedData);
      const progress = computeWorkflowProgress(definition, "confirmation", collectedData, {
        pendingOptionalFields,
        skippedFields,
      });
      return {
        message: actionCharge.error,
        uiSchema: {
          type: "confirmation",
          message: "Please review the details below and confirm.",
          summary,
          yesLabel: confirmationLabels?.yesLabel ?? "Confirm",
          noLabel: confirmationLabels?.noLabel ?? "Don't create",
          editLabel: confirmationLabels?.editLabel ?? "Edit Details",
        } as UISchemaConfirmation,
        collectedData,
        workflow: workflowKey,
        nextStep: "confirmation",
        state: "REVIEWING",
        showCancel: true,
        pendingOptionalFields: pendingOptionalFields.length > 0 ? pendingOptionalFields : undefined,
        skippedFields: skippedFields.length > 0 ? skippedFields : undefined,
        progress,
        creditsExhausted: true,
      };
    }
    let result;
    try {
      result = await createTool(context, collectedData);
    } catch (err) {
      // The create never happened — give the credit back before rethrowing.
      await actionCharge.refund();
      throw err;
    }
    if (result.success && result.id) {
      const msg = successMessage ? successMessage({ id: result.id }) : "Created successfully.";
      return {
        message: msg,
        uiSchema: null,
        collectedData: {},
        workflow: workflowKey,
        nextStep: "done",
      };
    }
    // Create failed — refund so a retry doesn't double-charge.
    await actionCharge.refund();
    const newRetryCount = createRetryCount + 1;
    const summary = await buildResolvedSummary(context, allFields, collectedData);
    const progress = computeWorkflowProgress(definition, "confirmation", collectedData, {
      pendingOptionalFields,
      skippedFields,
    });
    const failureMessage =
      newRetryCount >= MAX_RETRY_COUNT
        ? "Creation failed. You can try again (Edit to fix) or cancel."
        : result.error ?? "Failed to create.";
    return {
      message: failureMessage,
      uiSchema: {
        type: "confirmation",
        message:
          newRetryCount >= MAX_RETRY_COUNT
            ? "Create failed. Edit details to fix, or cancel."
            : "Please review the details below and confirm.",
        summary,
        yesLabel: confirmationLabels?.yesLabel ?? "Confirm",
        noLabel: confirmationLabels?.noLabel ?? "Don't create",
        editLabel: confirmationLabels?.editLabel ?? "Edit Details",
      } as UISchemaConfirmation,
      collectedData,
      workflow: workflowKey,
      nextStep: "confirmation",
      state: "REVIEWING",
      showCancel: true,
      pendingOptionalFields: pendingOptionalFields.length > 0 ? pendingOptionalFields : undefined,
      skippedFields: skippedFields.length > 0 ? skippedFields : undefined,
      progress,
      createRetryCount: newRetryCount,
    };
  }

  if (
    message === "[No]" ||
    (structuredInput?.field === "_no" && structuredInput?.value === "no") ||
    routing?.userIntent === "no"
  ) {
    return {
      message: "Creation cancelled.",
      uiSchema: null,
      collectedData: {},
      workflow: workflowKey,
      nextStep: "done",
    };
  }

  if (
    message === "[Edit]" ||
    (structuredInput?.field === "_edit" && structuredInput?.value === "edit") ||
    routing?.userIntent === "edit"
  ) {
    currentStep = "edit_selector";
  }

  if (currentStep !== entryStep && entryStep !== "choice_gate" && !isBack) {
    stepHistory = [...stepHistory, entryStep];
  }

  // --- Choice gate ---
  if (currentStep === "choice_gate" && choiceGate) {
    const prefillCount = prefillData && Object.keys(prefillData).length > 0 ? Object.keys(prefillData).length : 0;
    const gateMessage =
      prefillCount > 0
        ? `I've already gathered ${prefillCount} field${prefillCount === 1 ? "" : "s"} from your message. Choose how to proceed.`
        : choiceGate.message;
    return buildResponse(
      gateMessage,
      {
        type: "choice_gate",
        message: gateMessage,
        title: choiceGate.title,
        instruction: choiceGate.instruction,
        options: choiceGate.options.map((o) => ({ value: o.value, label: o.label })),
      } as UISchemaChoiceGate,
      "choice_gate",
      prefillData && Object.keys(prefillData).length > 0 ? { prefillData } : undefined
    );
  }

  // --- Collect required ---
  if (currentStep.startsWith("collect_")) {
    const fieldName = currentStep.replace("collect_", "");
    const field = getFieldByName(fieldName);
    if (!field) return buildResponse("Something went wrong.", null, "done");

    const options = field.optionsFrom ? await getOptionsForField(context, field, collectedData) : [];
    if (options.length === 0 && field.optionsFrom && emptyOptionsMeta?.[field.optionsFrom]) {
      const { message: eMsg, uiSchema: eUI } = renderEmptyOptionsUI(
        emptyOptionsMeta[field.optionsFrom],
        fieldName,
        field.required ?? true
      );
      return buildResponse(eMsg, eUI, currentStep);
    }

    const { message: fMsg, uiSchema: fUI } = renderFieldCollectionUI({
      field,
      options,
      validationError,
    });
    return buildResponse(fMsg, fUI, currentStep);
  }

  // --- Optional selector ---
  if (currentStep === "optional_selector") {
    const availableOptional = getRemainingOptionalFields(schema, collectedData, skippedFields, allFields);
    const { message: osMsg, uiSchema: osUI } = renderOptionalSelectorUI(
      availableOptional.map((f) => ({ name: f.name, label: f.label }))
    );
    return buildResponse(osMsg, osUI, "optional_selector");
  }

  // --- Optional field ---
  if (currentStep.startsWith("optional_")) {
    const fieldName = currentStep.replace("optional_", "");
    const field = getFieldByName(fieldName);
    if (!field) return buildResponse("Something went wrong.", null, "confirm_button");

    const options = field.optionsFrom ? await getOptionsForField(context, field, collectedData) : [];
    if (options.length === 0 && field.optionsFrom && emptyOptionsMeta?.[field.optionsFrom]) {
      const { message: eMsg, uiSchema: eUI } = renderEmptyOptionsUI(
        emptyOptionsMeta[field.optionsFrom],
        fieldName,
        false
      );
      return buildResponse(eMsg, eUI, currentStep);
    }

    const { message: ofMsg, uiSchema: ofUI } = renderFieldCollectionUI({
      field,
      options,
      isOptional: true,
      validationError,
    });
    return buildResponse(ofMsg, ofUI, currentStep);
  }

  // --- Confirm button ---
  if (currentStep === "confirm_button") {
    const { message: cbMsg, uiSchema: cbUI } = renderConfirmButtonUI();
    return buildResponse(cbMsg, cbUI, "confirm_button");
  }

  // --- Confirmation ---
  if (currentStep === "confirmation") {
    const summary = await buildResolvedSummary(context, allFields, collectedData);
    return buildResponse(
      "Here's a summary of everything. Please review and confirm.",
      {
        type: "confirmation",
        message: "Please review the details below and confirm.",
        summary,
        yesLabel: confirmationLabels?.yesLabel ?? "Confirm",
        noLabel: confirmationLabels?.noLabel ?? "Don't create",
        editLabel: confirmationLabels?.editLabel ?? "Edit Details",
      } as UISchemaConfirmation,
      "confirmation",
      { createRetryCount }
    );
  }

  // --- Edit selector ---
  if (currentStep === "edit_selector") {
    const filledFields = allFields.filter((f) => !isFieldEmpty(collectedData[f.name]));
    const fieldsWithDisplay = await Promise.all(
      filledFields.map(async (f) => {
        const raw = collectedData[f.name];
        const displayValue =
          f.chipOptions || f.optionsFrom
            ? await resolveValueToDisplay(context, f, raw, collectedData)
            : String(raw ?? "");
        return { name: f.name, label: f.label, value: displayValue };
      })
    );
    const { message: esMsg, uiSchema: esUI } = renderEditSelectorUI(fieldsWithDisplay);
    return buildResponse(esMsg, esUI, "edit_selector");
  }

  // --- Edit field ---
  if (currentStep.startsWith("edit_")) {
    const fieldName = currentStep.replace("edit_", "");
    const field = getFieldByName(fieldName);
    if (!field) return buildResponse("Something went wrong.", null, "confirmation");

    const options = field.optionsFrom ? await getOptionsForField(context, field, collectedData) : [];
    if (options.length === 0 && field.optionsFrom && emptyOptionsMeta?.[field.optionsFrom]) {
      const { message: eMsg, uiSchema: eUI } = renderEmptyOptionsUI(
        emptyOptionsMeta[field.optionsFrom],
        fieldName,
        field.required ?? false
      );
      return buildResponse(eMsg, eUI, currentStep);
    }

    const { message: edMsg, uiSchema: edUI } = renderFieldCollectionUI({
      field,
      options,
      isEdit: true,
      validationError,
    });
    return buildResponse(edMsg, edUI, currentStep);
  }

  return buildResponse("Something went wrong.", null, "done");
}
