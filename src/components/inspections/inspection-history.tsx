'use client';

/**
 * Inspection history — Whip Around-style list of completed inspections. Reuses
 * the shared DataTable / toolbar / search-input + table hooks (same pattern as
 * the Defects and Assets lists). Click a row for the full record.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import type { DataTablePagination } from '@/components/ui/data-table.types';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useDataTable } from '@/hooks/use-data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Row {
  id: string;
  inspectionNumber: string | null;
  formTitle: string;
  assetName: string | null;
  unitNumber: string | null;
  operatorName: string | null;
  result: string;
  defectCount: number;
  submittedAt: string | null;
}

interface DetailRecord extends Row {
  response: Record<string, unknown>;
  defects: { label: string; answer: string | string[]; severity: string }[];
  faultsComments: string | null;
  photos: unknown;
  safeToOperate: unknown;
}

const RESULT_FILTERS = [
  { key: '', label: 'All' },
  { key: 'fail', label: 'Failed' },
  { key: 'pass', label: 'Passed' },
] as const;

function ResultBadge({ result }: { result: string }) {
  return result === 'pass' ? (
    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3" /> Pass</Badge>
  ) : (
    <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle className="h-3 w-3" /> Fail</Badge>
  );
}

export function InspectionHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<DataTablePagination>({
    page: 1, limit: 25, total: 0, hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(300);
  const [result, setResult] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { hiddenColumnKeys, setHiddenColumnKeys, density, setDensity } = useDataTable();

  const fetchRows = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(rowsPerPage) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (result) params.set('result', result);
      const res = await axios.get(`/api/inspection-submissions?${params.toString()}`, {
        withCredentials: true,
      });
      const data = res.data.data;
      setRows(data.items ?? []);
      setPagination(data.pagination ?? { page, limit: rowsPerPage, total: 0, hasMore: false });
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [rowsPerPage, debouncedSearch, result]);

  // Defer so setState isn't called synchronously inside the effect body.
  useEffect(() => {
    const t = setTimeout(() => fetchRows(1), 0);
    return () => clearTimeout(t);
  }, [fetchRows]);

  const columns: DataTableColumn<Row>[] = [
    { key: 'inspectionNumber', header: 'Inspection', pinned: true, render: (r) => <span className="font-medium">{r.inspectionNumber || '—'}</span> },
    { key: 'asset', header: 'Asset', render: (r) => r.assetName || r.unitNumber || <span className="text-amber-600">Unlinked</span> },
    { key: 'formTitle', header: 'Form', render: (r) => <span className="text-muted-foreground">{r.formTitle}</span> },
    { key: 'operatorName', header: 'Operator', render: (r) => r.operatorName || '—' },
    { key: 'result', header: 'Result', render: (r) => <ResultBadge result={r.result} /> },
    { key: 'defectCount', header: 'Defects', render: (r) => (r.defectCount > 0 ? <Badge variant="destructive">{r.defectCount}</Badge> : '0') },
    { key: 'submittedAt', header: 'Date', render: (r) => (r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—') },
  ];

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-foreground">Inspection History</h1>
        <p className="text-sm text-muted-foreground mt-1">{pagination.total} inspection(s)</p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 max-w-xs">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by number, asset, form…" />
        </div>
        <div className="flex gap-1">
          {RESULT_FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={result === f.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setResult(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <DataTableToolbar
        columns={columns}
        hiddenColumnKeys={hiddenColumnKeys}
        onHiddenColumnKeysChange={setHiddenColumnKeys}
        density={density}
        onDensityChange={setDensity}
      />
      <DataTable<Row>
        columns={columns}
        data={rows}
        pagination={pagination}
        loading={loading}
        rowsPerPage={rowsPerPage}
        onPageChange={fetchRows}
        onRowsPerPageChange={setRowsPerPage}
        onRowClick={(r) => setDetailId(r.id)}
        rowKey={(r) => r.id}
        hiddenColumnKeys={hiddenColumnKeys}
        density={density}
        emptyMessage="No inspections yet."
      />

      <InspectionDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function InspectionDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [record, setRecord] = useState<DetailRecord | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/inspection-submissions/${id}`, { withCredentials: true });
        if (active) setRecord(res.data.data);
      } catch {
        if (active) setRecord(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const photos = Array.isArray(record?.photos) ? (record!.photos as string[]) : [];
  const signature = typeof record?.response?.operator_signature === 'string'
    ? (record.response.operator_signature as string)
    : '';

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{record?.inspectionNumber || 'Inspection'}</DialogTitle>
        </DialogHeader>

        {loading || !record ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-56" /><Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{record.assetName || record.unitNumber || 'Unlinked asset'}</p>
                <p className="text-muted-foreground">{record.formTitle}</p>
                {record.operatorName && (
                  <p className="text-xs text-muted-foreground mt-0.5">Operator: {record.operatorName}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {record.submittedAt ? new Date(record.submittedAt).toLocaleString() : ''}
                </p>
              </div>
              <ResultBadge result={record.result} />
            </div>

            {record.defects.length > 0 && (
              <div>
                <Separator className="mb-2" />
                <p className="font-medium mb-1.5">Defects ({record.defects.length})</p>
                <div className="space-y-1.5">
                  {record.defects.map((d, i) => (
                    <div key={i} className="flex items-center justify-between rounded border px-3 py-1.5">
                      <span>{d.label} — <span className="text-red-600">{Array.isArray(d.answer) ? d.answer.join(', ') : d.answer}</span></span>
                      <Badge variant={d.severity === 'critical' ? 'destructive' : 'outline'}>{d.severity}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {record.faultsComments && (
              <div>
                <p className="font-medium mb-1">Operator notes</p>
                <p className="text-muted-foreground">{record.faultsComments}</p>
              </div>
            )}

            {record.safeToOperate != null && (
              <p>Safe to operate: <span className="font-medium">{record.safeToOperate ? 'Yes' : 'No'}</span></p>
            )}

            {photos.length > 0 && (
              <div>
                <p className="font-medium mb-1">Photos</p>
                <div className="flex flex-wrap gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photos.map((u, i) => <img key={i} src={u} alt="" className="h-20 w-20 object-cover rounded border" />)}
                </div>
              </div>
            )}

            {signature && (
              <div>
                <p className="font-medium mb-1">Signature</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signature} alt="signature" className="border rounded bg-white h-24" />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
