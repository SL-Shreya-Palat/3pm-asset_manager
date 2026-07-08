'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  ArrowLeft, Pencil, Power, Fuel, Info, Wrench,
  Truck, Gauge, Clock, DollarSign, Fingerprint, StickyNote, CalendarClock,
  Users, ClipboardList, KeyRound, MoreHorizontal, ShieldCheck,
  Camera, ClipboardCheck, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { DetailCard, DetailField } from '@/components/ui/detail-field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ASSET_STATUS_CONFIG, type AssetStatus } from '@/constants/assets';
import {
  SERVICE_STATUS_TEXT,
  SERVICE_STATUS_LABEL,
  SERVICE_STATUS_BAR,
  type ServiceScheduleStatus,
} from '@/constants/service-status';
import { InspectButton } from '@/components/inspections/inspect-button';
import { useRoleAccess } from '@/hooks/use-role-access';
import { AssetFuelTab } from '@/components/fuel/asset-fuel-tab';
import { AssetServiceTab } from '@/components/assets/asset-service-tab';
import { AssetMeterTab } from '@/components/assets/asset-meter-tab';
import { AssetComplianceTab } from '@/components/assets/asset-compliance-tab';
import { AssetPrestartsTab } from '@/components/assets/asset-prestarts-tab';
import { AssetFaultsTab } from '@/components/assets/asset-faults-tab';
import { useSyncSubmissions } from '@/hooks/use-sync-submissions';

const ASSET_TABS = [
  { id: 'details', label: 'Specifications', icon: Info },
  { id: 'service', label: 'Service', icon: Wrench },
  { id: 'prestarts', label: 'Inspections', icon: ClipboardCheck },
  { id: 'faults', label: 'Faults & Defects', icon: AlertCircle },
  { id: 'meter', label: 'Meter', icon: Gauge },
  { id: 'fuel', label: 'Fuel', icon: Fuel },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
] as const;

type SchedStatus = ServiceScheduleStatus;

interface ScheduleStatus { scheduleId: string; scheduleName: string; unit: string; value: number | null; status: SchedStatus; nextServiceAt: number | null; interval: number }

const STATUS_RANK: Record<SchedStatus, number> = { overdue: 5, due: 4, upcoming: 3, planned: 2, 'no-plan': 1 };

