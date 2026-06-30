/**
 * Service Schedule controller -- read-only computed view.
 * No dedicated collection; queries servicePrograms, assets, and serviceTasks.
 */
import { ObjectId } from 'mongodb';
import {
  getServiceProgramsCollection,
  getAssetsCollection,
  getServiceTasksCollection,
} from '@/lib/mongodb';
import { computeScheduleItem, sortScheduleItems } from './utils';
import type { ServiceScheduleItem } from './types';

/** Get service schedule with pagination and search. */
export async function getServiceSchedule(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string },
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));

  const tenantOid = ObjectId.createFromHexString(tenantId);

  // 1. Fetch all active, non-archived service programs for this tenant
  const programsCollection = await getServiceProgramsCollection();
  const programs = await programsCollection
    .find({
      tenantId: tenantOid,
      isActive: true,
      isArchived: { $ne: true },
    })
    .toArray();

  if (programs.length === 0) {
    return {
      items: [],
      pagination: { page, limit, total: 0, hasMore: false },
    };
  }

  // 2. Collect all unique asset IDs referenced by programs
  const allAssetIdStrs = new Set<string>();
  programs.forEach((p) => {
    const ids = (p.assetIds || []) as Array<{ toString(): string }>;
    ids.forEach((id) => allAssetIdStrs.add(id.toString()));
  });

  if (allAssetIdStrs.size === 0) {
    return {
      items: [],
      pagination: { page, limit, total: 0, hasMore: false },
    };
  }

  // 3. Batch-fetch those assets
  const assetsCollection = await getAssetsCollection();
  const assetOids = Array.from(allAssetIdStrs).map((id) => ObjectId.createFromHexString(id));
  const assets = await assetsCollection
    .find({
      _id: { $in: assetOids },
      tenantId: tenantOid,
      isArchived: { $ne: true },
    })
    .toArray();

  const assetMap = new Map(assets.map((a) => [a._id.toString(), a]));

  // 4. Batch-fetch service tasks for title lookup
  const allTaskIdStrs = new Set<string>();
  programs.forEach((p) => {
    ((p.serviceTaskIds || []) as Array<{ toString(): string }>).forEach((id) =>
      allTaskIdStrs.add(id.toString()),
    );
  });

  const taskTitleMap = new Map<string, string>();
  if (allTaskIdStrs.size > 0) {
    const tasksCollection = await getServiceTasksCollection();
    const taskOids = Array.from(allTaskIdStrs).map((id) => ObjectId.createFromHexString(id));
    const tasks = await tasksCollection.find({ _id: { $in: taskOids } }).toArray();
    tasks.forEach((t) => {
      taskTitleMap.set(t._id.toString(), t.title as string);
    });
  }

  // 5. Compute schedule items for each (program, asset) pair
  const allItems: ServiceScheduleItem[] = [];
  for (const program of programs) {
    const programAssetIds = ((program.assetIds || []) as Array<{ toString(): string }>).map(
      (id) => id.toString(),
    );
    for (const assetIdStr of programAssetIds) {
      const asset = assetMap.get(assetIdStr);
      if (!asset) continue;
      const item = computeScheduleItem(program, asset, taskTitleMap);
      if (item) allItems.push(item);
    }
  }

  // 6. Apply search filter (program title, asset name, asset number)
  let filtered = allItems;
  if (options.search) {
    const searchLower = options.search.toLowerCase();
    filtered = allItems.filter(
      (item) =>
        item.programTitle.toLowerCase().includes(searchLower) ||
        item.assetName.toLowerCase().includes(searchLower) ||
        (item.assetNumber && item.assetNumber.toLowerCase().includes(searchLower)),
    );
  }

  // 7. Sort by urgency
  sortScheduleItems(filtered);

  // 8. Paginate
  const total = filtered.length;
  const skip = (page - 1) * limit;
  const paginatedItems = filtered.slice(skip, skip + limit);

  return {
    items: paginatedItems,
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}
