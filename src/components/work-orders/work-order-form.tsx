'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
  X, Trash2, Plus, Package,
  Truck, Wrench, Users, Calendar, Flag, AlignLeft, Paperclip, AlertTriangle,
} from 'lucide-react';
import { Button, LoadingButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FormSection } from '@/components/ui/form-section';
import { AttachmentUploader, type UploadedFile } from '@/components/ui/attachment-uploader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { showSuccessToast, showErrorToast } from '@/lib/toastUtils';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useAuth } from '@/hooks/useAuth';
import type {
  WorkOrderRow,
  LookupOption,
  VendorLookup,
  UserLookup,
  WOStatusOption,
  PartLookup,
} from './types';

interface PartLine {
  partId: string | null;
  partName: string;
  partNumber: string;
  quantity: number;
  unitCost: number;
  /** 'command' lines consume Command's ledger; their cost is Command's. */
  source?: string;
  commandStockId?: string | null;
  /** Frozen once the consumption was applied in Command. */
  pushedToCommand?: boolean;
}

/** Stable row key — direct Command lines have no local partId. */
const partLineKey = (p: { partId: string | null; commandStockId?: string | null }) =>
  p.partId || p.commandStockId || '';

/** An open defect that this WO can be created to correct. */
interface DefectLookup {
  id: string;
  defectNumber: string;
  name: string;
  status: string;
}

/** An open fault that this WO can be created to resolve. */
interface FaultLookup {
  id: string;
  faultNumber: string;
  title: string;
  status: string;
}

/** Map a defect status to a Badge variant. */
function defectStatusBadge(status: string): 'default' | 'secondary' | 'success' | 'warning' {
  if (status === 'corrected') return 'success';
  if (status === 'in_progress') return 'default';
  if (status === 'no_correction_needed') return 'secondary';
  return 'warning'; // new
}

/** Map a fault status to a Badge variant. */
function faultStatusBadge(status: string): 'default' | 'secondary' | 'success' | 'warning' {
  if (status === 'resolved') return 'success';
  if (status === 'in_progress') return 'default';
  if (status === 'wont_fix') return 'secondary';
  return 'warning'; // open
}

interface WorkOrderFormProps {
  mode: 'create' | 'edit';
  workOrder?: WorkOrderRow | null;
  onClose: () => void;
  onSaved: () => void;
  /** 'defect'/'fault'/'service' when raised to correct a defect, fault, or scheduled service — prefills + locks asset, defaults to mechanic, makes items optional. */
  source?: 'manual' | 'defect' | 'fault' | 'service';
  /** Pre-selected asset (create mode). */
  initialAssetId?: string;
  /** Defects this WO will correct (create mode, source='defect'). */
  initialDefectIds?: string[];
  /** Faults this WO will resolve (create mode, source='fault'). */
  initialFaultIds?: string[];
  /** Service task(s) this WO performs (create mode, source='service'). */
  initialServiceTaskIds?: string[];
  /** Prefilled description (create mode). */
  initialDescription?: string;
  /** Lock the asset selector (used when raised from a specific defect/fault/service). */
  lockAsset?: boolean;
}

type AssigneeTab = 'vendor' | 'mechanic' | 'third_party';

