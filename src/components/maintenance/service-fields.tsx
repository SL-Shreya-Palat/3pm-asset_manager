'use client';

/**
 * Shared service-form fields, reused by the "Log Service" (asset Service tab)
 * and "Complete & Sign Off" (work orders) dialogs to keep them DRY.
 */
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/** Odometer / engine-hours meter-type selector. */
export function MeterTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="odometer">Odometer (mi/km)</SelectItem>
        <SelectItem value="engine_hours">Engine hours</SelectItem>
      </SelectContent>
    </Select>
  );
}

export interface ProgramOption {
  programId: string;
  title: string;
}

/** Multi-select checklist of service programs. Renders nothing when empty. */
export function ProgramChecklist({
  programs,
  selected,
  onToggle,
  label,
}: {
  programs: ProgramOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  label: string;
}) {
  if (programs.length === 0) return null;
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 rounded-md border border-border divide-y divide-border">
        {programs.map((p) => (
          <label key={p.programId} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/30">
            <input
              type="checkbox"
              checked={selected.has(p.programId)}
              onChange={() => onToggle(p.programId)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-foreground">{p.title}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
