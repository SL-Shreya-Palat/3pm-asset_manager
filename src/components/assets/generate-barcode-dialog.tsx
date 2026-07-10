'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  generatePreviewDataUrl,
  generateLabelsPDF,
  LABEL_FORMATS,
  type BarcodeType,
  type LabelSize,
} from '@/lib/barcode-pdf';
/* ── Props ────────────────────────────────────────────────────────── */

export interface BarcodeItem {
  id: string;
  name: string;
  code?: string; // assetNumber, partNumber, etc.
}

interface GenerateBarcodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BarcodeItem[];
  /**
   * Route prefix for scan-to-open QR labels (e.g. "/assets" → QR encodes
   * `${origin}/assets/{id}`). Omit to hide the app-link option.
   */
  appLinkBase?: string;
}

/* ── Radio option sub-component ───────────────────────────────────── */

function RadioOption({
  selected,
  onClick,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 text-sm text-left rounded-lg border transition-colors w-full',
        selected ? 'bg-primary/5 border-primary' : 'hover:bg-muted/50 border-input',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-primary' : 'border-muted-foreground/40',
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <div>
        <span className="font-medium text-foreground">{label}</span>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </button>
  );
}

/* ── Template grid preview ────────────────────────────────────────── */

function TemplateGrid({ labelSize }: { labelSize: LabelSize }) {
  const format = LABEL_FORMATS[labelSize];
  return (
    <div className="aspect-[8.5/11] bg-gray-50 rounded border relative p-2">
      <div
        className="grid gap-[2px] h-full"
        style={{
          gridTemplateColumns: `repeat(${format.columns}, 1fr)`,
          gridTemplateRows: `repeat(${format.rows}, 1fr)`,
        }}
      >
        {Array.from({ length: format.perSheet }).map((_, i) => (
          <div key={i} className="bg-gray-200 rounded-sm border border-gray-300" />
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-1">
        {format.perSheet} labels per sheet
      </p>
    </div>
  );
}

/* ── Main dialog ──────────────────────────────────────────────────── */

export function GenerateBarcodeDialog({
  open,
  onOpenChange,
  items,
  appLinkBase,
}: GenerateBarcodeDialogProps) {
  const [barcodeType, setBarcodeType] = useState<BarcodeType>('barcode');
  const [labelQuantity, setLabelQuantity] = useState(1);
  const [labelSize, setLabelSize] = useState<LabelSize>('small');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Regenerate preview when options change
  useEffect(() => {
    if (!open || items.length === 0) return;
    let cancelled = false;

    const text =
      barcodeType === 'applink' && appLinkBase
        ? `${window.location.origin}${appLinkBase}/${items[0].id}`
        : items[0].code || items[0].name;

    setPreviewUrl(null);
    generatePreviewDataUrl(text, barcodeType).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [open, barcodeType, items, appLinkBase]);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await generateLabelsPDF({
        assets: items.map((item) => ({
          id: item.id,
          name: item.name,
          assetNumber: item.code,
        })),
        barcodeType,
        labelQuantity,
        labelSize,
        appLink: appLinkBase
          ? (id) => `${window.location.origin}${appLinkBase}/${id}`
          : undefined,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `barcode-labels-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    } finally {
      setGenerating(false);
    }
  };

  const firstItemText =
    items.length > 0
      ? items[0].code || items[0].name
      : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Barcode Labels</DialogTitle>
          <DialogDescription>
            Configure and download barcode labels for{' '}
            {items.length} selected asset{items.length !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-2">
          {/* Left column — Controls */}
          <div className="space-y-5">
            {/* Bar code type */}
            <div>
              <Label>Bar code type</Label>
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex gap-3">
                  <RadioOption
                    selected={barcodeType === 'barcode'}
                    onClick={() => setBarcodeType('barcode')}
                    label="Bar code"
                  />
                  <RadioOption
                    selected={barcodeType === 'qrcode'}
                    onClick={() => setBarcodeType('qrcode')}
                    label="QR code"
                  />
                </div>
                {appLinkBase && (
                  <RadioOption
                    selected={barcodeType === 'applink'}
                    onClick={() => setBarcodeType('applink')}
                    label="Scan-to-open QR"
                    description="Scanning with a phone camera opens the asset in 3PM Drive — drivers can start an inspection on the spot"
                  />
                )}
              </div>
            </div>

            {/* Label quantity */}
            <div>
              <Label>Label quantity (per asset)</Label>
              <Select
                value={String(labelQuantity)}
                onValueChange={(v) => setLabelQuantity(Number(v))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Label size */}
            <div>
              <Label>Label size</Label>
              <div className="flex flex-col gap-2 mt-2">
                <RadioOption
                  selected={labelSize === 'small'}
                  onClick={() => setLabelSize('small')}
                  label='Small (1" x 2-5/8")'
                  description="Avery 5160/8160 — 30 per sheet"
                />
                <RadioOption
                  selected={labelSize === 'large'}
                  onClick={() => setLabelSize('large')}
                  label='Large (2" x 4")'
                  description="Avery 5163/8163 — 10 per sheet"
                />
              </div>
            </div>
          </div>

          {/* Right column — Previews */}
          <div className="space-y-4">
            {/* Label preview */}
            <div>
              <Label>Label preview</Label>
              <div className="mt-2 border rounded-lg p-4 bg-white flex flex-col items-center justify-center min-h-[140px] gap-2">
                {previewUrl ? (
                  <>
                    <img
                      src={previewUrl}
                      alt="Label preview"
                      className="max-w-full max-h-[100px] object-contain"
                    />
                    <span className="text-xs text-muted-foreground font-mono">
                      {firstItemText}
                    </span>
                  </>
                ) : (
                  <Spinner size="sm" />
                )}
              </div>
            </div>

            {/* Template preview */}
            <div>
              <Label>Template preview</Label>
              <div className="mt-2">
                <TemplateGrid labelSize={labelSize} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={generating}>
            {generating ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Generating...
              </>
            ) : (
              'Download template'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
