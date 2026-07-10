'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  ArrowLeft,
  SquarePen,
  Archive,
  User,
  Info,
  ClipboardCheck,
  FileText,
  Mail,
  Phone,
  Briefcase,
  CreditCard,
  StickyNote,
  Users,
  Calendar,
  Shield,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { DetailCard, DetailField } from '@/components/ui/detail-field';
import { formatDate } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ArchiveConfirmDialog } from '@/components/ui/archive-confirm-dialog';
import { DriverInspectionTab } from '@/components/drivers/driver-inspection-tab';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/use-role-access';
import { checkRecordOwnership } from '@/lib/rbac';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Permissions } from '@/consts/permissions';

const DRIVER_TABS = [
  { id: 'details', label: 'Details', icon: Info },
  { id: 'inspections', label: 'Inspections', icon: ClipboardCheck },
] as const;

type DriverTabId = (typeof DRIVER_TABS)[number]['id'];

const DRIVER_FORM_ID = 'people.drivers.driver';

export default function DriverDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();
  const editLevel = hasFullAccess ? 'ALL' : permissionIndex.getEditLevel(DRIVER_FORM_ID);
  const archiveLevel = hasFullAccess ? 'ALL' : permissionIndex.getArchiveLevel(DRIVER_FORM_ID);

  const [driver, setDriver] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DriverTabId>('details');

  // Team name
  const [teamName, setTeamName] = useState<string>('');

  // Archive dialog
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Inspect dialog
  const [inspectDialogOpen, setInspectDialogOpen] = useState(false);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectForms, setInspectForms] = useState<{ formId: string; title: string }[]>([]);

  // Fitness flag
  const [markingFit, setMarkingFit] = useState(false);

  const fetchDriver = useCallback(async () => {
    try {
      const res = await axios.get(`/api/drivers/${params.id}`, { withCredentials: true });
      setDriver(res.data.data);
    } catch {
      setDriver(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) fetchDriver();
  }, [params.id, fetchDriver]);

  // Fetch team name when driver loads
  useEffect(() => {
    if (!driver?.teamId) { setTeamName(''); return; }
    (async () => {
      try {
        const res = await axios.get('/api/teams?limit=100', { withCredentials: true });
        const teams = res.data.data?.items || [];
        const t = teams.find((team: { id: string }) => team.id === driver.teamId);
        setTeamName(t?.name || '');
      } catch {
        setTeamName('');
      }
    })();
  }, [driver?.teamId]);

  // ── Archive handler ──
  const handleArchive = async () => {
    setArchiving(true);
    try {
      await axios.patch(`/api/drivers/${params.id}/archive`, { archived: true }, { withCredentials: true });
      router.push('/people/drivers');
    } catch (err) {
      console.error('Failed to archive driver:', err);
    } finally {
      setArchiving(false);
    }
  };

  // ── Mark-fit handler (clears the unfit flag) ──
  const handleMarkFit = async () => {
    setMarkingFit(true);
    try {
      await axios.post(`/api/drivers/${params.id}/fitness`, { status: 'fit' }, { withCredentials: true });
      await fetchDriver();
    } catch (err) {
      console.error('Failed to mark driver fit:', err);
    } finally {
      setMarkingFit(false);
    }
  };

  // ── Inspect handler ──
  const handleOpenInspect = async () => {
    setInspectDialogOpen(true);
    setInspectLoading(true);
    try {
      // Auto-seed pre-start forms (idempotent — skips if already seeded)
      await axios.post('/api/forms/seed-prestart', {}, { withCredentials: true }).catch(() => {});
      const res = await axios.get('/api/forms?status=published&includeSchema=false', { withCredentials: true });
      const allForms = res.data?.data?.items || [];
      // Show every DRIVER-type form (not just the seeded wellness template).
      const driverForms = allForms
        .filter((f: Record<string, unknown>) => f.inspectionType === 'driver')
        .map((f: Record<string, unknown>) => ({
          formId: String(f.formId || f.id),
          title: String(f.title || f.formTitle || 'Untitled form'),
        }));
      setInspectForms(driverForms);
    } catch {
      setInspectForms([]);
    } finally {
      setInspectLoading(false);
    }
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
            {Array.from({ length: 8 }).map((_, i) => (
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

  if (!driver) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Driver not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/people/drivers')}>
          Back to Drivers
        </Button>
      </div>
    );
  }

  const firstName = String(driver.firstName || '');
  const lastName = String(driver.lastName || '');
  const fullName = `${firstName} ${lastName}`.trim();
  const email = String(driver.email || '');
  const photoUrl = String(driver.photoUrl || '');
  const notes = String(driver.notes || '');
  const otherNotes = String(driver.otherNotes || '');
  const mobileNumber = String(driver.mobileNumber || '');
  const homePhone = String(driver.homePhone || '');
  const workPhone = String(driver.workPhone || '');
  const dateOfBirth = driver.dateOfBirth ? formatDate(String(driver.dateOfBirth)) : '';
  const employeeNumber = String(driver.employeeNumber || '');
  const ratePerUnit = driver.ratePerUnit != null ? String(driver.ratePerUnit) : '';
  const driverLicense = String(driver.driverLicense || '');
  const licenseClass = String(driver.licenseClass || '');
  const licenseNumber = String(driver.licenseNumber || '');
  const healthCertificate = String(driver.healthCertificate || '');
  const createdAt = driver.createdAt ? formatDate(String(driver.createdAt)) : '';
  const createdBy = driver.createdBy ? String(driver.createdBy) : null;

  const isUnfit = driver.fitnessStatus === 'unfit';
  const fitnessFlag = (driver.fitnessFlag as {
    severity?: string;
    reasons?: string[];
    date?: string;
  } | null) || null;
  const flagDate = fitnessFlag?.date ? new Date(fitnessFlag.date).toLocaleString() : '';
  const flagReasons = Array.isArray(fitnessFlag?.reasons) ? fitnessFlag!.reasons : [];

  return (
    <div className="p-6 max-w-4xl">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/people/drivers')}
        className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Drivers
      </Button>

      {/* Hero */}
      <div className="rounded-xl border bg-card p-5 shadow-sm mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {photoUrl ? (
              <div className="h-14 w-14 shrink-0 rounded-full overflow-hidden border">
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-7 w-7" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{fullName}</h1>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                {employeeNumber && <span className="font-mono">#{employeeNumber}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {teamName && (
                  <Badge variant="secondary" className="font-normal">{teamName}</Badge>
                )}
                {isUnfit && (
                  <Badge className="border-red-300 bg-red-100 font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Unfit for duty
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={handleOpenInspect} title="Inspect">
              <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </Button>
            {checkRecordOwnership(editLevel, createdBy, user?.id) && (
              <PermissionGuard permission={Permissions.people.drivers.form.edit}>
                <Button variant="ghost" size="icon" onClick={() => router.push(`/people/drivers/${params.id}/edit`)} title="Edit">
                  <SquarePen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </Button>
              </PermissionGuard>
            )}
            {checkRecordOwnership(archiveLevel, createdBy, user?.id) && (
              <PermissionGuard permission={Permissions.people.drivers.form.archive}>
                <Button variant="ghost" size="icon" onClick={() => setArchiveDialogOpen(true)} title="Archive">
                  <Archive className="h-5 w-5 text-muted-foreground" />
                </Button>
              </PermissionGuard>
            )}
          </div>
        </div>
      </div>

      {/* Unfit-for-duty banner */}
      {isUnfit && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-200">
                  Unfit for duty
                  {fitnessFlag?.severity && (
                    <span className="rounded-full bg-red-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800 dark:bg-red-900 dark:text-red-200">
                      {fitnessFlag.severity} severity
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-300/80">
                  Flagged from a failed wellness check{flagDate ? ` on ${flagDate}` : ''}.
                </p>
                {flagReasons.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-red-700 dark:text-red-300">
                    {flagReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkFit}
              disabled={markingFit}
              className="shrink-0 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              {markingFit ? 'Saving...' : 'Mark fit for duty'}
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-0">
          {DRIVER_TABS.map((tab) => {
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

      {/* Tab content */}
      {activeTab === 'details' && (
        <div className="space-y-6">
          {/* Contact Information */}
          <DetailCard icon={Mail} title="Contact Information">
            <DetailField label="Email" value={email} icon={Mail} />
            <DetailField label="Mobile Number" value={mobileNumber} icon={Phone} />
            <DetailField label="Home Phone" value={homePhone} icon={Phone} />
            <DetailField label="Work Phone" value={workPhone} icon={Phone} />
          </DetailCard>

          {/* Personal Information */}
          <DetailCard icon={User} title="Personal Information">
            <DetailField label="First Name" value={firstName} />
            <DetailField label="Last Name" value={lastName} />
            <DetailField label="Date of Birth" value={dateOfBirth} icon={Calendar} />
            <DetailField label="Team" value={teamName} icon={Users} />
          </DetailCard>

          {/* Employment Details */}
          <DetailCard icon={Briefcase} title="Employment Details">
            <DetailField label="Employee Number" value={employeeNumber} />
            <DetailField label="Rate per mi/hr" value={ratePerUnit} />
            <DetailField label="Created" value={createdAt} icon={Calendar} />
          </DetailCard>

          {/* License & Certification */}
          <DetailCard icon={CreditCard} title="License & Certification">
            <DetailField label="Driver License" value={driverLicense} icon={Shield} />
            <DetailField label="License Class" value={licenseClass} />
            <DetailField label="License Number" value={licenseNumber} />
            <DetailField label="Health Certificate" value={healthCertificate} />
          </DetailCard>

          {/* Notes */}
          {(notes || otherNotes) && (
            <DetailCard icon={StickyNote} title="Notes" columns={1}>
              {notes && <p className="text-sm text-foreground whitespace-pre-wrap">{notes}</p>}
              {notes && otherNotes && <Separator />}
              {otherNotes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Other Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{otherNotes}</p>
                </div>
              )}
            </DetailCard>
          )}
        </div>
      )}

      {activeTab === 'inspections' && (
        <DriverInspectionTab driverId={String(params.id)} />
      )}

      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={fullName}
        action="archive"
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Inspect Dialog */}
      <Dialog open={inspectDialogOpen} onOpenChange={setInspectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Inspection</DialogTitle>
            <DialogDescription>
              Select a form to inspect {fullName}.
            </DialogDescription>
          </DialogHeader>

          {inspectLoading ? (
            <div className="flex items-center justify-center py-10"><Spinner /></div>
          ) : inspectForms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No inspection forms found. Please seed pre-start forms first.
            </p>
          ) : (
            <div className="space-y-2 py-1 max-h-80 overflow-y-auto">
              {inspectForms.map((f) => (
                <button
                  key={f.formId}
                  onClick={() => {
                    setInspectDialogOpen(false);
                    router.push(`/inspections/fill?driverId=${params.id}&formId=${f.formId}`);
                  }}
                  className="w-full flex items-center gap-3 rounded-md border p-3 text-left hover:bg-muted transition-colors"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{f.title}</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
