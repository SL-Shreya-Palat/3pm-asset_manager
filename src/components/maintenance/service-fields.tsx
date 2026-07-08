'use client';

/**
 * Shared service-form fields, reused by the "Log Service" (asset Service tab)
 * and "Complete & Sign Off" (work orders) dialogs to keep them DRY.
 */
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/** Odometer / engine-hours meter-type selector. */
export function MeterTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="odometer">Odometer (km)</SelectItem>
        <SelectItem value="engine_hours">Engine hours</SelectItem>
        <SelectItem value="hubometer">Hubometer</SelectItem>
      </SelectContent>
    </Select>
  );
}
