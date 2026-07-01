'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  ArrowLeft, Pencil, Power, Fuel, Info, Wrench,
  Truck, Gauge, Clock, DollarSign, Fingerprint, StickyNote, CalendarClock,
  Users, ClipboardList, KeyRound, MoreHorizontal,
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
import { InspectButton } from '@/components/inspections/inspect-button';
import { AssetFuelTab } from '@/components/fuel/asset-fuel-tab';
import { AssetServiceTab } from '@/components/assets/asset-service-tab';

const ASSET_TABS = [
  { id: 'details', label: 'Details', icon: Info },
  { id: 'service', label: 'Service', icon: Wrench },
  { id: 'fuel', label: 'Fuel', icon: Fuel },
] as const;

type AssetTabId = (typeof ASSET_TABS)[number]['id'];

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [asset, setAsset] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<AssetTabId>('details');

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

  useEffect(() => {
    if (params.id) fetchAsset();
  }, [params.id, fetchAsset]);

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
      const res = await axios.get('/api/forms?includeSchema=false', { withCredentials: true });
      setFormsList(res.data.data?.items || []);
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

  return (
    <div className="p-6 max-w-4xl">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/assets')}
        className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Assets
      </Button>

      {/* Hero */}
      <div className="rounded-xl border bg-card p-5 shadow-sm mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Truck className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{assetName}</h1>
                <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                {assetNum && <span className="font-mono">#{assetNum}</span>}
                {assetNum && assetTypeName && <span>·</span>}
                {assetTypeName && <span>{assetTypeName}</span>}
              </div>
              {teamNames.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {teamNames.map((t) => (
                    <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <InspectButton assetId={String(params.id)} />
            <Button
              variant={normalizedStatus === 'in_service' ? 'destructive' : 'default'}
              onClick={handleToggleStatus}
              disabled={toggling}
            >
              <Power className="h-4 w-4" />
              {toggling
                ? 'Updating...'
                : normalizedStatus === 'in_service'
                  ? 'Mark as Out of Service'
                  : 'Mark as In Service'}
            </Button>
            <Button onClick={() => router.push(`/assets/${params.id}/edit`)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleOpenChangeTeam}>
                  <Users className="h-4 w-4" />
                  Change Team
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenAssignForms}>
                  <ClipboardList className="h-4 w-4" />
                  Assign Forms
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenDriverAccess}>
                  <KeyRound className="h-4 w-4" />
                  Driver Access
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-0">
          {ASSET_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
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

      {activeTab === 'fuel' && (
        <AssetFuelTab assetId={String(params.id)} />
      )}

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
