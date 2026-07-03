/**
 * Buddy AI — Generic update workflow orchestrator
 *
 * Schema-driven update flow: select entity → choose fields to update → collect values → confirm → execute.
 *
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 5.1
 */

import type { BuddyAIContext } from "../utils/rbac";
import { chargeAiCredits } from "@/lib/ai-credits/guard";
import type {
  StructuredResponse,
  StructuredInput,
  UISchema,
  UISchemaFieldCollection,
  UISchemaConfirmation,
} from "../types";
import type { WorkflowState } from "../db/threads";
import type { ConsultantDelegateResponse } from "../handlers/types";
import type { UpdateWorkflowConfig } from "./generic-types";
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
  renderFieldCollectionUI,
  renderEmptyOptionsUI,
  renderOptionalSelectorUI,
  renderConfirmButtonUI,
  renderEditSelectorUI,
  resolveExtractedFields,
  classifyUpdateExpressPath,
  getEntityRefFromExtracted,
} from "../field-engine";

export type OrchestrateGenericUpdateInput = {
  context: BuddyAIContext;
  message: string;
  structuredInput: StructuredInput | null;
  workflowState: WorkflowState | null;
  threadId: string;
  routingResult?: RoutingResult | null;
  abortSignal?: AbortSignal;
};

const MAX_RETRY_COUNT = 2;

