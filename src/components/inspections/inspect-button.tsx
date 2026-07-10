'use client';

/**
 * "Inspect" entry point for an asset. Opens a picker of the forms LINKED to the
 * asset (asset.formIds), then launches the native runner for the chosen form —
 * so the submission is bound to this exact asset.
 *
 * The picker fetches the asset to read its linked form ids, so it works the same
 * from the asset list row and the asset detail page.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ClipboardCheck, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

interface FormItem { id: string; formId: string; title: string; inspectionType?: string }

export function InspectFormPickerDialog({
  open,
  assetId,
  onOpenChange,
}: {
  open: boolean;
  assetId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [forms, setForms] = useState<FormItem[]>([]);

  useEffect(() => {
    if (!open || !assetId) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [assetRes, formsRes] = await Promise.all([
          axios.get(`/api/assets/${assetId}`, { withCredentials: true }),
          axios.get('/api/forms?status=published&includeSchema=false', { withCredentials: true }),
        ]);
        const assetFormIds: string[] = Array.isArray(assetRes.data?.data?.formIds)
          ? assetRes.data.data.formIds.map(String)
          : [];
        const allForms: FormItem[] = (formsRes.data?.data?.items ?? []).map((f: Record<string, unknown>) => ({
          id: String(f.id),
          formId: String(f.formId),
          title: String(f.title ?? f.formTitle ?? 'Untitled form'),
          inspectionType: f.inspectionType as string | undefined,
        }));
        // Asset stores local form ids; match on either id to be safe. Also
        // exclude driver-type forms — an asset inspection must use an asset form.
        const linked = allForms.filter(
          (f) =>
            (assetFormIds.includes(f.id) || assetFormIds.includes(f.formId)) &&
            f.inspectionType !== 'driver',
        );
        if (active) setForms(linked);
      } catch {
        if (active) setForms([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, assetId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start inspection</DialogTitle>
          <DialogDescription>Select a form to inspect this asset.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10"><Spinner /></div>
        ) : forms.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No inspection forms are linked to this asset. Assign forms from the asset&apos;s Edit page.
          </p>
        ) : (
          <div className="space-y-2 py-1 max-h-80 overflow-y-auto">
            {forms.map((f) => (
              <button
                key={f.formId}
                onClick={() => router.push(`/inspections/fill?assetId=${assetId}&formId=${f.formId}`)}
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
  );
}

/** Ready-made Inspect button (asset detail page). */
export function InspectButton({ assetId }: { assetId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ClipboardCheck className="h-4 w-4" />
        Inspect
      </Button>
      <InspectFormPickerDialog open={open} assetId={assetId} onOpenChange={setOpen} />
    </>
  );
}
