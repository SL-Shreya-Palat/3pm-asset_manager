/** Meter reading domain types. */
export type MeterType = 'odometer' | 'engine_hours' | 'hubometer';
export const METER_TYPES: MeterType[] = ['odometer', 'engine_hours', 'hubometer'];

export interface AddMeterReadingInput {
  meterType: string;
  value: number;
  readingAt?: string;
  notes?: string;
}
