"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  Plus,
  Edit,
  Archive,
  ArchiveRestore,
  Trash2,
  Eye,
  Wrench,
  CheckCircle2,
  ClipboardList,
  Package,
  Users,
  Paperclip,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/ui/search-input";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShowArchivedToggle } from "@/components/ui/show-archived-toggle";
import { ArchiveConfirmDialog } from "@/components/ui/archive-confirm-dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { FormSection } from "@/components/ui/form-section";
import { PageHeader } from "@/components/ui/page-header";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { RowActions, RowActionButton } from "@/components/ui/row-actions";
import { MeterTypeSelect } from "@/components/maintenance/service-fields";
import { cn, formatDate } from "@/lib/utils";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { useDataTable } from "@/hooks/use-data-table";
import { WorkOrderForm } from "./work-order-form";
import type {
  WorkOrderRow,
  WOStatusOption,
  LookupOption,
  Pagination,
} from "./types";

export function WorkOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<WorkOrderRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState("all");

  // Dynamic status tabs from API
  const [statusTabs, setStatusTabs] = useState<WOStatusOption[]>([]);

  // Lookup maps
  const [assetMap, setAssetMap] = useState<Record<string, string>>({});
  const [serviceTaskMap, setServiceTaskMap] = useState<Record<string, string>>(
    {},
  );
  const [userMap, setUserMap] = useState<Record<string, string>>({});

  // Table features
  const { hiddenColumnKeys, setHiddenColumnKeys, density, setDensity } =
    useDataTable();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"create" | "edit">("create");
  const [editingOrder, setEditingOrder] = useState<WorkOrderRow | null>(null);

  // Archive state
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivingOrder, setArchivingOrder] = useState<WorkOrderRow | null>(
    null,
  );
  const [archiving, setArchiving] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<WorkOrderRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Complete dialog
  const [completeOrder, setCompleteOrder] = useState<WorkOrderRow | null>(null);

  // Fetch lookup data + status tabs
  const fetchLookups = useCallback(async () => {
    try {
      const [assetsRes, tasksRes, usersRes, statusesRes] = await Promise.all([
        axios.get("/api/assets?limit=100", { withCredentials: true }),
        axios.get("/api/service-tasks?limit=100", { withCredentials: true }),
        axios.get("/api/users?limit=100", { withCredentials: true }),
        axios.get("/api/work-order-statuses", { withCredentials: true }),
      ]);
      const toMap = (items: LookupOption[]) => {
        const map: Record<string, string> = {};
        items.forEach((i) => {
          map[i.id] = i.name;
        });
        return map;
      };
      const assetItems =
        assetsRes.data.data?.items || assetsRes.data.data || [];
      setAssetMap(
        toMap(
          assetItems.map((i: Record<string, unknown>) => ({
            id: i.id as string,
            name: i.name as string,
          })),
        ),
      );
      const taskItems = tasksRes.data.data?.items || tasksRes.data.data || [];
      setServiceTaskMap(
        toMap(
          taskItems.map((i: Record<string, unknown>) => ({
            id: i.id as string,
            name: (i.title as string) || (i.name as string) || "",
          })),
        ),
      );
      const userItems = usersRes.data.data?.items || usersRes.data.data || [];
      setUserMap(
        toMap(
          userItems.map((i: Record<string, unknown>) => ({
            id: i.id as string,
            name:
              (i.name as string) ||
              `${(i.firstName as string) || ""} ${(i.lastName as string) || ""}`.trim() ||
              (i.email as string) ||
              "",
          })),
        ),
      );

      const statusItems = statusesRes.data.data || [];
      setStatusTabs(
        statusItems.map((i: Record<string, unknown>) => ({
          id: i.id as string,
          label: i.label as string,
          color: i.color as string,
          type: (i.type as string) || "open",
          sequence: i.sequence as number,
        })),
      );
    } catch {
      // Silent
    }
  }, []);

  // Fetch work orders
  const fetchOrders = useCallback(
    async (page: number) => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(rowsPerPage));
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (activeTab !== "all") params.set("statusId", activeTab);
        if (showArchived) params.set("showArchived", "true");

        const res = await axios.get(`/api/work-orders?${params.toString()}`, {
          withCredentials: true,
        });
        const data = res.data.data;
        setOrders(data.items || []);
        setPagination(
          data.pagination || {
            page: 1,
            limit: rowsPerPage,
            total: 0,
            hasMore: false,
          },
        );
      } catch {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    },
    [rowsPerPage, debouncedSearch, activeTab, showArchived],
  );

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);
  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  // Panel handlers
  const handleOpenCreate = () => {
    setEditingOrder(null);
    setPanelMode("create");
    setPanelOpen(true);
  };
  const handleOpenEdit = (order: WorkOrderRow) => {
    setEditingOrder(order);
    setPanelMode("edit");
    setPanelOpen(true);
  };
  const handleClosePanel = () => {
    setPanelOpen(false);
    setEditingOrder(null);
  };
  const handleSaved = () => {
    handleClosePanel();
    fetchOrders(panelMode === "create" ? 1 : pagination.page);
  };

  // Complete & sign off
  const handleOpenComplete = (order: WorkOrderRow) => {
    setCompleteOrder(order);
  };
  const handleCompleted = () => {
    setCompleteOrder(null);
    fetchOrders(pagination.page);
  };

  // Archive
  const handleOpenArchive = (order: WorkOrderRow) => {
    setArchivingOrder(order);
    setArchiveDialogOpen(true);
  };

  const handleArchive = async () => {
    if (!archivingOrder) return;
    setArchiving(true);
    try {
      await axios.patch(
        `/api/work-orders/${archivingOrder.id}/archive`,
        { archived: !showArchived },
        { withCredentials: true },
      );
      setArchiveDialogOpen(false);
      setArchivingOrder(null);
      fetchOrders(pagination.page);
    } catch (err) {
      console.error("Failed to archive/unarchive work order:", err);
    } finally {
      setArchiving(false);
    }
  };

  // Delete handlers
  const handleOpenDelete = (order: WorkOrderRow) => {
    setDeletingOrder(order);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingOrder) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/work-orders/${deletingOrder.id}`, {
        withCredentials: true,
      });
      setDeleteDialogOpen(false);
      setDeletingOrder(null);
      fetchOrders(pagination.page);
    } catch (err) {
      console.error("Failed to delete work order:", err);
    } finally {
      setDeleting(false);
    }
  };

  // Build status color map for badges
  const statusColorMap: Record<string, string> = {};
  const statusLabelMap: Record<string, string> = {};
  statusTabs.forEach((s) => {
    statusColorMap[s.id] = s.color;
    statusLabelMap[s.id] = s.label;
  });

  // Column definitions
  const woColumns: DataTableColumn<WorkOrderRow>[] = [
    {
      key: "workOrderNumber",
      header: "WO #",
      label: "WO number",
      pinned: true,
      sortable: true,
      render: (order) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wrench className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground font-mono text-sm">
            {order.workOrderNumber}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      label: "Status",
      pinned: true,
      sortable: true,
      render: (order) =>
        order.isCompleted ? (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border"
            style={{
              backgroundColor: `${statusColorMap[order.statusId] || "#6B7280"}20`,
              borderColor: statusColorMap[order.statusId] || "#6B7280",
              color: statusColorMap[order.statusId] || "#6B7280",
            }}
          >
            {order.statusLabel || statusLabelMap[order.statusId] || "—"}
          </Badge>
        ),
    },
    {
      key: "assetName",
      header: "Asset",
      label: "Asset",
      sortable: true,
      render: (order) => (
        <span className="text-foreground">
          {order.assetName || assetMap[order.assetId] || "—"}
        </span>
      ),
    },
    {
      key: "assigneeName",
      header: "Assignee",
      label: "Assignee",
      sortable: true,
      render: (order) => (
        <span className="text-foreground">{order.assigneeName || "—"}</span>
      ),
    },
    {
      key: "dueDate",
      header: "Due Date",
      label: "Due date",
      sortable: true,
      sortValue: (order) =>
        order.dueDate ? new Date(order.dueDate).getTime() : null,
      render: (order) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(order.dueDate)}
        </span>
      ),
    },
    {
      key: "serviceTaskCount",
      header: "Items",
      label: "Items count",
      render: (order) => (
        <span className="text-muted-foreground">
          {order.serviceTaskIds.length}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      label: "Created",
      sortable: true,
      sortValue: (order) => new Date(order.createdAt).getTime(),
      render: (order) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(order.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (order) => (
        <RowActions>
          {showArchived ? (
            <>
              <RowActionButton
                label="Unarchive"
                icon={<ArchiveRestore />}
                onClick={() => handleOpenArchive(order)}
              />
              <RowActionButton
                label="Delete"
                tone="destructive"
                icon={<Trash2 />}
                onClick={() => handleOpenDelete(order)}
              />
            </>
          ) : (
            <>
              <RowActionButton
                label="View"
                tone="primary"
                icon={<Eye />}
                onClick={() =>
                  router.push(`/maintenance/work-orders/${order.id}`)
                }
              />
              <RowActionButton
                label="Edit"
                icon={<Edit />}
                onClick={() => handleOpenEdit(order)}
              />
              <RowActionButton
                label="Archive"
                tone="destructive"
                icon={<Archive />}
                onClick={() => handleOpenArchive(order)}
              />
            </>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="relative flex h-full">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <PageHeader
          title="Work Orders"
          description="Schedule, assign, and track maintenance and repair jobs"
          count={pagination.total}
        >
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            Create Work Order
          </Button>
        </PageHeader>

        {/* Dynamic Status Tabs + Archive Toggle */}
        <div className="px-6 pb-4 flex items-center gap-4">
          <FilterTabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              { value: "all", label: "All" },
              ...statusTabs.map((tab) => ({
                value: tab.id,
                label: tab.label,
                color: tab.color,
              })),
            ]}
          />
          <ShowArchivedToggle
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
        </div>

        <div className="flex-1 overflow-auto px-6 pb-6">
          <DataTableToolbar
            columns={woColumns}
            hiddenColumnKeys={hiddenColumnKeys}
            onHiddenColumnKeysChange={setHiddenColumnKeys}
            density={density}
            onDensityChange={setDensity}
            searchNode={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search work orders..."
              />
            }
          />
          <DataTable<WorkOrderRow>
            columns={woColumns}
            data={orders}
            pagination={pagination}
            loading={loading}
            rowsPerPage={rowsPerPage}
            onPageChange={fetchOrders}
            onRowsPerPageChange={setRowsPerPage}
            onRowClick={
              showArchived
                ? undefined
                : (order) => router.push(`/maintenance/work-orders/${order.id}`)
            }
            rowKey={(o) => o.id}
            density={density}
            hiddenColumnKeys={hiddenColumnKeys}
            emptyMessage={
              debouncedSearch
                ? "No work orders match your search."
                : activeTab !== "all"
                  ? `No work orders with this status.`
                  : 'No work orders yet. Click "Create Work Order" to create one.'
            }
          />
        </div>
      </div>

      {/* Overlay backdrop */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={handleClosePanel}
        />
      )}

      {/* Right Panel — WO Form (slide-out) */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-[560px] border-l border-border bg-background transition-transform duration-300",
          panelOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {panelOpen && (
          <WorkOrderForm
            mode={panelMode}
            workOrder={editingOrder}
            onClose={handleClosePanel}
            onSaved={handleSaved}
          />
        )}
      </div>

      {/* Archive Dialog */}
      <ArchiveConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        itemName={archivingOrder?.workOrderNumber}
        action={showArchived ? "unarchive" : "archive"}
        onConfirm={handleArchive}
        loading={archiving}
      />

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingOrder?.workOrderNumber}
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* Complete & Sign Off Dialog (remounts per order so the form is always fresh) */}
      {completeOrder && (
        <CompleteWorkOrderDialog
          key={completeOrder.id}
          order={completeOrder}
          onClose={() => setCompleteOrder(null)}
          onCompleted={handleCompleted}
        />
      )}
    </div>
  );
}

/** Complete & sign-off dialog — captures meter reading and sign-off notes. */
function CompleteWorkOrderDialog({
  order,
  onClose,
  onCompleted,
}: {
  order: WorkOrderRow;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [meter, setMeter] = useState("");
  const [meterType, setMeterType] = useState("odometer");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleComplete = async () => {
    if (!order) return;
    setError("");
    try {
      setSaving(true);
      await axios.put(
        `/api/work-orders/${order.id}/complete`,
        {
          meterType,
          meterAtService: meter ? parseFloat(meter) : undefined,
          notes: notes.trim() || undefined,
        },
        { withCredentials: true },
      );
      onCompleted();
    } catch {
      setError("Failed to complete work order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Complete {order.workOrderNumber}</DialogTitle>
          <DialogDescription>
            Closes the work order, corrects its linked defects, and returns the
            asset to service.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cmpMeter">Meter reading</Label>
              <Input
                id="cmpMeter"
                type="number"
                min="0"
                value={meter}
                onChange={(e) => setMeter(e.target.value)}
                placeholder="e.g. 50000"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Meter type</Label>
              <MeterTypeSelect value={meterType} onChange={setMeterType} />
            </div>
          </div>

          <div>
            <Label htmlFor="cmpNotes">Notes</Label>
            <Textarea
              id="cmpNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1.5"
              placeholder="Sign-off notes..."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleComplete} disabled={saving}>
            {saving ? "Completing..." : "Complete & Sign Off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