export async function orchestrateGenericUpdate(
  config: UpdateWorkflowConfig,
  input: OrchestrateGenericUpdateInput
): Promise<StructuredResponse | ConsultantDelegateResponse> {
  const { context, message, structuredInput, workflowState, routingResult, abortSignal } = input;
  const {
    definition,
    updateTool,
    fetchEntityForUpdate,
    entityResolver,
    entityResolvers,
    emptyOptionsMeta,
    successMessage,
    confirmationLabels,
  } = config;

  const schema = definition;
  const requiredFields = schema.requiredFields;
  const optionalFields = schema.optionalFields;
  const allFields = [...requiredFields, ...optionalFields];

  const entityFieldName = requiredFields[0]?.name ?? "projectId";
  const entityCollectStep = `collect_${entityFieldName}`;

  let collectedData: Record<string, unknown> = workflowState?.collectedData ?? {};
  let currentStep = workflowState?.currentStep ?? schema.entryStep;
  let pendingOptionalFields: string[] = (workflowState as { pendingOptionalFields?: string[] } | undefined)
    ?.pendingOptionalFields ?? [];
  let skippedFields: string[] = (workflowState as { skippedFields?: string[] } | undefined)?.skippedFields ?? [];
  let stepHistory: string[] = (workflowState as { stepHistory?: string[] } | undefined)?.stepHistory ?? [];
  let updateRetryCount: number =
    (workflowState as { createRetryCount?: number } | undefined)?.createRetryCount ?? 0;

  const entityId = collectedData[entityFieldName] as string | undefined;
  const existingEntity = entityId
    ? await fetchEntityForUpdate(context, entityId)
    : null;

  const mergeValue = (field: string, value: unknown) => {
    collectedData = { ...collectedData, [field]: value };
  };

  const getCollectedDataForOptions = () => {
    const merged = { ...existingEntity, ...collectedData } as Record<string, unknown>;
    return merged;
  };

  const getNextRequiredField = () =>
    requiredFields.find((f) => isFieldEmpty(collectedData[f.name])) ?? null;

  const getFieldByName = (name: string) => feGetFieldByName(schema, name);

  const workflowKey = config.intent;

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
    extra?: { createRetryCount?: number }
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
    const showBack = nextStep !== "done" && stepHistory.length > 0;
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
    };
  };

  let routing: RoutingResult | null = routingResult ?? null;
  if (message.trim() && !structuredInput && !routing) {
    routing = await routeWithLLM(
      context,
      message,
      { currentStep, workflow: workflowKey, collectedData },
      abortSignal
    );
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

  if (structuredInput && !isResume && !isBack) {
    const { field, value } = structuredInput;
    if (
      !["_yes", "_no", "_edit", "_confirm"].includes(field) &&
      (currentStep.startsWith("collect_") || currentStep.startsWith("optional_"))
    ) {
      mergeValue(field, value);
      if (currentStep.startsWith("collect_")) {
        const nextRequired = getNextRequiredField();
        currentStep = nextRequired ? `collect_${nextRequired.name}` : "optional_selector";
      } else {
        const fieldName = currentStep.replace("optional_", "");
        pendingOptionalFields = pendingOptionalFields.filter((f) => f !== fieldName);
        const nextPending = pendingOptionalFields.find(
          (f) => isFieldEmpty(collectedData[f]) && f !== fieldName
        );
        currentStep = nextPending ? `optional_${nextPending}` : "confirm_button";
      }
    } else if (
      !["_yes", "_no", "_edit", "_confirm"].includes(field) &&
      currentStep === "optional_selector"
    ) {
      if (field === "_skip" || field === "_done" || field === "_confirm") {
        currentStep = "confirm_button";
      } else {
        pendingOptionalFields = [...new Set([...pendingOptionalFields, field])];
        const nextPending = pendingOptionalFields.find(
          (fn) => isFieldEmpty(collectedData[fn])
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
    } else if (
      !["_yes", "_no", "_edit", "_confirm"].includes(field) &&
      currentStep.startsWith("edit_")
    ) {
      mergeValue(field, value);
      currentStep = "confirmation";
      updateRetryCount = 0;
    }
  }

  if (message.trim() && !isResume) {
    const userIntent = routing?.userIntent;
    const extracted = routing?.extractedFields;

    // Express path: resolve entity + extracted changes
    if (
      currentStep === entityCollectStep &&
      entityResolver &&
      extracted &&
      Object.keys(extracted).length > 0
    ) {
      const expressPath = classifyUpdateExpressPath(
        extracted,
        entityFieldName,
        optionalFields.map((f) => f.name)
      );

      const entityRef = getEntityRefFromExtracted(extracted, entityFieldName);
      const entityRefStr =
        entityRef != null ? String(entityRef).trim() : "";

      if (entityRefStr && expressPath !== "normal") {
        const entityField = getFieldByName(entityFieldName);
        if (entityField) {
          const options = await getOptionsForField(context, entityField, collectedData);
          let resolvedId: string | null = null;
          let ambiguousMatches: { value: string; label: string }[] | null = null;

          const exactMatch = options.find((o) => o.value === entityRefStr);
          if (exactMatch) {
            resolvedId = exactMatch.value;
          } else {
            const { resolveEntityWithOptionsEx } = await import(
              "../utils/llm-entity-resolver"
            );
            const resolved = await resolveEntityWithOptionsEx(
              context, entityRefStr, options, abortSignal
            );
            if (resolved.status === "resolved") resolvedId = resolved.id;
            else if (resolved.status === "ambiguous") ambiguousMatches = resolved.matches;
          }

          if (resolvedId) {
            mergeValue(entityFieldName, resolvedId);

            if (expressPath === "express_confirm") {
              const existingForExpress = await fetchEntityForUpdate(context, resolvedId);
              const mergedBase = { ...existingForExpress, ...collectedData } as Record<string, unknown>;

              const changeResult = await resolveExtractedFields(
                context,
                extracted,
                optionalFields,
                entityResolvers ?? {},
                mergedBase
              );
              collectedData = { ...collectedData };
              for (const f of optionalFields) {
                if (changeResult.collectedData[f.name] != null) {
                  mergeValue(f.name, changeResult.collectedData[f.name]);
                }
              }

              if (changeResult.status === "ambiguous") {
                pendingOptionalFields = [
                  ...new Set([...pendingOptionalFields, changeResult.field.name]),
                ];
                return buildResponse(
                  "Which one did you mean?",
                  {
                    type: "field_collection",
                    field: {
                      name: changeResult.field.name,
                      label: changeResult.field.label,
                      type: "dropdown",
                      options: changeResult.matches,
                      required: false,
                    },
                  } as UISchemaFieldCollection,
                  `optional_${changeResult.field.name}`,
                  { createRetryCount: updateRetryCount }
                );
              }

              currentStep = "confirmation";
            } else {
              currentStep = "optional_selector";
            }
          } else if (ambiguousMatches) {
            return buildResponse(
              `Which ${entityField.label} did you mean?`,
              {
                type: "field_collection",
                field: {
                  name: entityFieldName,
                  label: entityField.label,
                  type: "dropdown",
                  options: ambiguousMatches,
                  required: true,
                },
              } as UISchemaFieldCollection,
              entityCollectStep,
              { createRetryCount: updateRetryCount }
            );
          } else {
            validationError = `No matching ${entityField.label.toLowerCase()} found for "${entityRefStr}". Try a different name or select from the list.`;
            currentStep = entityCollectStep;
          }
        }
      }
    }

    if (currentStep.startsWith("collect_") || currentStep.startsWith("optional_") || currentStep.startsWith("edit_")) {
      const fieldName = currentStep.replace(/^(collect_|optional_|edit_)/, "");
      const field = getFieldByName(fieldName);
      if (field) {
        const resolvers = fieldName === entityFieldName && entityResolver
          ? { [entityFieldName]: entityResolver }
          : entityResolvers ?? {};
        const fieldResolver = resolvers[fieldName];

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
          const mergedForDeps = getCollectedDataForOptions();
          const remaining = optionalFields.filter((f) =>
            areDependenciesSatisfied(f.name, allFields, mergedForDeps)
          ).filter((f) => isFieldEmpty(collectedData[f.name]));
          for (const f of remaining) {
            skippedFields = [...new Set([...skippedFields, f.name])];
            pendingOptionalFields = pendingOptionalFields.filter((n) => n !== f.name);
          }
          currentStep = "confirm_button";
          validationError = null;
        } else if (fieldAction.type === "correction") {
          const corrField = getFieldByName(fieldAction.fieldName);
          if (corrField && allFields.some((f) => f.name === fieldAction.fieldName)) {
            let resolvedValue: unknown = fieldAction.value;
            const corrResolver = resolvers[fieldAction.fieldName];
            if (corrResolver) {
              const resolved = await corrResolver(
                context,
                String(fieldAction.value),
                getCollectedDataForOptions()
              );
              if (resolved && "id" in resolved) {
                resolvedValue = resolved.id;
              } else if (resolved && "status" in resolved && resolved.status === "ambiguous") {
                const corrStep = `optional_${fieldAction.fieldName}`;
                return buildResponse(
                  "Which one did you mean?",
                  {
                    type: "field_collection",
                    field: {
                      name: fieldAction.fieldName,
                      label: corrField.label,
                      type: "dropdown",
                      options: resolved.matches,
                      required: false,
                    },
                  } as UISchemaFieldCollection,
                  corrStep,
                  { createRetryCount: updateRetryCount }
                );
              } else {
                validationError = `No matching ${corrField.label.toLowerCase()}. Try a different name or select from the list.`;
                currentStep = `optional_${fieldAction.fieldName}`;
                resolvedValue = null;
              }
            }
            if (resolvedValue != null) {
              mergeValue(fieldAction.fieldName, resolvedValue);
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
                updateRetryCount = 0;
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
                createRetryCount: updateRetryCount > 0 ? updateRetryCount : undefined,
              },
            };
          }
          if (userIntent !== "skip" && userIntent !== "confirm") {
            const options = field.optionsFrom
              ? await getOptionsForField(context, field, getCollectedDataForOptions())
              : undefined;
            const todayIso = new Date().toISOString().slice(0, 10);
            const result = await interpretStepInput(
              context,
              {
                workflow: workflowKey,
                currentStep,
                field,
                options,
                collectedData: getCollectedDataForOptions(),
                userMessage: message.trim(),
                todayIso,
              },
              abortSignal
            );
            if ("value" in result) {
              let resolvedValue: unknown = result.value;
              if (fieldResolver) {
                const resolved = await fieldResolver(
                  context,
                  String(result.value),
                  getCollectedDataForOptions()
                );
                if (resolved && "id" in resolved) resolvedValue = resolved.id;
                else if (resolved && "status" in resolved && resolved.status === "ambiguous") {
                  const step = field.required ?? true ? `collect_${fieldName}` : `optional_${fieldName}`;
                  return buildResponse(
                    "Which one did you mean?",
                    {
                      type: "field_collection",
                      field: {
                        name: fieldName,
                        label: field.label,
                        type: "dropdown",
                        options: resolved.matches,
                        required: field.required ?? true,
                      },
                    } as UISchemaFieldCollection,
                    step,
                    { createRetryCount: updateRetryCount }
                  );
                } else if (!resolved) {
                  validationError = `No matching ${field.label.toLowerCase()}. Try a different name or select from the list.`;
                  currentStep = field.required ?? true ? `collect_${fieldName}` : `optional_${fieldName}`;
                  resolvedValue = null;
                }
              }
              if (resolvedValue != null) mergeValue(fieldName, resolvedValue);
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
                updateRetryCount = 0;
              }
            } else {
              validationError = result.error ?? null;
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
              if (currentStep.startsWith("collect_")) {
                const nextRequired = getNextRequiredField();
                currentStep = nextRequired ? `collect_${nextRequired.name}` : "optional_selector";
              } else {
                const nextPending = pendingOptionalFields.find(
                  (f) => isFieldEmpty(collectedData[f]) && f !== fieldName
                );
                currentStep = nextPending ? `optional_${nextPending}` : "confirm_button";
              }
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
    } else if (currentStep === "optional_selector" && (userIntent === "skip" || userIntent === "confirm")) {
      currentStep = "confirm_button";
    }
  }

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
    const entityIdValue = collectedData[entityFieldName] as string | undefined;
    if (!entityIdValue) {
      return buildResponse(`${entityFieldName.replace(/Id$/, "")} not selected.`, null, entityCollectStep);
    }
    const changes: Record<string, unknown> = {};
    for (const f of optionalFields) {
      const v = collectedData[f.name];
      if (v != null && String(v).trim() !== "") {
        changes[f.name] = v;
      }
    }
    // The update is an AI-performed ACTION — charge 1 credit before executing.
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
          message: "Please review the changes below and confirm.",
          summary,
          yesLabel: confirmationLabels?.yesLabel ?? "Update",
          noLabel: confirmationLabels?.noLabel ?? "Don't update",
          editLabel: confirmationLabels?.editLabel ?? "Edit Changes",
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
      result = await updateTool(context, { entityId: entityIdValue, changes });
    } catch (err) {
      // The update never happened — give the credit back before rethrowing.
      await actionCharge.refund();
      throw err;
    }
    if (result.success && result.projectId) {
      const msg = successMessage ? successMessage({ id: result.projectId }) : "Updated successfully.";
      return {
        message: msg,
        uiSchema: null,
        collectedData: {},
        workflow: workflowKey,
        nextStep: "done",
      };
    }
    // Update failed — refund so a retry doesn't double-charge.
    await actionCharge.refund();
    const newRetryCount = updateRetryCount + 1;
    const summary = await buildResolvedSummary(context, allFields, collectedData);
    const progress = computeWorkflowProgress(definition, "confirmation", collectedData, {
      pendingOptionalFields,
      skippedFields,
    });
    const failureMessage =
      newRetryCount >= MAX_RETRY_COUNT
        ? "Update failed. You can try again (Edit to fix) or cancel."
        : result.error ?? "Failed to update.";
    return {
      message: failureMessage,
      uiSchema: {
        type: "confirmation",
        message:
          newRetryCount >= MAX_RETRY_COUNT
            ? "Update failed. Edit changes to fix, or cancel."
            : "Please review the changes below and confirm.",
        summary,
        yesLabel: confirmationLabels?.yesLabel ?? "Update",
        noLabel: confirmationLabels?.noLabel ?? "Don't update",
        editLabel: confirmationLabels?.editLabel ?? "Edit Changes",
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
      message: "Update cancelled.",
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

  if (currentStep !== entryStep && !isBack) {
    stepHistory = [...stepHistory, entryStep];
  }

  if (currentStep === "confirmation") {
    const summary = await buildResolvedSummary(context, allFields, collectedData);
    return buildResponse(
      "Here are the changes. Please review and confirm.",
      {
        type: "confirmation",
        message: "Please review the changes below and confirm.",
        summary,
        yesLabel: confirmationLabels?.yesLabel ?? "Update",
        noLabel: confirmationLabels?.noLabel ?? "Don't update",
        editLabel: confirmationLabels?.editLabel ?? "Edit Changes",
      } as UISchemaConfirmation,
      "confirmation",
      { createRetryCount: updateRetryCount }
    );
  }

  if (currentStep === "confirm_button") {
    const { message: cbMsg, uiSchema: cbUI } = renderConfirmButtonUI();
    return buildResponse(cbMsg, cbUI, "confirm_button");
  }

  if (currentStep === "edit_selector") {
    const changedFields = optionalFields.filter((f) => !isFieldEmpty(collectedData[f.name]));
    const fieldsWithDisplay = await Promise.all(
      changedFields.map(async (f) => {
        const raw = collectedData[f.name];
        const displayValue =
          f.chipOptions || f.optionsFrom
            ? await resolveValueToDisplay(context, f, raw, getCollectedDataForOptions())
            : String(raw ?? "");
        return { name: f.name, label: f.label, value: displayValue };
      })
    );
    const { message: esMsg, uiSchema: esUI } = renderEditSelectorUI(fieldsWithDisplay);
    return buildResponse(esMsg, esUI, "edit_selector");
  }

  if (currentStep.startsWith("edit_")) {
    const fieldName = currentStep.replace("edit_", "");
    const field = getFieldByName(fieldName);
    if (!field) return buildResponse("Something went wrong.", null, "confirmation");

    const options = field.optionsFrom
      ? await getOptionsForField(context, field, getCollectedDataForOptions())
      : [];
    if (options.length === 0 && field.optionsFrom && emptyOptionsMeta?.[field.optionsFrom]) {
      const { message: eMsg, uiSchema: eUI } = renderEmptyOptionsUI(
        emptyOptionsMeta[field.optionsFrom],
        fieldName,
        false
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

  if (currentStep === "optional_selector") {
    const mergedForDeps = getCollectedDataForOptions();
    const available = optionalFields.filter((f) =>
      areDependenciesSatisfied(f.name, allFields, mergedForDeps)
    );
    const { message: osMsg, uiSchema: osUI } = renderOptionalSelectorUI(
      available.map((f) => ({ name: f.name, label: f.label }))
    );
    return buildResponse(osMsg, osUI, "optional_selector");
  }

  if (currentStep.startsWith("optional_")) {
    const fieldName = currentStep.replace("optional_", "");
    const field = getFieldByName(fieldName);
    if (!field) return buildResponse("Something went wrong.", null, "confirm_button");

    const options = field.optionsFrom
      ? await getOptionsForField(context, field, getCollectedDataForOptions())
      : [];
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
      isEdit: true,
      validationError,
    });
    return buildResponse(ofMsg, ofUI, currentStep);
  }

  if (currentStep.startsWith("collect_")) {
    const fieldName = currentStep.replace("collect_", "");
    const field = getFieldByName(fieldName);
    if (!field) return buildResponse("Something went wrong.", null, "done");

    const options = field.optionsFrom
      ? await getOptionsForField(context, field, getCollectedDataForOptions())
      : [];
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

  return buildResponse("Something went wrong.", null, "done");
}
