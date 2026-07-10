/**
 * Service Schedule controller -- read-only fleet view.
 *
 * Sources from the hierarchical Service Plans model (via the ported engine):
 * one row per (asset × active schedule) for every asset that has a plan
 * assigned. Emits the same ServiceScheduleItem shape the UI already renders, so
 * the component is unchanged — statuses are mapped to overdue/due_soon/upcoming.
 */
import { ObjectId } from 'mongodb';
import { getAssetsCollection } from '@/lib/mongodb';
import { getAssetServiceStatus } from '@/controller/service-plans';
import type { NextServiceStatus } from '@/controller/service-plans/calc';
import { sortScheduleItems } from './utils';
import type { ServiceScheduleItem, ScheduleStatus, DueDimension } from './types';

/** Map the plan engine's status vocabulary onto the fleet-view's three buckets. */
function mapStatus(s: NextServiceStatus): ScheduleStatus | null {
  if (s === 'overdue') return 'overdue';
  if (s === 'due') return 'due_soon';
  if (s === 'upcoming' || s === 'planned') return 'upcoming';
  return null; // 'no-plan' → omit
}

function dimensionType(unit: string): DueDimension['type'] {
  const u = unit.toLowerCase();
  if (u.includes('hr') || u.includes('hour')) return 'engineHours';
  if (u.includes('day') || u.includes('month')) return 'calendar';
  return 'mileage';
}

export async function getServiceSchedule(
  tenantId: string,
  options: { page?: number; limit?: number; search?: string },
) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const tenantOid = ObjectId.createFromHexString(tenantId);

  // Every non-archived asset with a service plan drives the fleet schedule.
  const assetsCollection = await getAssetsCollection();
  const assets = await assetsCollection
    .find(
      { tenantId: tenantOid, servicePlanId: { $ne: null, $exists: true }, isArchived: { $ne: true } },
      { projection: { name: 1, assetNumber: 1 } },
    )
    .toArray();

  if (assets.length === 0) {
    return { items: [], pagination: { page, limit, total: 0, hasMore: false } };
  }

  const allItems: ServiceScheduleItem[] = [];
  for (const asset of assets) {
    const assetId = asset._id.toString();
    const status = await getAssetServiceStatus(tenantId, assetId);
    for (const s of status.perSchedule) {
      const mapped = mapStatus(s.status);
      if (!mapped) continue;

      const isCalendar = dimensionType(s.unit) === 'calendar';
      const dim: DueDimension = {
        type: dimensionType(s.unit),
        nextDueValue: isCalendar
          ? (s.nextCalendarDate ? new Date(s.nextCalendarDate).toISOString() : '')
          : (s.nextServiceAt ?? 0),
        currentValue: isCalendar ? new Date().toISOString() : (s.currentReading ?? 0),
        remaining: s.value ?? 0,
        unit: s.unit === 'Kms' ? 'km' : s.unit === 'Hrs' ? 'hrs' : 'days',
        status: mapped,
      };

      allItems.push({
        id: `${assetId}_${s.scheduleId}`,
        // The Plan column shows the PLAN name (e.g. "Heavy Vehicle"); the
        // schedule (e.g. "Wheel Alignment") is the service task for this row.
        planId: status.planId ?? s.scheduleId,
        planTitle: status.planName ?? s.scheduleName,
        assetId,
        assetName: (asset.name as string) || 'Asset',
        assetNumber: (asset.assetNumber as string) || undefined,
        serviceTaskIds: [],
        serviceTaskTitles: [s.scheduleName],
        intervalType: 'repeat',
        dueDimensions: [dim],
        status: mapped,
        sortPriority: mapped === 'overdue' ? 0 : mapped === 'due_soon' ? 1 : 2,
        urgencyValue: s.value ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  // Search filter (schedule title, asset name/number).
  let filtered = allItems;
  if (options.search) {
    const q = options.search.toLowerCase();
    filtered = allItems.filter(
      (i) =>
        i.planTitle.toLowerCase().includes(q) ||
        i.serviceTaskTitles.some((t) => t.toLowerCase().includes(q)) ||
        i.assetName.toLowerCase().includes(q) ||
        (i.assetNumber && i.assetNumber.toLowerCase().includes(q)),
    );
  }

  sortScheduleItems(filtered);

  const total = filtered.length;
  const skip = (page - 1) * limit;
  return {
    items: filtered.slice(skip, skip + limit),
    pagination: { page, limit, total, hasMore: skip + limit < total },
  };
}
