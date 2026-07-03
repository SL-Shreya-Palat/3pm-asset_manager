/**
 * Buddy AI — Thread persistence
 *
 * Manages buddyChatThreads and buddyChatMessages collections.
 */

import { ObjectId } from "mongodb";
import {
  getBuddyChatThreadsCollection,
  getBuddyChatMessagesCollection,
} from "@/lib/mongodb";
import type { WorkflowStateType } from "../types";
import type { WorkflowStatus } from "../state-machine";

/** Re-export for consumers */
export type { WorkflowStateType };

/** Workflow state for create/update flows (stored per thread) */
export type WorkflowState = {
  workflow: string;
  collectedData: Record<string, unknown>;
  currentStep: string;
  /** Formal state for transitions (derived from currentStep) */
  state?: WorkflowStateType;
  /** High-level workflow status (state machine) */
  status?: WorkflowStatus;
  /** Optional fields user chose to add (create_project flow) */
  pendingOptionalFields?: string[];
  /** Optional fields user explicitly skipped */
  skippedFields?: string[];
  /** Step history for back navigation */
  stepHistory?: string[];
  /** Number of createTool failures at confirmation (for retry limit) */
  createRetryCount?: number;
  /** Extracted fields from routing, applied when user selects "Chat with AI" */
  prefillData?: Record<string, unknown>;
};

export type BuddyThread = {
  _id: ObjectId;
  userId: ObjectId;
  tenantId: ObjectId;
  title?: string;
  workflowState?: WorkflowState;
  createdAt: Date;
  updatedAt: Date;
};

export type BuddyThreadMessage = {
  _id: ObjectId;
  threadId: ObjectId;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

/**
 * Create a new thread.
 */
export async function createThread(
  userId: string,
  tenantId: string,
  title?: string
): Promise<string> {
  const coll = await getBuddyChatThreadsCollection();
  const now = new Date();
  const doc = {
    userId: ObjectId.createFromHexString(userId),
    tenantId: ObjectId.createFromHexString(tenantId),
    title: title ?? "New chat",
    createdAt: now,
    updatedAt: now,
  };
  const result = await coll.insertOne(doc);
  return result.insertedId.toString();
}

/**
 * List threads for a user in a tenant.
 */
export async function listThreads(
  userId: string,
  tenantId: string,
  limit: number = 20
): Promise<Array<{ id: string; title: string; updatedAt: Date }>> {
  const coll = await getBuddyChatThreadsCollection();
  const cursor = coll
    .find(
      {
        userId: ObjectId.createFromHexString(userId),
        tenantId: ObjectId.createFromHexString(tenantId),
      },
      { projection: { title: 1, updatedAt: 1 }, sort: { updatedAt: -1 }, limit }
    )
    .toArray();

  return (await cursor).map((d) => ({
    id: (d._id as ObjectId).toString(),
    title: (d.title as string) ?? "New chat",
    updatedAt: d.updatedAt as Date,
  }));
}

/**
 * Get a thread and verify ownership.
 */
export async function getThread(
  threadId: string,
  userId: string,
  tenantId: string
): Promise<BuddyThread | null> {
  const coll = await getBuddyChatThreadsCollection();
  const doc = await coll.findOne({
    _id: ObjectId.createFromHexString(threadId),
    userId: ObjectId.createFromHexString(userId),
    tenantId: ObjectId.createFromHexString(tenantId),
  });
  return doc as BuddyThread | null;
}

/**
 * Get messages for a thread.
 */
export async function getThreadMessages(
  threadId: string,
  userId: string,
  tenantId: string
): Promise<Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }>> {
  const thread = await getThread(threadId, userId, tenantId);
  if (!thread) return [];

  const coll = await getBuddyChatMessagesCollection();
  const docs = await coll
    .find(
      { threadId: ObjectId.createFromHexString(threadId) },
      { projection: { _id: 1, role: 1, content: 1, createdAt: 1 }, sort: { createdAt: 1 } }
    )
    .toArray();

  return docs.map((d) => ({
    id: (d._id as ObjectId).toString(),
    role: d.role as "user" | "assistant",
    content: (d.content as string) ?? "",
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : new Date().toISOString(),
  }));
}

/**
 * Append messages to a thread and update thread's updatedAt.
 */
export async function appendMessagesToThread(
  threadId: string,
  userId: string,
  tenantId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<void> {
  const thread = await getThread(threadId, userId, tenantId);
  if (!thread) throw new Error("Thread not found");

  const threadsColl = await getBuddyChatThreadsCollection();
  const messagesColl = await getBuddyChatMessagesCollection();
  const threadObjectId = ObjectId.createFromHexString(threadId);
  const now = new Date();

  const docs = messages.map((m) => ({
    threadId: threadObjectId,
    role: m.role,
    content: m.content,
    createdAt: now,
  }));

  await messagesColl.insertMany(docs);
  await threadsColl.updateOne(
    { _id: threadObjectId },
    { $set: { updatedAt: now } }
  );
}

/**
 * Update thread title from first user message.
 */
export async function updateThreadTitle(
  threadId: string,
  userId: string,
  tenantId: string,
  title: string
): Promise<void> {
  const thread = await getThread(threadId, userId, tenantId);
  if (!thread) return;

  const threadsColl = await getBuddyChatThreadsCollection();
  await threadsColl.updateOne(
    { _id: ObjectId.createFromHexString(threadId) },
    { $set: { title: title.slice(0, 100), updatedAt: new Date() } }
  );
}

/**
 * Get workflow state for a thread (if any).
 */
export async function getWorkflowState(
  threadId: string,
  userId: string,
  tenantId: string
): Promise<WorkflowState | null> {
  const thread = await getThread(threadId, userId, tenantId);
  if (!thread?.workflowState) return null;
  return thread.workflowState;
}

/**
 * Update workflow state for a thread.
 */
export async function updateWorkflowState(
  threadId: string,
  userId: string,
  tenantId: string,
  workflowState: WorkflowState
): Promise<void> {
  const thread = await getThread(threadId, userId, tenantId);
  if (!thread) throw new Error("Thread not found");

  const threadsColl = await getBuddyChatThreadsCollection();
  await threadsColl.updateOne(
    { _id: ObjectId.createFromHexString(threadId) },
    { $set: { workflowState, updatedAt: new Date() } }
  );
}

/**
 * Clear workflow state for a thread (on interrupt or completion).
 */
export async function clearWorkflowState(
  threadId: string,
  userId: string,
  tenantId: string
): Promise<void> {
  const thread = await getThread(threadId, userId, tenantId);
  if (!thread) return;

  const threadsColl = await getBuddyChatThreadsCollection();
  await threadsColl.updateOne(
    { _id: ObjectId.createFromHexString(threadId) },
    { $unset: { workflowState: "" }, $set: { updatedAt: new Date() } }
  );
}

/**
 * Delete a thread and its messages.
 */
export async function deleteThread(
  threadId: string,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const thread = await getThread(threadId, userId, tenantId);
  if (!thread) return false;

  const threadObjectId = ObjectId.createFromHexString(threadId);
  const threadsColl = await getBuddyChatThreadsCollection();
  const messagesColl = await getBuddyChatMessagesCollection();

  await messagesColl.deleteMany({ threadId: threadObjectId });
  const result = await threadsColl.deleteOne({ _id: threadObjectId });
  return (result.deletedCount ?? 0) > 0;
}
