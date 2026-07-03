/**
 * Buddy AI — Thread persistence
 *
 * Multi-thread chat history in `buddyChatThreads`. Each thread doc embeds the
 * AI SDK UIMessage array verbatim (text + tool parts + approvals), so loading
 * a thread restores the exact useChat state. Trimmed to the last MAX_MESSAGES
 * to stay well under Mongo's 16MB document limit.
 */

import { ObjectId } from "mongodb";
import type { UIMessage } from "ai";
import { getBuddyChatThreadsCollection } from "@/lib/mongodb";

const MAX_MESSAGES = 200;

export type BuddyThread = {
  _id: ObjectId;
  userId: ObjectId;
  tenantId: ObjectId;
  title?: string;
  messages?: UIMessage[];
  createdAt: Date;
  updatedAt: Date;
};

function ownerFilter(threadId: string, userId: string, tenantId: string) {
  return {
    _id: ObjectId.createFromHexString(threadId),
    userId: ObjectId.createFromHexString(userId),
    tenantId: ObjectId.createFromHexString(tenantId),
  };
}

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
  const result = await coll.insertOne({
    userId: ObjectId.createFromHexString(userId),
    tenantId: ObjectId.createFromHexString(tenantId),
    title: title ?? "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
  });
  return result.insertedId.toString();
}

/**
 * List threads for a user in a tenant (most recent first).
 */
export async function listThreads(
  userId: string,
  tenantId: string,
  limit: number = 30
): Promise<Array<{ id: string; title: string; updatedAt: Date }>> {
  const coll = await getBuddyChatThreadsCollection();
  const docs = await coll
    .find(
      {
        userId: ObjectId.createFromHexString(userId),
        tenantId: ObjectId.createFromHexString(tenantId),
      },
      { projection: { title: 1, updatedAt: 1 }, sort: { updatedAt: -1 }, limit }
    )
    .toArray();

  return docs.map((d) => ({
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
  if (!ObjectId.isValid(threadId)) return null;
  const coll = await getBuddyChatThreadsCollection();
  const doc = await coll.findOne(ownerFilter(threadId, userId, tenantId));
  return doc as BuddyThread | null;
}

/**
 * Load a thread's UIMessage history (ownership-checked). Null if not found.
 */
export async function getThreadMessages(
  threadId: string,
  userId: string,
  tenantId: string
): Promise<UIMessage[] | null> {
  const thread = await getThread(threadId, userId, tenantId);
  if (!thread) return null;
  return thread.messages ?? [];
}

/**
 * Replace a thread's message history with the completed turn's messages
 * (the AI SDK hands back the full updated array on finish).
 */
export async function saveThreadMessages(
  threadId: string,
  userId: string,
  tenantId: string,
  messages: UIMessage[]
): Promise<void> {
  const coll = await getBuddyChatThreadsCollection();
  await coll.updateOne(ownerFilter(threadId, userId, tenantId), {
    $set: {
      messages: messages.slice(-MAX_MESSAGES),
      updatedAt: new Date(),
    },
  });
}

/**
 * Update a thread's title (ownership-checked).
 */
export async function updateThreadTitle(
  threadId: string,
  userId: string,
  tenantId: string,
  title: string
): Promise<void> {
  const coll = await getBuddyChatThreadsCollection();
  await coll.updateOne(ownerFilter(threadId, userId, tenantId), {
    $set: { title: title.slice(0, 100), updatedAt: new Date() },
  });
}

/**
 * Delete a thread (ownership-checked). Returns true if a doc was removed.
 */
export async function deleteThread(
  threadId: string,
  userId: string,
  tenantId: string
): Promise<boolean> {
  if (!ObjectId.isValid(threadId)) return false;
  const coll = await getBuddyChatThreadsCollection();
  const result = await coll.deleteOne(ownerFilter(threadId, userId, tenantId));
  return result.deletedCount > 0;
}
