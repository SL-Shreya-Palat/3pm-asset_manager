"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  Plus,
  Edit,
  Trash2,
  User,
  Eye,
  ClipboardCheck,
  FileText,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { RowActions, RowActionButton } from "@/components/ui/row-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ShowArchivedToggle } from "@/components/ui/show-archived-toggle";
import { ArchiveConfirmDialog } from "@/components/ui/archive-confirm-dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { useDataTable } from "@/hooks/use-data-table";
import { useConnection } from "@/hooks/use-connection";
import { formatDate } from "@/lib/utils";
import {
  SourceBadge,
  CommandManagedBanner,
} from "@/components/command/source-badge";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import { useRoleAccess } from "@/hooks/use-role-access";
import { checkRecordOwnership } from "@/lib/rbac";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { Permissions } from "@/consts/permissions";
import type { DriverRow, TeamOption, Pagination } from "./types";

const DRIVER_FORM_ID = "people.drivers.driver";

/**
 * Secondary driver fields — available as toggleable columns (so every field on
 * the driver form is reachable from the Columns control) but hidden by default
 * to keep the table readable.
 */
const DEFAULT_HIDDEN_DRIVER_COLUMNS = [
  "dateOfBirth",
  "homePhone",
  "workPhone",
  "employeeNumber",
  "driverLicense",
  "licenseClass",
  "ratePerUnit",
  "healthCertificate",
  "notes",
  "otherNotes",
];