type AssetTabId = (typeof ASSET_TABS)[number]['id'];

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { hasFullAccess, permissionIndex } = useRoleAccess();

  // Permission checks for asset actions
  const assetFormId = 'assets.assets.asset';
  const canInspect = hasFullAccess || (permissionIndex.getInspectLevel(assetFormId) === 'ALL' || permissionIndex.getInspectLevel(assetFormId) === 'OWN');
  const canEdit = hasFullAccess || (permissionIndex.getEditLevel(assetFormId) === 'ALL' || permissionIndex.getEditLevel(assetFormId) === 'OWN');
  const canAccessForms = hasFullAccess || permissionIndex.hasSubModuleView('inspections', 'forms');

  const [asset, setAsset] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<AssetTabId>('details');

  // Command-style overview enrichments: tab counts + next-service + latest pre-start.
  const [counts, setCounts] = useState({ services: 0, faults: 0, prestarts: 0 });
  const [nextService, setNextService] = useState<{ status: SchedStatus; title: string; unit: string; value: number | null; nextServiceAt: number | null } | null>(null);
  const [latestPrestartResult, setLatestPrestartResult] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // Change Team dialog
  const [changeTeamOpen, setChangeTeamOpen] = useState(false);
  const [teamsList, setTeamsList] = useState<{ id: string; name: string }[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [savingTeam, setSavingTeam] = useState(false);

  // Assign Forms dialog
  const [assignFormsOpen, setAssignFormsOpen] = useState(false);
  const [formsList, setFormsList] = useState<{ id: string; title: string }[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set());
  const [savingForms, setSavingForms] = useState(false);

  // Driver Access dialog
  const [driverAccessOpen, setDriverAccessOpen] = useState(false);
  const [driversList, setDriversList] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [savingDrivers, setSavingDrivers] = useState(false);

  const fetchAsset = useCallback(async () => {
    try {
      const res = await axios.get(`/api/assets/${params.id}`, { withCredentials: true });
      setAsset(res.data.data);
    } catch {
      setAsset(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  // Fetch the overview enrichments in parallel: service-status (services count +
  // next-service), faults total, and pre-starts total + latest result.
  const fetchOverview = useCallback(async () => {
    const id = params.id;
    if (!id) return;
    const [svc, flt, pre] = await Promise.allSettled([
      axios.get(`/api/assets/${id}/service-status`, { withCredentials: true }),
      axios.get(`/api/faults?assetId=${id}&limit=1`, { withCredentials: true }),
      axios.get(`/api/inspection-submissions?assetId=${id}&limit=1`, { withCredentials: true }),
    ]);

    // Services count + next service (worst schedule of the assigned service plan)
    if (svc.status === 'fulfilled') {
      const data = svc.value.data?.data;
      const schedules: ScheduleStatus[] = Array.isArray(data?.schedules) ? data.schedules : [];
      let worst: ScheduleStatus | null = null;
      for (const s of schedules) {
        if (!worst || STATUS_RANK[s.status] > STATUS_RANK[worst.status]) worst = s;
      }
      setCounts((c) => ({ ...c, services: schedules.length }));
      setNextService(
        worst && worst.status !== 'no-plan'
          ? {
              status: worst.status,
              title: worst.scheduleName,
              unit: worst.unit,
              value: worst.value,
              nextServiceAt: worst.nextServiceAt ?? worst.interval ?? null,
            }
          : null,
      );
    }
    // Faults total
    if (flt.status === 'fulfilled') {
      setCounts((c) => ({ ...c, faults: flt.value.data?.data?.pagination?.total ?? 0 }));
    }
    // Pre-starts total + latest result
    if (pre.status === 'fulfilled') {
      const d = pre.value.data?.data;
      setCounts((c) => ({ ...c, prestarts: d?.pagination?.total ?? 0 }));
      setLatestPrestartResult(d?.items?.[0]?.result ?? null);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) {
      fetchAsset();
      fetchOverview();
    }
  }, [params.id, fetchAsset, fetchOverview]);

  // Auto-pull new inspection submissions so a "not safe to operate" result flips
  // this asset to Out of Service without the manual Sync button.
  useSyncSubmissions(fetchAsset);

  const handleToggleStatus = async () => {
    if (!asset) return;
    const current = asset.status === 'active' || asset.status === 'in_service' ? 'in_service' : 'out_of_service';
    const newStatus = current === 'in_service' ? 'out_of_service' : 'in_service';
    try {
      setToggling(true);
      await axios.put(`/api/assets/${params.id}`, { status: newStatus }, { withCredentials: true });
      await fetchAsset();
    } catch {
      console.error('Failed to update status');
    } finally {
      setToggling(false);
    }
  };

  // ── Change Team handlers ──
  const fetchTeams = useCallback(async () => {
    setTeamsLoading(true);
    try {
      const res = await axios.get('/api/teams?limit=100', { withCredentials: true });
      setTeamsList(res.data.data?.items || []);
    } catch { setTeamsList([]); }
    finally { setTeamsLoading(false); }
  }, []);

  const handleOpenChangeTeam = () => {
    const teamIds = Array.isArray(asset?.teamIds) ? (asset.teamIds as string[]) : [];
    setSelectedTeamId(teamIds[0] || null);
    setChangeTeamOpen(true);
    fetchTeams();
  };

  const handleSaveTeam = async () => {
    setSavingTeam(true);
    try {
      await axios.put(`/api/assets/${params.id}`, { teamIds: selectedTeamId ? [selectedTeamId] : [] }, { withCredentials: true });
      setChangeTeamOpen(false);
      await fetchAsset();
    } catch { /* silent */ }
    finally { setSavingTeam(false); }
  };

  // ── Assign Forms handlers ──
  const fetchForms = useCallback(async () => {
    setFormsLoading(true);
    try {
      // Auto-seed pre-start forms (idempotent — skips if already seeded)
      await axios.post('/api/forms/seed-prestart', {}, { withCredentials: true }).catch(() => {});
      const res = await axios.get('/api/forms?includeSchema=false', { withCredentials: true });
      const allForms = res.data.data?.items || [];
      setFormsList(allForms.filter((f: { title: string }) => !f.title?.toLowerCase().includes('driver wellness')));
    } catch { setFormsList([]); }
    finally { setFormsLoading(false); }
  }, []);

  const handleOpenAssignForms = () => {
    setSelectedFormIds(new Set(Array.isArray(asset?.formIds) ? (asset.formIds as string[]) : []));
    setAssignFormsOpen(true);
    fetchForms();
    // Refresh from server in background
    axios.get(`/api/assets/${params.id}`, { withCredentials: true })
      .then((res) => setSelectedFormIds(new Set(res.data.data?.formIds || [])))
      .catch(() => {});
  };

  const handleSaveForms = async () => {
    setSavingForms(true);
    try {
      await axios.put(`/api/assets/${params.id}`, { formIds: Array.from(selectedFormIds) }, { withCredentials: true });
      setAssignFormsOpen(false);
      await fetchAsset();
    } catch { /* silent */ }
    finally { setSavingForms(false); }
  };

  // ── Driver Access handlers ──
  const fetchDrivers = useCallback(async () => {
    setDriversLoading(true);
    try {
      const res = await axios.get('/api/drivers?limit=100', { withCredentials: true });
      setDriversList(res.data.data?.items || []);
    } catch { setDriversList([]); }
    finally { setDriversLoading(false); }
  }, []);

  const handleOpenDriverAccess = () => {
    setSelectedDriverIds(new Set(Array.isArray(asset?.driverAccessIds) ? (asset.driverAccessIds as string[]) : []));
    setDriverAccessOpen(true);
    fetchDrivers();
    // Refresh from server in background
    axios.get(`/api/assets/${params.id}`, { withCredentials: true })
      .then((res) => setSelectedDriverIds(new Set(res.data.data?.driverAccessIds || [])))
      .catch(() => {});
  };

  const handleSaveDriverAccess = async () => {
    setSavingDrivers(true);
    try {
      await axios.put(`/api/assets/${params.id}`, { driverAccessIds: Array.from(selectedDriverIds) }, { withCredentials: true });
      setDriverAccessOpen(false);
      await fetchAsset();
    } catch { /* silent */ }
    finally { setSavingDrivers(false); }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-24 mt-1.5" />
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm mb-6">
          <Skeleton className="h-5 w-40 mb-4" />
          <Separator className="mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-16 mb-1.5" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <Skeleton className="h-5 w-32 mb-4" />
          <Separator className="mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-16 mb-1.5" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Asset not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/assets')}>
          Back to Assets
        </Button>
      </div>
    );
  }

  const normalizedStatus = asset.status === 'active' ? 'in_service' : String(asset.status);
  const statusConfig = ASSET_STATUS_CONFIG[(normalizedStatus as AssetStatus)] || {
    label: String(asset.status || ''),
    variant: 'outline' as const,
  };

  // Extract values for type safety in JSX
  const assetName = String(asset.name || '');
  const assetNum = String(asset.assetNumber || '');
  const assetNotes = String(asset.notes || '');
  const assetTypeName = String(asset.assetTypeName || '');
  const teamNames = Array.isArray(asset.teamNames) ? (asset.teamNames as string[]) : [];
  const currency = String(asset.currencyCode || 'USD');
  const odo = asset.currentOdometer != null ? Number(asset.currentOdometer) : null;
  const engineHours = asset.currentEngineHours != null ? Number(asset.currentEngineHours) : null;
  const estCost = asset.estimatedCost != null ? Number(asset.estimatedCost) : null;
  const lastServiceDate = asset.lastServiceDate ? new Date(String(asset.lastServiceDate)) : null;
  const createdAt = asset.createdAt ? new Date(String(asset.createdAt)) : null;
  const photoUrls = Array.isArray(asset.photoUrls) ? (asset.photoUrls as string[]) : [];
  const assetImage = photoUrls[0] || '';
  const nsStatus: SchedStatus = nextService?.status ?? 'no-plan';
  const nsMeta = {
    text: SERVICE_STATUS_TEXT[nsStatus],
    label: SERVICE_STATUS_LABEL[nsStatus],
    bar: SERVICE_STATUS_BAR[nsStatus].bar,
    value: SERVICE_STATUS_BAR[nsStatus].value,
  };
  const prestartPassed = latestPrestartResult != null ? latestPrestartResult !== 'fail' : null;

  return (
    <div className="p-4 md:p-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/assets')}
        className="mb-3 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Assets
      </Button>

      {/* Overview card — header + image/info + tabs, all in one container (Command-style) */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        {/* Header row */}
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{assetName}</h1>
            {assetTypeName && <Badge variant="secondary">{assetTypeName}</Badge>}
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            {prestartPassed != null && (
              <Badge
                className={prestartPassed
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-red-100 text-red-700 hover:bg-red-100'}
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Pre-start {prestartPassed ? 'Passed' : 'Failed'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canInspect && <InspectButton assetId={String(params.id)} />}
            {canEdit && (
              <Button
                variant={normalizedStatus === 'in_service' ? 'destructive' : 'default'}
                onClick={handleToggleStatus}
                disabled={toggling}
              >
                <Power className="h-4 w-4" />
                {toggling
                  ? 'Updating...'
                  : normalizedStatus === 'in_service'
                    ? 'Mark as Under Maintenance'
                    : 'Mark as Active'}
              </Button>
            )}
            {canEdit && (
              <Button onClick={() => router.push(`/assets/${params.id}/edit`)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
            {(canEdit || canAccessForms) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={handleOpenChangeTeam}>
                    <Users className="h-4 w-4" />
                    Change Team
                  </DropdownMenuItem>
                )}
                {canAccessForms && (
                  <DropdownMenuItem onClick={handleOpenAssignForms}>
                    <ClipboardList className="h-4 w-4" />
                    Assign Forms
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <DropdownMenuItem onClick={handleOpenDriverAccess}>
                    <KeyRound className="h-4 w-4" />
                    Driver Access
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        </div>

        {/* Image + info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5">
          {/* Image */}
          <div className="lg:col-span-1">
            <div className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
              {assetImage && !imageError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={assetImage}
                  alt={assetName}
                  className="h-full w-full object-contain"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="flex flex-col items-center text-muted-foreground">
                  <Camera className="h-10 w-10 mb-2" />
                  <span className="text-sm">No image</span>
                </div>
              )}
              <div className="absolute left-3 top-3">
                <Badge variant="secondary">{assetTypeName || 'Asset'}</Badge>
              </div>
              <div className="absolute right-3 top-3">
                <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              {assetNum && <Badge variant="outline" className="font-mono">#{assetNum}</Badge>}
              <h2 className="text-sm font-semibold text-foreground truncate">{assetName}</h2>
            </div>

            {teamNames.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                {teamNames.map((t) => (
                  <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>
                ))}
              </div>
            )}

            {/* Count badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                Services: {counts.services}
              </Badge>
              <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100">
                Faults: {counts.faults}
              </Badge>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                Inspections: {counts.prestarts}
              </Badge>
            </div>

            {/* Next service */}
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Wrench className={cn('h-4 w-4 shrink-0', nsMeta.text)} />
                <span className="text-sm font-medium text-foreground">Next Service</span>
                {nextService ? (
                  <>
                    <span className="text-sm text-muted-foreground truncate">· {nextService.title}</span>
                    {/* Same format as Command: "{nextServiceAt} {unit} ({|value|} {unit} overdue/remaining)". */}
                    {nextService.nextServiceAt != null && (
                      <span className="text-sm font-medium text-foreground">
                        {nextService.nextServiceAt.toLocaleString()} {nextService.unit}
                      </span>
                    )}
                    {nextService.value != null && (
                      <span className={cn('text-xs font-medium', nsMeta.text)}>
                        ({Math.abs(nextService.value).toLocaleString()} {nextService.unit}{' '}
                        {nextService.value < 0 ? 'overdue' : 'remaining'})
                      </span>
                    )}
                  </>
                ) : (
                  <Badge variant="outline" className="text-xs">No plan</Badge>
                )}
              </div>
              {nextService && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', nsMeta.bar)} style={{ width: `${nsMeta.value}%` }} />
                </div>
              )}
              {lastServiceDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  Last service:
                  <span className="font-medium text-foreground">{lastServiceDate.toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs bar (inside the card) */}
        <div className="border-t border-border px-2">
          <div className="flex gap-0 overflow-x-auto">
            {ASSET_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content (inside the card) */}
        <div className="p-5">
          {/* Tab Content */}
      {activeTab === 'details' && (
        <div className="space-y-6">
          {/* Key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Mileage" value={odo != null ? odo.toLocaleString() : '—'} icon={<Gauge />} />
            <StatCard label="Engine Hours" value={engineHours != null ? engineHours.toLocaleString() : '—'} icon={<Clock />} />
            <StatCard label="Estimated Cost" value={estCost != null ? `${currency} ${estCost.toLocaleString()}` : '—'} icon={<DollarSign />} />
            <StatCard label="Last Service" value={lastServiceDate ? lastServiceDate.toLocaleDateString() : '—'} icon={<CalendarClock />} />
          </div>

          {/* Identification */}
          <DetailCard icon={Fingerprint} title="Identification">
            <DetailField label="VIN" value={String(asset.vin || '')} />
            <DetailField label="License Plate" value={String(asset.licensePlate || '')} />
            <DetailField label="Asset Type" value={assetTypeName} />
            <DetailField label="Asset Subtype" value={String(asset.assetSubtype || '')} />
            <DetailField label="Subscription Type" value={String(asset.subscriptionType || '')} />
            <DetailField label="Created" value={createdAt ? createdAt.toLocaleDateString() : ''} />
          </DetailCard>

          {/* Vehicle Specifications */}
          <DetailCard icon={Truck} title="Vehicle Specifications">
            <DetailField label="Make" value={String(asset.make || '')} />
            <DetailField label="Model" value={String(asset.model || '')} />
            <DetailField label="Year" value={asset.year ? String(asset.year) : ''} />
            <DetailField label="Color" value={String(asset.color || '')} />
            <DetailField label="Tire Size" value={String(asset.tireSize || '')} />
          </DetailCard>

          {/* Service History */}
          <DetailCard icon={Wrench} title="Service History">
            <DetailField label="Last Service Date" value={lastServiceDate ? lastServiceDate.toLocaleDateString() : ''} />
            <DetailField label="Last Service Mileage" value={asset.lastServiceMileage != null ? Number(asset.lastServiceMileage).toLocaleString() : ''} />
            <DetailField label="Last Service Engine Hours" value={asset.lastServiceEngineHours != null ? String(asset.lastServiceEngineHours) : ''} />
          </DetailCard>

          {/* Notes */}
          {assetNotes && (
            <DetailCard icon={StickyNote} title="Notes" columns={1}>
              <p className="text-sm text-foreground whitespace-pre-wrap">{assetNotes}</p>
            </DetailCard>
          )}
        </div>
      )}

      {activeTab === 'service' && (
        <AssetServiceTab assetId={String(params.id)} />
      )}

      {activeTab === 'meter' && (
        <AssetMeterTab assetId={String(params.id)} />
      )}

      {activeTab === 'fuel' && (
        <AssetFuelTab assetId={String(params.id)} />
      )}

      {activeTab === 'prestarts' && (
        <AssetPrestartsTab assetId={String(params.id)} />
      )}

      {activeTab === 'faults' && (
        <AssetFaultsTab assetId={String(params.id)} />
      )}

      {activeTab === 'compliance' && (
        <AssetComplianceTab assetId={String(params.id)} />
      )}
        </div>
      </div>

      {/* Change Team Dialog */}
      <Dialog open={changeTeamOpen} onOpenChange={setChangeTeamOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Team</DialogTitle>
            <DialogDescription>Select a team for &quot;{assetName}&quot;.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {teamsLoading ? (
              <div className="flex justify-center py-8"><Spinner size="sm" /></div>
            ) : teamsList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No teams available</p>
            ) : (
              <div className="flex flex-col">
                {teamsList.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setSelectedTeamId(team.id === selectedTeamId ? null : team.id)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 text-sm text-left border-b last:border-0 transition-colors',
                      selectedTeamId === team.id ? 'bg-primary/5' : 'hover:bg-muted/50',
                    )}
                  >
                    <span className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      selectedTeamId === team.id ? 'border-primary' : 'border-muted-foreground/40',
                    )}>
                      {selectedTeamId === team.id && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span className="font-medium text-foreground">{team.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeTeamOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTeam} disabled={savingTeam}>
              {savingTeam ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Forms Dialog */}
      <Dialog open={assignFormsOpen} onOpenChange={setAssignFormsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Forms</DialogTitle>
            <DialogDescription>Select forms for &quot;{assetName}&quot;.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {formsLoading ? (
              <div className="flex justify-center py-8"><Spinner size="sm" /></div>
            ) : formsList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No forms available</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (formsList.every((f) => selectedFormIds.has(f.id))) {
                      setSelectedFormIds(new Set());
                    } else {
                      setSelectedFormIds(new Set(formsList.map((f) => f.id)));
                    }
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-sm w-full text-left border-b hover:bg-muted/50 transition-colors font-medium text-primary"
                >
                  {formsList.every((f) => selectedFormIds.has(f.id)) ? 'Deselect All' : 'Select All'}
                </button>
                {formsList.map((form) => (
                  <label
                    key={form.id}
                    className="flex items-center gap-3 px-4 py-3 text-sm border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedFormIds.has(form.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedFormIds);
                        if (checked) next.add(form.id); else next.delete(form.id);
                        setSelectedFormIds(next);
                      }}
                    />
                    <span className="text-foreground">{form.title}</span>
                  </label>
                ))}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignFormsOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveForms} disabled={savingForms}>
              {savingForms ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Driver Access Dialog */}
      <Dialog open={driverAccessOpen} onOpenChange={setDriverAccessOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Driver Access</DialogTitle>
            <DialogDescription>Select drivers who can access &quot;{assetName}&quot;.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {driversLoading ? (
              <div className="flex justify-center py-8"><Spinner size="sm" /></div>
            ) : driversList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No drivers available</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (driversList.every((d) => selectedDriverIds.has(d.id))) {
                      setSelectedDriverIds(new Set());
                    } else {
                      setSelectedDriverIds(new Set(driversList.map((d) => d.id)));
                    }
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-sm w-full text-left border-b hover:bg-muted/50 transition-colors font-medium text-primary"
                >
                  {driversList.every((d) => selectedDriverIds.has(d.id)) ? 'Deselect All' : 'Select All'}
                </button>
                {driversList.map((driver) => (
                  <label
                    key={driver.id}
                    className="flex items-center gap-3 px-4 py-3 text-sm border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedDriverIds.has(driver.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedDriverIds);
                        if (checked) next.add(driver.id); else next.delete(driver.id);
                        setSelectedDriverIds(next);
                      }}
                    />
                    <span className="text-foreground">{driver.firstName} {driver.lastName}</span>
                  </label>
                ))}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDriverAccessOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDriverAccess} disabled={savingDrivers}>
              {savingDrivers ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