export function WorkOrderForm({
  mode,
  workOrder,
  onClose,
  onSaved,
  source = 'manual',
  initialAssetId,
  initialDefectIds,
  initialFaultIds,
  initialServiceTaskIds,
  initialDescription,
  lockAsset = false,
}: WorkOrderFormProps) {
  const router = useRouter();
  const { user } = useAuth();
  // Mechanics get a simplified, mostly read-only editor (status + attachments only).
  const isMechanic = user?.tenant?.isMechanic === true;
  // Defect/fault/service-sourced covers raising a WO from one of these (create) AND
  // later editing that WO (its stored source), so items stay optional in both cases.
  const isDefectSourced = source === 'defect' || workOrder?.source === 'defect';
  const isFaultSourced = source === 'fault' || workOrder?.source === 'fault';
  const isServiceSourced = source === 'service' || workOrder?.source === 'service';
  const isItemsOptional = isDefectSourced || isFaultSourced || isServiceSourced;
  const isPrefillSourced = isDefectSourced || isFaultSourced || isServiceSourced;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields — prefill asset + default to mechanic when raised from a defect/fault/service.
  const [assetId, setAssetId] = useState(mode === 'create' && isPrefillSourced ? (initialAssetId || '') : '');
  const [serviceTaskIds, setServiceTaskIds] = useState<string[]>(
    mode === 'create' ? (initialServiceTaskIds || []) : [],
  );
  const [assigneeTab, setAssigneeTab] = useState<AssigneeTab>(
    mode === 'create' && isPrefillSourced ? 'mechanic' : 'vendor',
  );
  const [assigneeId, setAssigneeId] = useState('');
  const [thirdPartyName, setThirdPartyName] = useState('');
  const [thirdPartyEmail, setThirdPartyEmail] = useState('');
  const [showThirdPartyFields, setShowThirdPartyFields] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [statusId, setStatusId] = useState('');
  const [description, setDescription] = useState(mode === 'create' ? (initialDescription || '') : '');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);

  // Parts used on this WO (deducted from inventory on save).
  const [parts, setParts] = useState<PartLine[]>([]);
  const [partToAdd, setPartToAdd] = useState('');
  const [qtyToAdd, setQtyToAdd] = useState('1');

  // Defects this WO will correct — open defects for the selected asset.
  const [availableDefects, setAvailableDefects] = useState<DefectLookup[]>([]);
  const [selectedDefectIds, setSelectedDefectIds] = useState<string[]>(initialDefectIds || []);

  // Faults this WO will resolve — open faults for the selected asset.
  const [availableFaults, setAvailableFaults] = useState<FaultLookup[]>([]);
  const [selectedFaultIds, setSelectedFaultIds] = useState<string[]>(initialFaultIds || []);

  // Prepopulated assignee fields (read-only)
  const [assigneeContact, setAssigneeContact] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [assigneePhone, setAssigneePhone] = useState('');

  // Lookup data
  const [assets, setAssets] = useState<LookupOption[]>([]);
  const [serviceTasks, setServiceTasks] = useState<LookupOption[]>([]);
  const [vendors, setVendors] = useState<VendorLookup[]>([]);
  const [mechanics, setMechanics] = useState<UserLookup[]>([]);
  const [statuses, setStatuses] = useState<WOStatusOption[]>([]);
  const [availableParts, setAvailableParts] = useState<PartLookup[]>([]);
  // Whether the lookup dropdowns are still loading (non-mechanic path).
  const [lookupsLoading, setLookupsLoading] = useState(!isMechanic);

  // Fetch lookup data
  const fetchLookups = useCallback(async () => {
    // Mechanics can't access these lookup endpoints (assets/vendors/users/parts
    // all 403); their disabled fields are seeded separately, so skip the fetch.
    if (isMechanic) return;
    setLookupsLoading(true);
    try {
      const [assetsRes, tasksRes, vendorsRes, usersRes, statusesRes, partsRes] = await Promise.all([
        axios.get('/api/assets?limit=100', { withCredentials: true }),
        axios.get('/api/service-tasks?limit=100', { withCredentials: true }),
        axios.get('/api/vendors?limit=100', { withCredentials: true }),
        axios.get('/api/users?limit=100&role=mechanic', { withCredentials: true }),
        axios.get('/api/work-order-statuses', { withCredentials: true }),
        axios.get('/api/parts?limit=100', { withCredentials: true }),
      ]);

      const assetItems = assetsRes.data.data?.items || assetsRes.data.data || [];
      setAssets(assetItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: i.name as string,
      })));

      const taskItems = tasksRes.data.data?.items || tasksRes.data.data || [];
      setServiceTasks(taskItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: (i.title as string) || (i.name as string) || '',
      })));

      const vendorItems = vendorsRes.data.data?.items || vendorsRes.data.data || [];
      setVendors(vendorItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: i.name as string,
        contactName: (i.contactName as string) || '',
        email: (i.email as string) || undefined,
        phone: (i.phone as string) || undefined,
      })));

      const userItems = usersRes.data.data?.items || usersRes.data.data || [];
      setMechanics(userItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: (i.name as string) || `${(i.firstName as string) || ''} ${(i.lastName as string) || ''}`.trim() || (i.email as string) || '',
        email: (i.email as string) || undefined,
        phoneNumber: (i.phoneNumber as string) || undefined,
      })));

      const statusItems = statusesRes.data.data || [];
      setStatuses(statusItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        label: i.label as string,
        color: i.color as string,
        type: (i.type as string) || 'open',
        sequence: i.sequence as number,
      })));

      const partItems = partsRes.data.data?.items || partsRes.data.data || [];
      setAvailableParts(partItems.map((i: Record<string, unknown>) => {
        const vendors = (i.vendors as Array<{ unitCost: number }>) || [];
        const stockLocations = (i.stockLocations as Array<{ quantity: number }>) || [];
        const isCommand = i.source === 'command';
        return {
          id: i.id as string,
          name: i.name as string,
          partNumber: (i.partNumber as string) || '',
          // Command-imported stock has no vendors[] — its cost basis is
          // Command's costPrice snapshot (commandUnitCost), never 0.
          unitCost: isCommand
            ? Number(i.commandUnitCost ?? 0)
            : vendors[0]?.unitCost ?? 0,
          stock: stockLocations.reduce((sum, s) => sum + (s.quantity || 0), 0),
          source: (i.source as string) || 'local',
          commandStockId: (i.commandStockId as string) || null,
        };
      }));
    } catch {
      // Silent
    } finally {
      setLookupsLoading(false);
    }
  }, [isMechanic]);

  useEffect(() => { fetchLookups(); }, [fetchLookups]);

  // Mechanics can't hit the lookup endpoints (assets/vendors/users/parts all
  // 403), so seed the disabled fields' options straight from the work order and
  // load the status list (allowed for WO viewers) so Status stays editable.
  useEffect(() => {
    if (!isMechanic || mode !== 'edit' || !workOrder) return;
    let cancelled = false;
    (async () => {
      const [woRes, statusRes] = await Promise.allSettled([
        axios.get(`/api/work-orders/${workOrder.id}`, { withCredentials: true }),
        axios.get('/api/work-order-statuses', { withCredentials: true }),
      ]);
      if (cancelled) return;
      if (statusRes.status === 'fulfilled') {
        setStatuses((statusRes.value.data?.data || []) as WOStatusOption[]);
      }
      const full = (woRes.status === 'fulfilled' ? woRes.value.data?.data : null) as WorkOrderRow | null;
      const src = full || workOrder;
      if (src.assetId) setAssets([{ id: src.assetId, name: src.assetName || src.assetId }]);
      const names = full?.serviceTaskNames || {};
      setServiceTasks((src.serviceTaskIds || []).map((id) => ({ id, name: names[id] || id })));
      if (src.assigneeId && src.assigneeType === 'mechanic') {
        setMechanics([{ id: src.assigneeId, name: src.assigneeName || '', email: src.assigneeEmail, phoneNumber: src.assigneePhone }]);
      } else if (src.assigneeId && src.assigneeType === 'vendor') {
        setVendors([{ id: src.assigneeId, name: src.assigneeName || '', contactName: src.assigneeContact || '', email: src.assigneeEmail, phone: src.assigneePhone }]);
      }
    })();
    return () => { cancelled = true; };
  }, [isMechanic, mode, workOrder]);

  // New work orders default the due date to today (local date).
  useEffect(() => {
    if (mode === 'create') {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setDueDate(today);
    }
  }, [mode]);

  // Open, unlinked defects for the chosen asset — powers the "Defects to correct"
  // picker (create mode only; editing a WO's defect links isn't supported).
  const fetchAssetDefects = useCallback(async (aid: string) => {
    if (!aid) { setAvailableDefects([]); return; }
    try {
      const res = await axios.get(`/api/defects?assetId=${aid}&limit=100`, { withCredentials: true });
      const items = (res.data.data?.items || []) as Array<Record<string, unknown>>;
      setAvailableDefects(
        items.map((d) => ({
          id: d.id as string,
          defectNumber: (d.defectNumber as string) || '',
          name: (d.name as string) || '',
          status: (d.status as string) || '',
        })),
      );
    } catch {
      setAvailableDefects([]);
    }
  }, []);

  // Open faults for the chosen asset — powers the "Faults to resolve" picker.
  const fetchAssetFaults = useCallback(async (aid: string) => {
    if (!aid) { setAvailableFaults([]); return; }
    try {
      const res = await axios.get(`/api/faults?assetId=${aid}&limit=100`, { withCredentials: true });
      const items = (res.data.data?.items || []) as Array<Record<string, unknown>>;
      setAvailableFaults(
        items.map((f) => ({
          id: f.id as string,
          faultNumber: (f.faultNumber as string) || '',
          title: (f.title as string) || '',
          status: (f.status as string) || '',
        })),
      );
    } catch {
      setAvailableFaults([]);
    }
  }, []);

  // Defer so setState isn't called synchronously inside the effect body.
  useEffect(() => {
    if (mode !== 'create') return;
    const t = setTimeout(() => { fetchAssetDefects(assetId); fetchAssetFaults(assetId); }, 0);
    return () => clearTimeout(t);
  }, [assetId, mode, fetchAssetDefects, fetchAssetFaults]);

  // Populate form (edit mode)
  useEffect(() => {
    if (workOrder && mode === 'edit') {
      setAssetId(workOrder.assetId || '');
      setServiceTaskIds(workOrder.serviceTaskIds || []);
      setAssigneeTab((workOrder.assigneeType as AssigneeTab) || 'vendor');
      setAssigneeId(workOrder.assigneeId || '');
      setThirdPartyName(workOrder.thirdPartyName || '');
      setThirdPartyEmail(workOrder.thirdPartyEmail || '');
      setShowThirdPartyFields(!!(workOrder.thirdPartyName || workOrder.thirdPartyEmail));
      setDueDate(workOrder.dueDate ? workOrder.dueDate.split('T')[0] : '');
      setStatusId(workOrder.statusId || '');
      setDescription(workOrder.description || '');
      setAttachments(
        (workOrder.attachments || []).map((a) => ({
          url: a.url,
          filename: a.filename,
          originalName: a.originalName,
          contentType: a.contentType,
          size: a.size,
        })),
      );
      setAssigneeContact(workOrder.assigneeContact || '');
      setAssigneeEmail(workOrder.assigneeEmail || '');
      setAssigneePhone(workOrder.assigneePhone || '');
      setParts(
        (workOrder.parts || []).map((p) => ({
          partId: p.partId,
          partName: p.partName,
          partNumber: p.partNumber,
          quantity: p.quantity,
          unitCost: p.unitCost,
          // Round-trip the Command linkage — losing these fields would make an
          // already-consumed line look like a fresh one on save.
          source: p.source,
          commandStockId: p.commandStockId ?? null,
          pushedToCommand: p.pushedToCommand ?? false,
        })),
      );
    }
  }, [workOrder, mode]);

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  // Handle vendor selection → prepopulate contact fields
  const handleVendorSelect = (vendorId: string) => {
    setAssigneeId(vendorId);
    clearFieldError('assigneeId');
    const vendor = vendors.find((v) => v.id === vendorId);
    if (vendor) {
      setAssigneeContact(vendor.contactName || '');
      setAssigneeEmail(vendor.email || '');
      setAssigneePhone(vendor.phone || '');
    } else {
      setAssigneeContact('');
      setAssigneeEmail('');
      setAssigneePhone('');
    }
  };

  // Handle mechanic selection → prepopulate contact fields
  const handleMechanicSelect = (userId: string) => {
    setAssigneeId(userId);
    clearFieldError('assigneeId');
    const user = mechanics.find((u) => u.id === userId);
    if (user) {
      setAssigneeContact(user.name || '');
      setAssigneeEmail(user.email || '');
      setAssigneePhone(user.phoneNumber || '');
    } else {
      setAssigneeContact('');
      setAssigneeEmail('');
      setAssigneePhone('');
    }
  };

  // Handle assignee tab switch
  const handleAssigneeTabChange = (tab: AssigneeTab) => {
    setAssigneeTab(tab);
    setAssigneeId('');
    setAssigneeContact('');
    setAssigneeEmail('');
    setAssigneePhone('');
    setThirdPartyName('');
    setThirdPartyEmail('');
    setShowThirdPartyFields(false);
    clearFieldError('assigneeId');
    clearFieldError('thirdPartyName');
    clearFieldError('thirdPartyEmail');
  };

  // Service task helpers removed — now handled by SearchableSelect.

  // A WO can correct one or more of the asset's defects, chosen from the dropdown.
  const addDefect = (defectId: string) => {
    if (!defectId) return;
    setSelectedDefectIds((prev) => (prev.includes(defectId) ? prev : [...prev, defectId]));
    clearFieldError('serviceTaskIds');
  };
  const removeDefect = (defectId: string) =>
    setSelectedDefectIds((prev) => prev.filter((id) => id !== defectId));

  // A WO can resolve one or more of the asset's faults, chosen from the dropdown.
  const addFault = (faultId: string) => {
    if (!faultId) return;
    setSelectedFaultIds((prev) => (prev.includes(faultId) ? prev : [...prev, faultId]));
    clearFieldError('serviceTaskIds');
  };
  const removeFault = (faultId: string) =>
    setSelectedFaultIds((prev) => prev.filter((id) => id !== faultId));

  // ── Parts ──
  const handleAddPart = () => {
    const part = availableParts.find((p) => p.id === partToAdd);
    if (!part) return;
    const qty = Math.max(1, parseInt(qtyToAdd, 10) || 1);
    setParts((prev) => {
      const existing = prev.find((p) => partLineKey(p) === part.id || (part.commandStockId && p.commandStockId === part.commandStockId));
      if (existing) {
        if (existing.pushedToCommand) return prev; // consumed lines are frozen
        return prev.map((p) => (p === existing ? { ...p, quantity: p.quantity + qty } : p));
      }
      return [...prev, {
        partId: part.id,
        partName: part.name,
        partNumber: part.partNumber,
        quantity: qty,
        unitCost: part.unitCost,
        source: part.source,
        commandStockId: part.commandStockId ?? null,
        pushedToCommand: false,
      }];
    });
    setPartToAdd('');
    setQtyToAdd('1');
  };

  const updatePartQty = (key: string, qty: number) =>
    setParts((prev) =>
      prev.map((p) =>
        partLineKey(p) === key && !p.pushedToCommand ? { ...p, quantity: Math.max(1, qty || 1) } : p,
      ),
    );

  const removePart = (key: string) =>
    setParts((prev) => prev.filter((p) => partLineKey(p) !== key || p.pushedToCommand));

  const partsCost = parts.reduce((sum, p) => sum + p.unitCost * p.quantity, 0);

  const handleSubmit = async () => {
    setError('');
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!assetId) errors.assetId = 'Asset is required';
    if (!isItemsOptional && serviceTaskIds.length === 0 && selectedDefectIds.length === 0 && selectedFaultIds.length === 0) {
      errors.serviceTaskIds = 'Select at least one service task, defect, or fault';
    }
    if (assigneeTab === 'vendor' && !assigneeId) errors.assigneeId = 'Vendor is required';
    if (assigneeTab === 'mechanic' && !assigneeId) errors.assigneeId = 'Mechanic is required';
    if (assigneeTab === 'third_party' && showThirdPartyFields) {
      if (!thirdPartyName.trim()) errors.thirdPartyName = 'Name is required';
      if (!thirdPartyEmail.trim()) errors.thirdPartyEmail = 'Email is required';
    }
    if (!statusId) errors.statusId = 'Status is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload: Record<string, unknown> = {
      assetId,
      serviceTaskIds,
      // Source by precedence: fault > defect > passed-in.
      source: mode === 'create'
        ? (selectedFaultIds.length > 0 ? 'fault' : selectedDefectIds.length > 0 ? 'defect' : source)
        : source,
      ...(mode === 'create' ? { defectIds: selectedDefectIds, faultIds: selectedFaultIds } : {}),
      // Command lines are sent by commandStockId so the server preserves their
      // pushed state; their cost is Command's (any client value is ignored).
      parts: parts.map((p) =>
        p.commandStockId
          ? { commandStockId: p.commandStockId, quantity: p.quantity }
          : { partId: p.partId, quantity: p.quantity, unitCost: p.unitCost },
      ),
      assigneeType: assigneeTab,
      statusId,
      dueDate: dueDate || undefined,
      description: description.trim() || undefined,
      attachments: attachments.map((a) => ({
        url: a.url,
        filename: a.filename,
        originalName: a.originalName,
        contentType: a.contentType,
        size: a.size,
      })),
    };

    if (assigneeTab === 'vendor' || assigneeTab === 'mechanic') {
      payload.assigneeId = assigneeId;
    } else if (assigneeTab === 'third_party') {
      payload.thirdPartyName = thirdPartyName.trim();
      payload.thirdPartyEmail = thirdPartyEmail.trim();
    }

    try {
      setSaving(true);
      let warning: string | undefined;
      if (mode === 'edit' && workOrder) {
        const res = await axios.put(`/api/work-orders/${workOrder.id}`, payload, { withCredentials: true });
        warning = res.data?.warning as string | undefined;
      } else {
        await axios.post('/api/work-orders', payload, { withCredentials: true });
      }
      if (warning) {
        showErrorToast(warning);
      } else {
        showSuccessToast(mode === 'edit' ? 'Work order updated successfully' : 'Work order created successfully');
      }
      onSaved();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        const errData = err.response.data.error;
        if (typeof errData === 'object') {
          setFieldErrors(errData as Record<string, string>);
          showErrorToast('Please fix the highlighted errors');
        } else {
          setError(String(errData));
          showErrorToast(String(errData));
        }
      } else {
        setError('Failed to save work order');
        showErrorToast('Failed to save work order');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">
          {mode === 'edit' ? 'Edit Work Order' : 'Create Work Order'}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">

          {/* ── Details / Asset ── */}
          <FormSection icon={Truck} title="Details">
            <div>
              <SearchableSelect
                label="Asset"
                required
                options={assets.map((a) => ({ label: a.name, value: a.id }))}
                value={assetId || null}
                onValueChange={(val) => { setAssetId(val || ''); setSelectedDefectIds([]); setSelectedFaultIds([]); clearFieldError('assetId'); }}
                placeholder="Select asset"
                searchPlaceholder="Search assets..."
                emptyMessage="No assets found"
                loading={lookupsLoading}
                disabled={lockAsset || isMechanic}
                error={fieldErrors.assetId}
              />
            </div>
          </FormSection>

          {/* ── Items / Service Tasks ── */}
          <FormSection icon={Wrench} title="Items">
            <div>
              <Label>Items {!isItemsOptional && <span className="text-destructive">*</span>}</Label>
              <div className="mt-1.5">
                <SearchableSelect
                  isMulti
                  options={serviceTasks.map((t) => ({
                    label: t.name,
                    value: t.id,
                  }))}
                  value={serviceTaskIds}
                  onValueChange={(ids) => { setServiceTaskIds(ids); clearFieldError('serviceTaskIds'); }}
                  placeholder="Search and select service tasks..."
                  searchPlaceholder="Search service tasks..."
                  emptyMessage="No service tasks found"
                  loading={lookupsLoading}
                  disabled={isMechanic}
                />
              </div>
              {serviceTaskIds.length > 0 && (
                <div className="space-y-2 mt-3">
                  {serviceTaskIds.map((taskId) => {
                    const task = serviceTasks.find((t) => t.id === taskId);
                    return (
                      <div
                        key={taskId}
                        className="flex items-center justify-between rounded-md border border-border bg-white dark:bg-background px-3 py-2"
                      >
                        <span className="text-sm text-foreground">{task?.name || 'Unknown Task'}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isMechanic}
                          onClick={() => setServiceTaskIds((prev) => prev.filter((id) => id !== taskId))}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {fieldErrors.serviceTaskIds && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.serviceTaskIds}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Can&apos;t find what you are looking for? You can add it in{' '}
                <button
                  type="button"
                  onClick={() => router.push('/maintenance/service-tasks')}
                  className="text-primary hover:underline font-medium"
                >
                  the service tasks
                </button>
              </p>
            </div>
          </FormSection>

          {/* ── Defects to correct (optional) ── */}
          {mode === 'create' && (
            <FormSection icon={AlertTriangle} title="Defects to correct">
              <div>
                <Label>Defects</Label>
                <div className="mt-1.5">
                  <SearchableSelect
                    options={availableDefects
                      .filter((d) => !selectedDefectIds.includes(d.id))
                      .map((d) => ({
                        label: `${d.defectNumber ? `${d.defectNumber} · ` : ''}${d.name}${d.status ? ` (${d.status.replace(/_/g, ' ')})` : ''}`,
                        value: d.id,
                      }))}
                    value={null}
                    onValueChange={(v) => { if (v) addDefect(v); }}
                    placeholder={assetId ? 'Select a defect' : 'Select an asset first'}
                    searchPlaceholder="Search defects..."
                    emptyMessage={assetId ? 'No defects for this asset' : 'Select an asset first'}
                    disabled={!assetId}
                    isClearable={false}
                  />
                </div>

                {selectedDefectIds.length > 0 && (
                  <div className="mt-3 rounded-lg border border-border bg-card shadow-sm divide-y divide-border overflow-hidden">
                    {selectedDefectIds.map((id) => {
                      const d = availableDefects.find((x) => x.id === id);
                      return (
                        <div key={id} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                          <span className="text-sm text-foreground flex-1 truncate">
                            {d ? `${d.defectNumber ? `${d.defectNumber} · ` : ''}${d.name}` : 'Defect'}
                          </span>
                          {d?.status && (
                            <Badge variant={defectStatusBadge(d.status)} className="capitalize shrink-0">
                              {d.status.replace(/_/g, ' ')}
                            </Badge>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeDefect(id)}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">
                  Linked defects are marked in progress now and resolved when this work order is completed.
                </p>
              </div>
            </FormSection>
          )}

          {/* ── Faults to resolve (optional) ── */}
          {mode === 'create' && (
            <FormSection icon={AlertTriangle} title="Faults to resolve">
              <div>
                <Label>Faults</Label>
                <div className="mt-1.5">
                  <SearchableSelect
                    options={availableFaults
                      .filter((f) => !selectedFaultIds.includes(f.id))
                      .map((f) => ({
                        label: `${f.faultNumber ? `${f.faultNumber} · ` : ''}${f.title}${f.status ? ` (${f.status.replace(/_/g, ' ')})` : ''}`,
                        value: f.id,
                      }))}
                    value={null}
                    onValueChange={(v) => { if (v) addFault(v); }}
                    placeholder={assetId ? 'Select a fault' : 'Select an asset first'}
                    searchPlaceholder="Search faults..."
                    emptyMessage={assetId ? 'No faults for this asset' : 'Select an asset first'}
                    disabled={!assetId}
                    isClearable={false}
                  />
                </div>

                {selectedFaultIds.length > 0 && (
                  <div className="mt-3 rounded-lg border border-border bg-card shadow-sm divide-y divide-border overflow-hidden">
                    {selectedFaultIds.map((id) => {
                      const f = availableFaults.find((x) => x.id === id);
                      return (
                        <div key={id} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                          <span className="text-sm text-foreground flex-1 truncate">
                            {f ? `${f.faultNumber ? `${f.faultNumber} · ` : ''}${f.title}` : 'Fault'}
                          </span>
                          {f?.status && (
                            <Badge variant={faultStatusBadge(f.status)} className="capitalize shrink-0">
                              {f.status.replace(/_/g, ' ')}
                            </Badge>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeFault(id)}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">
                  Linked faults are marked in progress now and resolved when this work order is completed.
                </p>
              </div>
            </FormSection>
          )}

          {/* ── Assignee ── */}
          <FormSection icon={Users} title="Assignee">
            {/* Tab buttons */}
            <div className="flex gap-1 mb-4">
              {(['vendor', 'mechanic', 'third_party'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  disabled={isMechanic}
                  onClick={() => handleAssigneeTabChange(tab)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                    assigneeTab === tab
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {tab === 'vendor' ? 'Vendor' : tab === 'mechanic' ? 'Mechanic' : 'Third Party'}
                </button>
              ))}
            </div>

            {/* Vendor tab */}
            {assigneeTab === 'vendor' && (
              <div className="space-y-4">
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Vendors can access the work orders assigned to them in their account.
                  </p>
                </div>
                <div>
                  <Label>Vendor <span className="text-destructive">*</span></Label>
                  <Select value={assigneeId} onValueChange={handleVendorSelect} disabled={isMechanic}>
                    <SelectTrigger className={`mt-1.5 ${fieldErrors.assigneeId ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                      ) : (
                        vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {fieldErrors.assigneeId && <p className="text-sm text-destructive mt-1">{fieldErrors.assigneeId}</p>}
                </div>

                {assigneeId && (
                  <div className="space-y-3">
                    <div>
                      <Label>Contact</Label>
                      <Input value={assigneeContact} readOnly className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input value={assigneeEmail} readOnly className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={assigneePhone} readOnly className="mt-1.5" />
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Can&apos;t find the contact? You can add it in{' '}
                  <button
                    type="button"
                    onClick={() => router.push('/vendors')}
                    className="text-primary hover:underline font-medium"
                  >
                    the vendors
                  </button>
                </p>
              </div>
            )}

            {/* Mechanic tab */}
            {assigneeTab === 'mechanic' && (
              <div className="space-y-4">
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Mechanics can access the work orders assigned to them in their account.
                  </p>
                </div>
                <div>
                  <SearchableSelect
                    label="Mechanic"
                    required
                    options={mechanics.map((u) => ({
                      value: u.id,
                      label: u.name,
                      meta: u.email,
                    }))}
                    value={assigneeId || null}
                    onValueChange={(v) => handleMechanicSelect(v || '')}
                    placeholder="Select mechanic"
                    searchPlaceholder="Search mechanics..."
                    emptyMessage="No mechanics found"
                    loading={lookupsLoading}
                    disabled={isMechanic}
                    error={fieldErrors.assigneeId}
                  />
                </div>

                {assigneeId && (
                  <div className="space-y-3">
                    <div>
                      <Label>Contact</Label>
                      <Input value={assigneeContact} readOnly className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input value={assigneeEmail} readOnly className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={assigneePhone} readOnly className="mt-1.5" />
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Can&apos;t find the mechanic? You can add one in{' '}
                  <button
                    type="button"
                    onClick={() => router.push('/people/users')}
                    className="text-primary hover:underline font-medium"
                  >
                    the Users
                  </button>
                </p>
              </div>
            )}

            {/* Third Party tab */}
            {assigneeTab === 'third_party' && (
              <div className="space-y-4">
                {!showThirdPartyFields ? (
                  <div className="rounded-md bg-muted/50 border border-border px-3 py-3">
                    <p className="text-sm text-muted-foreground">
                      Can&apos;t find the third party?{' '}
                      <button
                        type="button"
                        disabled={isMechanic}
                        onClick={() => setShowThirdPartyFields(true)}
                        className="text-primary hover:underline font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add new third party
                      </button>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label>Name <span className="text-destructive">*</span></Label>
                      <Input
                        value={thirdPartyName}
                        disabled={isMechanic}
                        onChange={(e) => { setThirdPartyName(e.target.value); clearFieldError('thirdPartyName'); }}
                        placeholder="Third party name"
                        className={`mt-1.5 ${fieldErrors.thirdPartyName ? 'border-destructive' : ''}`}
                      />
                      {fieldErrors.thirdPartyName && (
                        <p className="text-sm text-destructive mt-1">{fieldErrors.thirdPartyName}</p>
                      )}
                    </div>
                    <div>
                      <Label>Email <span className="text-destructive">*</span></Label>
                      <Input
                        type="email"
                        value={thirdPartyEmail}
                        disabled={isMechanic}
                        onChange={(e) => { setThirdPartyEmail(e.target.value); clearFieldError('thirdPartyEmail'); }}
                        placeholder="Third party email"
                        className={`mt-1.5 ${fieldErrors.thirdPartyEmail ? 'border-destructive' : ''}`}
                      />
                      {fieldErrors.thirdPartyEmail && (
                        <p className="text-sm text-destructive mt-1">{fieldErrors.thirdPartyEmail}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </FormSection>

          {/* ── Due Date ── */}
          <FormSection icon={Calendar} title="Due Date">
            <div>
              <DateField label="Due Date" value={dueDate} onChange={setDueDate} placeholder="Select due date" disabled={isMechanic} />
            </div>
          </FormSection>

          {/* ── Status ── */}
          <FormSection icon={Flag} title="Status">
            <div>
              <Label>Choose Status <span className="text-destructive">*</span></Label>
              <Select value={statusId} onValueChange={(val) => { setStatusId(val); clearFieldError('statusId'); }}>
                <SelectTrigger className={`mt-1.5 ${fieldErrors.statusId ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No statuses yet</div>
                  ) : (
                    statuses.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          <span>{s.label}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {fieldErrors.statusId && <p className="text-sm text-destructive mt-1">{fieldErrors.statusId}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                Manage statuses in{' '}
                <button
                  type="button"
                  onClick={() => router.push('/settings?section=work-order-statuses')}
                  className="text-primary hover:underline font-medium"
                >
                  the settings
                </button>
              </p>
            </div>
          </FormSection>

          {/* ── Description ── */}
          <FormSection icon={AlignLeft} title="Description">
            <div>
              <Label htmlFor="woDescription">Description</Label>
              <Textarea
                id="woDescription"
                value={description}
                disabled={isMechanic}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this work order..."
                rows={3}
                maxLength={2000}
                className="mt-1.5"
              />
            </div>
          </FormSection>

          {/* ── Stock ── */}
          <FormSection icon={Package} title="Stock">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label>Stock</Label>
                <SearchableSelect
                  className="mt-1.5"
                  options={availableParts.map((p) => ({
                    label: `${p.name} (${p.stock} in stock)`,
                    value: p.id,
                  }))}
                  value={partToAdd || null}
                  onValueChange={(v) => setPartToAdd(v || '')}
                  placeholder="Select stock"
                  searchPlaceholder="Search stock..."
                  emptyMessage="No stock in inventory"
                  loading={lookupsLoading}
                  disabled={isMechanic}
                />
              </div>
              <div className="w-20">
                <Label>Qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={qtyToAdd}
                  disabled={isMechanic}
                  onChange={(e) => setQtyToAdd(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <Button type="button" variant="outline" onClick={handleAddPart} disabled={!partToAdd || isMechanic}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            {parts.length > 0 && (
              <div className="mt-4 rounded-lg border border-border bg-card shadow-sm divide-y divide-border overflow-hidden">
                {parts.map((p) => {
                  const key = partLineKey(p);
                  const stock = availableParts.find((a) => a.id === p.partId)?.stock ?? null;
                  const low = stock != null && p.quantity > stock;
                  const frozen = p.pushedToCommand === true;
                  return (
                    <div key={key} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Package className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.partName}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.partNumber ? `${p.partNumber} · ` : ''}${p.unitCost.toFixed(2)} ea
                          {stock != null && (
                            <span className={low ? 'text-destructive font-medium' : ''}> · {stock} in stock</span>
                          )}
                          {frozen && <span> · consumed in Command</span>}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={p.quantity}
                        disabled={frozen || isMechanic}
                        onChange={(e) => updatePartQty(key, parseInt(e.target.value, 10))}
                        className="w-16 h-8 text-center"
                      />
                      <span className="text-sm font-semibold text-foreground w-24 text-right tabular-nums">
                        ${(p.unitCost * p.quantity).toFixed(2)}
                      </span>
                      {!frozen && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isMechanic}
                          onClick={() => removePart(key)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-between px-3 py-2.5 bg-muted/40">
                  <span className="text-sm font-medium text-foreground">Stock total</span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">${partsCost.toFixed(2)}</span>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Selected stock is deducted from inventory when you save.
            </p>
          </FormSection>

          {/* ── Attachments ── */}
          <FormSection icon={Paperclip} title="Attachments">
            <AttachmentUploader
              variant="dropzone"
              files={attachments}
              onChange={setAttachments}
              accept=".doc,.docx,.pdf,.csv,.xls,.xlsx,.jpg,.jpeg,.png,.heic"
              hint="DOC, PDF, CSV, XLS, JPG, HEIC or PNG (max. 50 MB)"
              onError={setError}
            />
          </FormSection>

          {/* Error banner */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <LoadingButton type="button" onClick={handleSubmit} loading={saving}>
          {mode === 'edit' ? 'Update' : 'Save'}
        </LoadingButton>
      </div>
    </div>
  );
}