export function DriversPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { hasFullAccess, permissionIndex } = useRoleAccess();

  // Permission levels for row-level "OWN" checks
  const editLevel = hasFullAccess
    ? "ALL"
    : permissionIndex.getEditLevel(DRIVER_FORM_ID);
  const archiveLevel = hasFullAccess
    ? "ALL"
    : permissionIndex.getArchiveLevel(DRIVER_FORM_ID);
  const deleteLevel = hasFullAccess
    ? "ALL"
    : permissionIndex.getDeleteLevel(DRIVER_FORM_ID);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Connected to Command → drivers are mastered there (read-only, auto-synced).
  const { connected } = useConnection();

  // Table features. Secondary form fields start hidden but stay toggleable.
  const { hiddenColumnKeys, setHiddenColumnKeys, density, setDensity } =
    useDataTable({ initialHiddenColumnKeys: DEFAULT_HIDDEN_DRIVER_COLUMNS });

  // Teams for display
  const [teams, setTeams] = useState<TeamOption[]>([]);

  // Inspect dialog
  const [inspectDialogOpen, setInspectDialogOpen] = useState(false);
  const [inspectDriver, setInspectDriver] = useState<DriverRow | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectForms, setInspectForms] = useState<
    { formId: string; title: string }[]
  >([]);

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingDriver, setArchivingDriver] = useState<DriverRow | null>(
    null,
  );
  const [archiving, setArchiving] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDriver, setDeletingDriver] = useState<DriverRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch drivers ──
  const fetchDrivers = useCallback(
    async (page: number) => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(rowsPerPage));
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (showArchived) params.set("showArchived", "true");
        const res = await axios.get(`/api/drivers?${params.toString()}`, {
          withCredentials: true,
        });
        const data = res.data.data;
        setDrivers(data.items || []);
        setPagination(
          data.pagination || {
            page: 1,
            limit: rowsPerPage,
            total: 0,
            hasMore: false,
          },
        );
      } catch (err) {
        console.error("Failed to fetch drivers:", err);
        setDrivers([]);
      } finally {
        setLoading(false);
      }
    },
    [rowsPerPage, debouncedSearch, showArchived],
  );

  useEffect(() => {
    fetchDrivers(1);
  }, [fetchDrivers]);

  // Fetch teams for display
  useEffect(() => {
    async function loadTeams() {
      try {
        const res = await axios.get("/api/teams?limit=100", {
          withCredentials: true,
        });
        setTeams(res.data.data?.items || []);
      } catch {
        setTeams([]);
      }
    }
    loadTeams();
  }, []);

  // Archive handlers
  const handleOpenArchive = (driver: DriverRow) => {
    setArchivingDriver(driver);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingDriver) return;
    setArchiving(true);
    try {
      const archived = !showArchived; // If viewing active items, we archive. If viewing archived, we unarchive.
      await axios.patch(
        `/api/drivers/${archivingDriver.id}/archive`,
        { archived },
        { withCredentials: true },
      );
      setArchiveDialogOpen(false);
      setArchivingDriver(null);
      fetchDrivers(pagination.page);
    } catch (err) {
      console.error("Failed to archive/unarchive driver:", err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
  const handleOpenDelete = (driver: DriverRow) => {
    setDeletingDriver(driver);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingDriver) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/drivers/${deletingDriver.id}`, {
        withCredentials: true,
      });
      setDeleteDialogOpen(false);
      setDeletingDriver(null);
      fetchDrivers(pagination.page);
    } catch (err) {
      console.error("Failed to delete driver:", err);
    } finally {
      setDeleting(false);
    }
  };

  // ── Inspection ──
  const handleOpenInspect = async (driver: DriverRow) => {
    setInspectDriver(driver);
    setInspectDialogOpen(true);
    setInspectLoading(true);
    try {
      // Auto-seed pre-start forms (idempotent — skips if already seeded)
      await axios
        .post("/api/forms/seed-prestart", {}, { withCredentials: true })
        .catch(() => {});
      const res = await axios.get(
        "/api/forms?status=published&includeSchema=false",
        { withCredentials: true },
      );
      const allForms = res.data?.data?.items || [];
      // Show every DRIVER-type form (not just the seeded wellness template), so
      // custom driver inspection forms are launchable too.
      const driverForms = allForms
        .filter((f: Record<string, unknown>) => f.inspectionType === "driver")
        .map((f: Record<string, unknown>) => ({
          formId: String(f.formId || f.id),
          title: String(f.title || f.formTitle || "Untitled form"),
        }));
      setInspectForms(driverForms);
    } catch {
      setInspectForms([]);
    } finally {
      setInspectLoading(false);
    }
  };

  // ── Team name helper ──
  const getTeamName = (teamId?: string) => {
    if (!teamId) return "—";
    const team = teams.find((t) => t.id === teamId);
    return team?.name || "—";
  };

  // ── Navigate to driver detail page ──
  const handleViewDriver = (driver: DriverRow) => {
    router.push(`/people/drivers/${driver.id}`);
  };

  // ── Column definitions ──
  const driverColumns: DataTableColumn<DriverRow>[] = [
    {
      key: "name",
      header: "Driver",
      label: "Driver Name",
      pinned: true,
      sortable: true,
      sortValue: (driver) => `${driver.firstName} ${driver.lastName}`,
      render: (driver) => (
        <div className="flex items-center gap-3">
          {driver.photoUrl ? (
            <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden">
              <img
                src={driver.photoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </div>
          )}
          <span className="font-medium text-foreground">
            {driver.firstName} {driver.lastName}
          </span>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      label: "Email",
      sortable: true,
      render: (driver) => (
        <span className="text-muted-foreground">{driver.email || "—"}</span>
      ),
    },
    {
      key: "mobileNumber",
      header: "Mobile",
      label: "Mobile Number",
      render: (driver) => (
        <span className="text-muted-foreground">
          {driver.mobileNumber || "—"}
        </span>
      ),
    },
    {
      key: "teamId",
      header: "Team",
      label: "Team",
      sortable: true,
      sortValue: (driver) => getTeamName(driver.teamId),
      render: (driver) => (
        <span className="text-muted-foreground">
          {getTeamName(driver.teamId)}
        </span>
      ),
    },
    {
      key: "licenseNumber",
      header: "License #",
      label: "License Number",
      sortable: true,
      render: (driver) => (
        <span className="text-muted-foreground">
          {driver.licenseNumber || "—"}
        </span>
      ),
    },
    {
      key: "dateOfBirth",
      header: "Date of Birth",
      label: "Date of Birth",
      sortable: true,
      sortValue: (driver) =>
        driver.dateOfBirth ? new Date(driver.dateOfBirth).getTime() : null,
      render: (driver) => (
        <span className="text-muted-foreground text-xs">
          {driver.dateOfBirth ? formatDate(driver.dateOfBirth) : "—"}
        </span>
      ),
    },
    {
      key: "homePhone",
      header: "Home Phone",
      label: "Home Phone",
      render: (driver) => (
        <span className="text-muted-foreground">{driver.homePhone || "—"}</span>
      ),
    },
    {
      key: "workPhone",
      header: "Work Phone",
      label: "Work Phone",
      render: (driver) => (
        <span className="text-muted-foreground">{driver.workPhone || "—"}</span>
      ),
    },
    {
      key: "employeeNumber",
      header: "Employee #",
      label: "Employee Number",
      sortable: true,
      render: (driver) => (
        <span className="text-muted-foreground font-mono text-xs">
          {driver.employeeNumber || "—"}
        </span>
      ),
    },
    {
      key: "driverLicense",
      header: "Driver License",
      label: "Driver License",
      render: (driver) => (
        <span className="text-muted-foreground">
          {driver.driverLicense || "—"}
        </span>
      ),
    },
    {
      key: "licenseClass",
      header: "License Class",
      label: "License Class",
      render: (driver) => (
        <span className="text-muted-foreground">
          {driver.licenseClass || "—"}
        </span>
      ),
    },
    {
      key: "ratePerUnit",
      header: "Rate",
      label: "Rate per mi/hr",
      sortable: true,
      sortValue: (driver) => driver.ratePerUnit ?? null,
      render: (driver) => (
        <span className="text-muted-foreground">
          {driver.ratePerUnit != null
            ? `${driver.rateCurrency || ""} ${driver.ratePerUnit}`.trim()
            : "—"}
        </span>
      ),
    },
    {
      key: "healthCertificate",
      header: "Health Certificate",
      label: "Health Certificate",
      render: (driver) => (
        <span className="text-muted-foreground">
          {driver.healthCertificate || "—"}
        </span>
      ),
    },
    {
      key: "notes",
      header: "Notes",
      label: "Notes",
      render: (driver) => (
        <span className="text-muted-foreground truncate max-w-[200px] inline-block">
          {driver.notes || "—"}
        </span>
      ),
    },
    {
      key: "otherNotes",
      header: "Other Notes",
      label: "Other Notes",
      render: (driver) => (
        <span className="text-muted-foreground truncate max-w-[200px] inline-block">
          {driver.otherNotes || "—"}
        </span>
      ),
    },
    {
      key: "source",
      header: "Source",
      label: "Source",
      render: (driver) => <SourceBadge source={driver.source} />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (driver) => {
        // Command-mastered drivers are read-only here — no Edit/Archive.
        const isCommandRow = connected && driver.source === "command";
        return (
          <RowActions>
            {!showArchived && (
              <>
                <RowActionButton
                  label="Inspect"
                  icon={<ClipboardCheck />}
                  onClick={() => handleOpenInspect(driver)}
                />
                <RowActionButton
                  label="View"
                  tone="primary"
                  icon={<Eye />}
                  onClick={() => handleViewDriver(driver)}
                />
                {!isCommandRow && (
                  <>
                    {checkRecordOwnership(
                      editLevel,
                      driver.createdBy,
                      user?.id,
                    ) && (
                      <PermissionGuard
                        permission={Permissions.people.drivers.form.edit}
                      >
                        <RowActionButton
                          label="Edit"
                          icon={<Edit />}
                          onClick={() =>
                            router.push(`/people/drivers/${driver.id}/edit`)
                          }
                        />
                      </PermissionGuard>
                    )}
                    {checkRecordOwnership(
                      archiveLevel,
                      driver.createdBy,
                      user?.id,
                    ) && (
                      <PermissionGuard
                        permission={Permissions.people.drivers.form.archive}
                      >
                        <RowActionButton
                          label="Archive"
                          icon={<Archive />}
                          onClick={() => handleOpenArchive(driver)}
                        />
                      </PermissionGuard>
                    )}
                  </>
                )}
              </>
            )}
            {showArchived && (
              <>
                {checkRecordOwnership(
                  archiveLevel,
                  driver.createdBy,
                  user?.id,
                ) && (
                  <PermissionGuard
                    permission={Permissions.people.drivers.form.archive}
                  >
                    <RowActionButton
                      label="Unarchive"
                      icon={<ArchiveRestore />}
                      onClick={() => handleOpenArchive(driver)}
                    />
                  </PermissionGuard>
                )}
                {checkRecordOwnership(
                  deleteLevel,
                  driver.createdBy,
                  user?.id,
                ) && (
                  <PermissionGuard
                    permission={Permissions.people.drivers.form.delete}
                  >
                    <RowActionButton
                      label="Delete"
                      tone="destructive"
                      icon={<Trash2 />}
                      onClick={() => handleOpenDelete(driver)}
                    />
                  </PermissionGuard>
                )}
              </>
            )}
          </RowActions>
        );
      },
    },
  ];

  // Hide the Source column when standalone (every row would just read "Local").
  const columns = connected
    ? driverColumns
    : driverColumns.filter((c) => c.key !== "source");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader
        title="Drivers"
        description="Manage driver profiles, licences, and asset assignments"
        count={pagination.total}
      >
        {!connected && (
          <PermissionGuard permission={Permissions.people.drivers.form.create}>
            <Button onClick={() => router.push("/people/drivers/new")}>
              <Plus className="h-4 w-4" />
              Add Driver
            </Button>
          </PermissionGuard>
        )}
      </PageHeader>

      <div className="space-y-3 px-6 pb-3">
        {connected && <CommandManagedBanner />}
        <ShowArchivedToggle
          checked={showArchived}
          onCheckedChange={setShowArchived}
        />
      </div>

      {/* Toolbar + Table */}
      <div className="flex-1 overflow-auto px-4 pb-6 sm:px-6">
        <DataTableToolbar
          columns={columns}
          hiddenColumnKeys={hiddenColumnKeys}
          onHiddenColumnKeysChange={setHiddenColumnKeys}
          density={density}
          onDensityChange={setDensity}
          afterControls={
            <ShowArchivedToggle
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
          }
          searchNode={
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search drivers..."
            />
          }
        />
        <DataTable<DriverRow>
          columns={columns}
          data={drivers}
          pagination={pagination}
          loading={loading}
          rowsPerPage={rowsPerPage}
          onPageChange={fetchDrivers}
          onRowsPerPageChange={setRowsPerPage}
          onRowClick={showArchived ? undefined : handleViewDriver}
          rowKey={(d) => d.id}
          density={density}
          hiddenColumnKeys={hiddenColumnKeys}
          emptyMessage={
            debouncedSearch
              ? "No drivers match your search."
              : 'No drivers yet. Click "Add Driver" to create one.'
          }
        />
      </div>

      {/* Archive Driver Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={
          archivingDriver
            ? `${archivingDriver.firstName} ${archivingDriver.lastName}`
            : undefined
        }
        action={showArchived ? "unarchive" : "archive"}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Driver Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={
          deletingDriver
            ? `${deletingDriver.firstName} ${deletingDriver.lastName}`
            : undefined
        }
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* Inspect Driver Dialog */}
      <Dialog open={inspectDialogOpen} onOpenChange={setInspectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Inspection</DialogTitle>
            <DialogDescription>
              {inspectDriver
                ? `Select a form to inspect ${inspectDriver.firstName} ${inspectDriver.lastName}.`
                : "Select a form to begin the inspection."}
            </DialogDescription>
          </DialogHeader>

          {inspectLoading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner />
            </div>
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
                    router.push(
                      `/inspections/fill?driverId=${inspectDriver?.id}&formId=${f.formId}`,
                    );
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
