/** Meter reading domain types. */
export type MeterType = 'odometer' | 'engine_hours';
export const METER_TYPES: MeterType[] = ['odometer', 'engine_hours'];

export interface AddMeterReadingInput {
  meterType: string;
  value: number;
  readingAt?: string;
  notes?: string;
}
