/**
 * Buddy AI — Handler pipeline
 *
 * First-match handler order: Control → UI → Workflow → WorkflowStart → Consultant.
 *
 * @see BUDDY_AI_V3_STRENGTHENING_PLAN.md Phase 3
 */

export type {
  AgentContext,
  ChatMessage,
  ConsultantDelegateResponse,
  Handler,
  HandlerResult,
  StreamResult,
} from "./types";
export { ControlHandler } from "./control-handler";
export { UIResponseHandler } from "./ui-response-handler";
export { WorkflowHandler } from "./workflow-handler";
export { WorkflowStartHandler } from "./workflow-start-handler";
export { ConsultantHandler } from "./consultant-handler";

import type { Handler } from "./types";
import { ControlHandler } from "./control-handler";
import { UIResponseHandler } from "./ui-response-handler";
import { WorkflowHandler } from "./workflow-handler";
import { WorkflowStartHandler } from "./workflow-start-handler";
import { ConsultantHandler } from "./consultant-handler";

export const HANDLER_PIPELINE: Handler[] = [
  ControlHandler,
  UIResponseHandler,
  WorkflowHandler,
  WorkflowStartHandler,
  ConsultantHandler,
];
