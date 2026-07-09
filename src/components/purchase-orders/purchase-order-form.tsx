'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button, LoadingButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { AttachmentUploader, type UploadedFile } from '@/components/ui/attachment-uploader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showSuccessToast, showErrorToast } from '@/lib/toastUtils';
import type { PurchaseOrderRow, LookupOption } from './types';

interface PurchaseOrderFormProps {
  mode: 'create' | 'edit';
  purchaseOrder?: PurchaseOrderRow | null;
  onClose: () => void;
  onSaved: () => void;
}

interface LineItemState {
  partId: string;
  quantity: string;
  unitCost: string;
}

export function PurchaseOrderForm({ mode, purchaseOrder, onClose, onSaved }: PurchaseOrderFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields
  const [vendorId, setVendorId] = useState('');
  const [deliveryLocationId, setDeliveryLocationId] = useState('');
  const [approverId, setApproverId] = useState('');
  const [description, setDescription] = useState('');
  const [shipping, setShipping] = useState('');
  const [taxType, setTaxType] = useState('fixed');
  const [taxValue, setTaxValue] = useState('');

  // Line items
  const [lineItems, setLineItems] = useState<LineItemState[]>([]);

  // Documents
  const [documents, setDocuments] = useState<UploadedFile[]>([]);

  // Lookup data
  const [vendors, setVendors] = useState<LookupOption[]>([]);
  const [parts, setParts] = useState<LookupOption[]>([]);
  const [locations, setLocations] = useState<LookupOption[]>([]);
  const [users, setUsers] = useState<LookupOption[]>([]);

  // Fetch lookup data
  const fetchLookups = useCallback(async () => {
    try {
      const [venRes, partsRes, locRes, usersRes] = await Promise.all([
        axios.get('/api/vendors?limit=100', { withCredentials: true }),
        axios.get('/api/parts?limit=100', { withCredentials: true }),
        axios.get('/api/inventory-settings/part-locations', { withCredentials: true }),
        axios.get('/api/users?limit=100', { withCredentials: true }),
      ]);
      const vendorItems = venRes.data.data?.items || venRes.data.data || [];
      setVendors(vendorItems.map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string })));
      const partItems = partsRes.data.data?.items || partsRes.data.data || [];
      setParts(partItems.map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string })));
      const locItems = locRes.data.data || [];
      setLocations(locItems.map((i: Record<string, unknown>) => ({ id: i.id as string, name: i.name as string })));
      const userItems = usersRes.data.data?.items || usersRes.data.data || [];
      setUsers(userItems.map((i: Record<string, unknown>) => ({
        id: i.id as string,
        name: (i.name as string) || `${(i.firstName as string) || ''} ${(i.lastName as string) || ''}`.trim() || (i.email as string) || '',
      })));
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => { fetchLookups(); }, [fetchLookups]);

  // Populate form (edit mode)
  useEffect(() => {
    if (purchaseOrder && mode === 'edit') {
      setVendorId(purchaseOrder.vendorId || '');
      setDeliveryLocationId(purchaseOrder.deliveryLocationId || '');
      setApproverId(purchaseOrder.approverId || '');
      setDescription(purchaseOrder.description || '');
      setShipping(purchaseOrder.shipping ? String(purchaseOrder.shipping) : '');
      setTaxType(purchaseOrder.taxType || 'fixed');
      setTaxValue(purchaseOrder.taxValue ? String(purchaseOrder.taxValue) : '');
      setLineItems(
        (purchaseOrder.lineItems || []).map((li) => ({
          partId: li.partId,
          quantity: String(li.quantity),
          unitCost: String(li.unitCost),
        })),
      );
      setDocuments(
        (purchaseOrder.documents || []).map((d) => ({
          url: d.url,
          filename: d.filename,
          originalName: d.originalName,
          contentType: d.contentType,
          size: d.size,
        })),
      );
    }
  }, [purchaseOrder, mode]);

  // Vendor change → clear line items
  const handleVendorChange = (val: string) => {
    setVendorId(val);
    clearFieldError('vendorId');
    if (mode === 'create') {
      setLineItems([]);
    }
  };

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  // Line item helpers
  const addLineItem = () => setLineItems((prev) => [...prev, { partId: '', quantity: '', unitCost: '' }]);
  const removeLineItem = (idx: number) => setLineItems((prev) => prev.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: keyof LineItemState, value: string) => {
    setLineItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  // Cost calculations (client-side preview)
  const subTotal = lineItems.reduce((sum, li) => {
    const qty = parseFloat(li.quantity) || 0;
    const cost = parseFloat(li.unitCost) || 0;
    return sum + qty * cost;
  }, 0);

  const shippingVal = parseFloat(shipping) || 0;
  const taxVal = parseFloat(taxValue) || 0;
  const taxAmount = taxType === 'percentage' ? subTotal * (taxVal / 100) : taxVal;
  const total = subTotal + shippingVal + taxAmount;

  const handleSubmit = async (submitStatus: 'draft' | 'pending_approval') => {
    setError('');
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!vendorId) errors.vendorId = 'Vendor is required';
    if (!deliveryLocationId) errors.deliveryLocationId = 'Delivery location is required';
    if (!approverId) errors.approverId = 'Approver is required';
    if (lineItems.length === 0) errors.lineItems = 'At least one line item is required';
    else {
      for (let i = 0; i < lineItems.length; i++) {
        if (!lineItems[i].partId) errors[`lineItems.${i}.partId`] = 'Part is required';
        if (!lineItems[i].quantity || parseFloat(lineItems[i].quantity) <= 0) {
          errors[`lineItems.${i}.quantity`] = 'Valid quantity is required';
        }
        if (!lineItems[i].unitCost || parseFloat(lineItems[i].unitCost) < 0) {
          errors[`lineItems.${i}.unitCost`] = 'Valid unit cost is required';
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload = {
      vendorId,
      deliveryLocationId,
      approverId,
      lineItems: lineItems.map((li) => ({
        partId: li.partId,
        quantity: parseInt(li.quantity, 10),
        unitCost: parseFloat(li.unitCost),
      })),
      shipping: shippingVal,
      taxType,
      taxValue: taxVal,
      description: description.trim() || undefined,
      documents: documents.map((d) => ({
        url: d.url,
        filename: d.filename,
        originalName: d.originalName,
        contentType: d.contentType,
        size: d.size,
      })),
      status: submitStatus,
    };

    try {
      setSaving(true);
      if (mode === 'edit' && purchaseOrder) {
        await axios.put(`/api/purchase-orders/${purchaseOrder.id}`, payload, { withCredentials: true });
      } else {
        await axios.post('/api/purchase-orders', payload, { withCredentials: true });
      }
      showSuccessToast(submitStatus === 'draft' ? 'Purchase order saved as draft' : 'Purchase order sent for approval');
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
        setError('Failed to save purchase order');
        showErrorToast('Failed to save purchase order');
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
          {mode === 'edit' ? 'Edit Purchase Order' : 'Create Purchase Order'}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">

          {/* ── Vendor ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Vendor</h3>
            <Separator className="mb-4" />
            <div>
              <Label>Vendor <span className="text-destructive">*</span></Label>
              <Select value={vendorId} onValueChange={handleVendorChange}>
                <SelectTrigger className={`mt-1.5 ${fieldErrors.vendorId ? 'border-destructive' : ''}`}>
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
              {fieldErrors.vendorId && <p className="text-sm text-destructive mt-1">{fieldErrors.vendorId}</p>}
              <p className="text-xs text-muted-foreground mt-1">Changing vendor will remove the line items</p>
            </div>
          </div>

          {/* ── Delivery Location ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Delivery Location</h3>
            <Separator className="mb-4" />
            <div>
              <Label>Delivery Location <span className="text-destructive">*</span></Label>
              <Select value={deliveryLocationId} onValueChange={(val) => { setDeliveryLocationId(val); clearFieldError('deliveryLocationId'); }}>
                <SelectTrigger className={`mt-1.5 ${fieldErrors.deliveryLocationId ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder="Select delivery location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                  ) : (
                    locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {fieldErrors.deliveryLocationId && <p className="text-sm text-destructive mt-1">{fieldErrors.deliveryLocationId}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                Can&apos;t find the location? You can add it in{' '}
                <button
                  type="button"
                  onClick={() => router.push('/settings?section=part-locations')}
                  className="text-primary hover:underline font-medium"
                >
                  the settings
                </button>
              </p>
            </div>
          </div>

          {/* ── Line Items ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Line Items</h3>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Item
              </Button>
            </div>
            <Separator className="mb-4" />

            {fieldErrors.lineItems && (
              <p className="text-sm text-destructive mb-3">{fieldErrors.lineItems}</p>
            )}

            {lineItems.length === 0 && (
              <p className="text-sm text-muted-foreground">No line items added. Click &quot;Add Item&quot; to add parts to this order.</p>
            )}

            <div className="space-y-3">
              {lineItems.map((line, idx) => {
                const lineTotal = (parseFloat(line.quantity) || 0) * (parseFloat(line.unitCost) || 0);
                return (
                  <div key={idx} className="rounded-lg border border-border bg-card shadow-sm p-4 space-y-3">
                    {/* Card header: item number + remove */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Item {idx + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeLineItem(idx)}
                        className="text-muted-foreground hover:text-destructive -mr-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Part select */}
                    <div>
                      <Label className="text-xs">Stock <span className="text-destructive">*</span></Label>
                      <Select value={line.partId} onValueChange={(val) => updateLineItem(idx, 'partId', val)}>
                        <SelectTrigger className={`mt-1 ${fieldErrors[`lineItems.${idx}.partId`] ? 'border-destructive' : ''}`}>
                          <SelectValue placeholder="Select stock" />
                        </SelectTrigger>
                        <SelectContent>
                          {parts.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                          ) : (
                            parts.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {fieldErrors[`lineItems.${idx}.partId`] && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors[`lineItems.${idx}.partId`]}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Can&apos;t find the stock? You can add it in{' '}
                        <button
                          type="button"
                          onClick={() => router.push('/maintenance/inventory')}
                          className="text-primary hover:underline font-medium"
                        >
                          the Stock
                        </button>
                      </p>
                    </div>

                    {/* Qty, Unit Cost, Total in a row */}
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <Label className="text-xs">Quantity <span className="text-destructive">*</span></Label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                          placeholder="0"
                          className={`mt-1 ${fieldErrors[`lineItems.${idx}.quantity`] ? 'border-destructive' : ''}`}
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">Unit Cost ($) <span className="text-destructive">*</span></Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unitCost}
                          onChange={(e) => updateLineItem(idx, 'unitCost', e.target.value)}
                          placeholder="0.00"
                          className={`mt-1 ${fieldErrors[`lineItems.${idx}.unitCost`] ? 'border-destructive' : ''}`}
                        />
                      </div>
                      <div className="w-27.5">
                        <Label className="text-xs">Total ($)</Label>
                        <Input
                          value={lineTotal > 0 ? lineTotal.toFixed(2) : '0.00'}
                          readOnly
                          tabIndex={-1}
                          className="mt-1 bg-muted/50 font-medium text-foreground tabular-nums cursor-default"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Cost Summary ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Cost Summary</h3>
            <Separator className="mb-4" />
            <div className="space-y-4">
              {/* SubTotal (read-only) */}
              <div>
                <Label>SubTotal</Label>
                <Input
                  value={`$${subTotal.toFixed(2)}`}
                  readOnly
                  className="mt-1.5 bg-muted/50"
                />
              </div>

              {/* Shipping */}
              <div>
                <Label>Shipping ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                  placeholder="0.00"
                  className="mt-1.5"
                />
              </div>

              {/* Tax Type + Tax Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tax Type</Label>
                  <Select value={taxType} onValueChange={setTaxType}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percent (%)</SelectItem>
                      <SelectItem value="fixed">Fixed ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tax {taxType === 'percentage' ? '(%)' : '($)'}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={taxType === 'percentage' ? '100' : undefined}
                    value={taxValue}
                    onChange={(e) => setTaxValue(e.target.value)}
                    placeholder="0.00"
                    className="mt-1.5"
                  />
                </div>
              </div>

              {/* Total (read-only) */}
              <div>
                <Label>Total</Label>
                <Input
                  value={`$${total.toFixed(2)}`}
                  readOnly
                  className="mt-1.5 bg-muted/50 font-semibold"
                />
              </div>
            </div>
          </div>

          {/* ── Description ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Description</h3>
            <Separator className="mb-4" />
            <div>
              <Label htmlFor="poDescription">Purchase Order Description</Label>
              <Textarea
                id="poDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this purchase order..."
                rows={3}
                maxLength={2000}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* ── Documents ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Documents</h3>
            <Separator className="mb-4" />
            <AttachmentUploader
              files={documents}
              onChange={setDocuments}
              accept=".doc,.docx,.csv,.xls,.xlsx,.jpg,.jpeg,.png"
              hint="Supported: DOC, DOCX, CSV, XLS, XLSX, JPG, PNG — Max 50 MB per file"
              emptyText="No documents uploaded."
              onError={setError}
            />
          </div>

          {/* ── Approver ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Approver</h3>
            <Separator className="mb-4" />
            <div>
              <Label>Approver <span className="text-destructive">*</span></Label>
              <Select value={approverId} onValueChange={(val) => { setApproverId(val); clearFieldError('approverId'); }}>
                <SelectTrigger className={`mt-1.5 ${fieldErrors.approverId ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder="Select approver" />
                </SelectTrigger>
                <SelectContent>
                  {users.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No data yet</div>
                  ) : (
                    users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {fieldErrors.approverId && <p className="text-sm text-destructive mt-1">{fieldErrors.approverId}</p>}
            </div>
          </div>

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
        <LoadingButton
          type="button"
          variant="secondary"
          onClick={() => handleSubmit('draft')}
          loading={saving}
        >
          Save as Draft
        </LoadingButton>
        <LoadingButton
          type="button"
          onClick={() => handleSubmit('pending_approval')}
          loading={saving}
        >
          Send for Approval
        </LoadingButton>
      </div>
    </div>
  );
}
