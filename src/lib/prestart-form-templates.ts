/**
 * Pre-start inspection form templates.
 *
 * Modelled after Whiparound-style inspection checklists with comprehensive
 * safety items grouped by system category.
 *
 * Each radio field uses pass / fail / na options — compatible with the
 * defect-settings architecture (admin ticks "fail" → defect created on submit).
 *
 * Field types used: text, number, datetime, radio, textarea, image, toggle, signature
 */
import type { SeverityValue } from '@/controller/defect-settings/types';

// ── helpers ──────────────────────────────────────────────────────────────────

let counter = 0;

function uid(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${prefix}_${rand}${counter}`;
}

function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ── common option sets ───────────────────────────────────────────────────────

function passFailNa() {
  return [
    { id: uid('opt'), title: 'Pass', value: 'pass' },
    { id: uid('opt'), title: 'Fail', value: 'fail' },
    { id: uid('opt'), title: 'N/A', value: 'na' },
  ];
}

// ── field builders ───────────────────────────────────────────────────────────

interface FieldBase {
  id: string;
  type: string;
  label: string;
  fieldKey: string;
  required: boolean;
  width: number;
  description?: string;
  placeholder?: string;
  hidden?: boolean;
}

function textField(
  label: string,
  opts: { required?: boolean; width?: number; placeholder?: string; fieldKey?: string } = {},
): FieldBase & { type: 'text' } {
  return {
    id: uid('f'),
    type: 'text' as const,
    label,
    fieldKey: opts.fieldKey || toFieldKey(label),
    required: opts.required ?? false,
    width: opts.width ?? 6,
    placeholder: opts.placeholder,
  };
}

function numberField(
  label: string,
  opts: { required?: boolean; width?: number; placeholder?: string; min?: number; fieldKey?: string } = {},
) {
  return {
    id: uid('f'),
    type: 'number' as const,
    label,
    fieldKey: opts.fieldKey || toFieldKey(label),
    required: opts.required ?? false,
    width: opts.width ?? 6,
    placeholder: opts.placeholder,
    min: opts.min,
  };
}

function datetimeField(
  label: string,
  opts: { required?: boolean; width?: number; fieldKey?: string } = {},
) {
  return {
    id: uid('f'),
    type: 'datetime' as const,
    label,
    fieldKey: opts.fieldKey || toFieldKey(label),
    required: opts.required ?? false,
    width: opts.width ?? 6,
    datetime: {
      picker: 'DATETIME' as const,
      format: 'DD/MM/YYYY',
      timeFormat: '12hrs' as const,
      defaultOption: 'TODAY' as const,
    },
  };
}

function radioField(
  label: string,
  options: { id: string; title: string; value: string }[],
  opts: { required?: boolean; width?: number; fieldKey?: string } = {},
) {
  return {
    id: uid('f'),
    type: 'radio' as const,
    label,
    fieldKey: opts.fieldKey || toFieldKey(label),
    required: opts.required ?? false,
    width: opts.width ?? 12,
    options,
  };
}

function textareaField(
  label: string,
  opts: { required?: boolean; width?: number; placeholder?: string; fieldKey?: string } = {},
) {
  return {
    id: uid('f'),
    type: 'textarea' as const,
    label,
    fieldKey: opts.fieldKey || toFieldKey(label),
    required: opts.required ?? false,
    width: opts.width ?? 12,
    placeholder: opts.placeholder,
  };
}

function imageField(
  label: string,
  opts: { required?: boolean; width?: number; multiple?: boolean; fieldKey?: string } = {},
) {
  return {
    id: uid('f'),
    type: 'image' as const,
    label,
    fieldKey: opts.fieldKey || toFieldKey(label),
    required: opts.required ?? false,
    width: opts.width ?? 12,
    multiple: opts.multiple ?? true,
  };
}

function toggleField(
  label: string,
  opts: { required?: boolean; width?: number; fieldKey?: string } = {},
) {
  return {
    id: uid('f'),
    type: 'toggle' as const,
    label,
    fieldKey: opts.fieldKey || toFieldKey(label),
    required: opts.required ?? false,
    width: opts.width ?? 12,
  };
}

function signatureField(
  label: string,
  opts: { required?: boolean; width?: number; fieldKey?: string } = {},
) {
  return {
    id: uid('f'),
    type: 'signature' as const,
    label,
    fieldKey: opts.fieldKey || toFieldKey(label),
    required: opts.required ?? false,
    width: opts.width ?? 12,
  };
}

// ── page builder ─────────────────────────────────────────────────────────────

function page(
  title: string,
  pageNumber: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
) {
  return { id: uid('page'), title, pageNumber, items };
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE A — Light Vehicle / Ute
//
// Ref: Whiparound DOT pre-trip — Engine, Exterior, Interior, Brakes
// ═════════════════════════════════════════════════════════════════════════════

function buildLightVehicleForm() {
  const headerFields = [
    textField('Unit Number', { required: true, placeholder: 'e.g. LV-001' }),
    textField('Operator', { required: true, placeholder: 'Full name' }),
    datetimeField('Date & Time', { required: true }),
    numberField('Odometer (km)', { required: true, placeholder: '0', min: 0, fieldKey: 'odometer_km' }),
  ];

  // ── Exterior & body ─────────────────────────────────────────────────────
  const exteriorFields = [
    radioField('Body condition & panels', passFailNa(), { required: true }),
    radioField('Lights & indicators', passFailNa(), { required: true }),
    radioField('Tyres — tread & pressure', passFailNa(), { required: true }),
    radioField('Wheels & wheel nuts', passFailNa(), { required: true }),
    radioField('Mirrors (all)', passFailNa(), { required: true }),
    radioField('Windscreen & wipers', passFailNa(), { required: true }),
    radioField('Number plates & registration', passFailNa(), { required: true }),
  ];

  // ── Under hood & mechanical ─────────────────────────────────────────────
  const mechanicalFields = [
    radioField('Engine oil level', passFailNa(), { required: true }),
    radioField('Coolant level', passFailNa(), { required: true }),
    radioField('Brake fluid level', passFailNa(), { required: true }),
    radioField('Power steering fluid', passFailNa(), { required: true }),
    radioField('Windscreen washer fluid', passFailNa(), { required: true }),
    radioField('No visible leaks', passFailNa(), { required: true }),
    radioField('Belts & hoses condition', passFailNa(), { required: true }),
    radioField('Battery terminals secure', passFailNa(), { required: true }),
  ];

  // ── Cab / interior ──────────────────────────────────────────────────────
  const interiorFields = [
    radioField('Seatbelts', passFailNa(), { required: true }),
    radioField('Horn', passFailNa(), { required: true }),
    radioField('Brakes (pedal feel)', passFailNa(), { required: true }),
    radioField('Park brake', passFailNa(), { required: true }),
    radioField('Steering', passFailNa(), { required: true }),
    radioField('Dashboard warning lights', passFailNa(), { required: true }),
    radioField('Gauges & instruments', passFailNa(), { required: true }),
    radioField('Air conditioning / heating', passFailNa(), { required: true }),
  ];

  // ── Safety equipment ────────────────────────────────────────────────────
  const safetyFields = [
    radioField('Fire extinguisher (charged & accessible)', passFailNa(), { required: true, fieldKey: 'fire_extinguisher' }),
    radioField('First aid kit', passFailNa(), { required: true }),
    radioField('Warning triangle / hazard equipment', passFailNa(), { required: true, fieldKey: 'warning_triangle' }),
    radioField('Exhaust & emissions', passFailNa(), { required: true }),
  ];

  // ── Sign-off ────────────────────────────────────────────────────────────
  const signoffFields = [
    textareaField('Faults / comments', { placeholder: 'Describe any faults or issues observed...', fieldKey: 'faults_comments' }),
    imageField('Photos', { multiple: true }),
    toggleField('Safe to operate', { required: true, fieldKey: 'safe_to_operate' }),
    signatureField('Operator signature', { required: true, fieldKey: 'signature' }),
  ];

  return {
    templateKey: 'light_vehicle_ute',
    title: 'Light Vehicle / Ute Pre-Start',
    description: 'Pre-start inspection checklist for light vehicles and utes.',
    category: 'prestart',
    pages: [
      page('Asset Information', 1, headerFields),
      page('Exterior & Body', 2, exteriorFields),
      page('Under Hood & Mechanical', 3, mechanicalFields),
      page('Cab & Interior', 4, interiorFields),
      page('Safety Equipment', 5, safetyFields),
      page('Sign-off', 6, signoffFields),
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE B — Heavy Vehicle / Truck
//
// Ref: Whiparound DOT pre-trip — Engine, Exterior, Interior, Brakes, Coupling
// ═════════════════════════════════════════════════════════════════════════════

function buildHeavyVehicleForm() {
  const headerFields = [
    textField('Unit Number', { required: true, placeholder: 'e.g. HV-010' }),
    textField('Driver', { required: true, placeholder: 'Full name' }),
    datetimeField('Date & Time', { required: true }),
    numberField('Odometer (km)', { required: true, placeholder: '0', min: 0, fieldKey: 'odometer_km' }),
    numberField('Engine Hours', { placeholder: '0', min: 0 }),
  ];

  // ── Engine compartment ──────────────────────────────────────────────────
  const engineFields = [
    radioField('Engine oil level', passFailNa(), { required: true }),
    radioField('Coolant level', passFailNa(), { required: true }),
    radioField('Power steering fluid', passFailNa(), { required: true }),
    radioField('Windscreen washer fluid', passFailNa(), { required: true }),
    radioField('Belts & hoses condition', passFailNa(), { required: true }),
    radioField('Battery condition & terminals', passFailNa(), { required: true, fieldKey: 'battery_condition' }),
    radioField('No visible leaks', passFailNa(), { required: true }),
    radioField('Exhaust system & DPF', passFailNa(), { required: true, fieldKey: 'exhaust_dpf' }),
  ];

  // ── Exterior & body ─────────────────────────────────────────────────────
  const exteriorFields = [
    radioField('Body & chassis condition', passFailNa(), { required: true, fieldKey: 'body_chassis' }),
    radioField('Lights, indicators & reflectors', passFailNa(), { required: true }),
    radioField('Tyres — tread & pressure (all axles)', passFailNa(), { required: true, fieldKey: 'tyres_all_axles' }),
    radioField('Wheels & wheel nuts', passFailNa(), { required: true }),
    radioField('Mirrors (all)', passFailNa(), { required: true }),
    radioField('Windscreen & wipers', passFailNa(), { required: true }),
    radioField('Mud flaps & splash guards', passFailNa(), { required: true, fieldKey: 'mud_flaps' }),
    radioField('Number plates & registration', passFailNa(), { required: true }),
  ];

  // ── Brakes ──────────────────────────────────────────────────────────────
  const brakeFields = [
    radioField('Service brakes', passFailNa(), { required: true }),
    radioField('Air brakes — pressure build-up', passFailNa(), { required: true, fieldKey: 'air_brakes_pressure' }),
    radioField('Air brakes — leak test', passFailNa(), { required: true, fieldKey: 'air_brakes_leak' }),
    radioField('Park brake', passFailNa(), { required: true }),
    radioField('Low-pressure warning', passFailNa(), { required: true, fieldKey: 'low_pressure_warning' }),
    radioField('Brake lines & hoses', passFailNa(), { required: true }),
  ];

  // ── Cab / interior ──────────────────────────────────────────────────────
  const interiorFields = [
    radioField('Seatbelts', passFailNa(), { required: true }),
    radioField('Horn', passFailNa(), { required: true }),
    radioField('Reversing alarm / camera', passFailNa(), { required: true, fieldKey: 'reversing_alarm_camera' }),
    radioField('Steering play', passFailNa(), { required: true }),
    radioField('Dashboard warning lights', passFailNa(), { required: true }),
    radioField('Gauges & instruments', passFailNa(), { required: true }),
    radioField('Air conditioning / heating', passFailNa(), { required: true }),
  ];

  // ── Coupling & load (trailer) ───────────────────────────────────────────
  const couplingFields = [
    radioField('Coupling / tow connection secure', passFailNa(), { required: true, fieldKey: 'coupling_connection' }),
    radioField('Air & electrical lines connected', passFailNa(), { required: true, fieldKey: 'air_electrical_lines' }),
    radioField('Trailer brakes operational', passFailNa(), { required: true }),
    radioField('Load restraint equipment', passFailNa(), { required: true }),
    radioField('Load distribution & securing', passFailNa(), { required: true, fieldKey: 'load_securing' }),
  ];

  // ── Safety equipment ────────────────────────────────────────────────────
  const safetyFields = [
    radioField('Fire extinguisher (charged & accessible)', passFailNa(), { required: true, fieldKey: 'fire_extinguisher' }),
    radioField('First aid kit', passFailNa(), { required: true }),
    radioField('Warning triangle / hazard equipment', passFailNa(), { required: true, fieldKey: 'warning_triangle' }),
    radioField('Spill kit', passFailNa(), { required: true }),
  ];

  // ── Sign-off ────────────────────────────────────────────────────────────
  const signoffFields = [
    textareaField('Faults / comments', { placeholder: 'Describe any faults or issues observed...', fieldKey: 'faults_comments' }),
    imageField('Photos', { multiple: true }),
    toggleField('Safe to operate', { required: true, fieldKey: 'safe_to_operate' }),
    signatureField('Driver signature', { required: true, fieldKey: 'signature' }),
  ];

  return {
    templateKey: 'heavy_vehicle_truck',
    title: 'Heavy Vehicle / Truck Pre-Start',
    description: 'Pre-start inspection checklist for heavy vehicles and trucks.',
    category: 'prestart',
    pages: [
      page('Asset Information', 1, headerFields),
      page('Engine Compartment', 2, engineFields),
      page('Exterior & Body', 3, exteriorFields),
      page('Brakes', 4, brakeFields),
      page('Cab & Interior', 5, interiorFields),
      page('Coupling & Load', 6, couplingFields),
      page('Safety Equipment', 7, safetyFields),
      page('Sign-off', 8, signoffFields),
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE C — Plant / Excavator
//
// Ref: Whiparound heavy equipment checklist — Safety/Cab, Engine/Fluids,
//      Undercarriage, Attachments, Sign-off
// ═════════════════════════════════════════════════════════════════════════════

function buildPlantExcavatorForm() {
  const headerFields = [
    textField('Unit Number', { required: true, placeholder: 'e.g. EX-005' }),
    textField('Operator', { required: true, placeholder: 'Full name' }),
    datetimeField('Date & Time', { required: true }),
    numberField('Engine Hours', { required: true, placeholder: '0', min: 0 }),
  ];

  // ── Engine & fluids ─────────────────────────────────────────────────────
  const engineFields = [
    radioField('Engine oil level', passFailNa(), { required: true }),
    radioField('Coolant level', passFailNa(), { required: true }),
    radioField('Hydraulic fluid level', passFailNa(), { required: true }),
    radioField('Fuel level sufficient', passFailNa(), { required: true }),
    radioField('No visible leaks', passFailNa(), { required: true }),
    radioField('Air filter / pre-cleaner', passFailNa(), { required: true, fieldKey: 'air_filter' }),
    radioField('Dashboard gauges normal', passFailNa(), { required: true }),
  ];

  // ── Undercarriage & structure ───────────────────────────────────────────
  const undercarriageFields = [
    radioField('Tracks / tyres & undercarriage', passFailNa(), { required: true }),
    radioField('Track tension & alignment', passFailNa(), { required: true }),
    radioField('Chassis & frame condition', passFailNa(), { required: true }),
    radioField('Swing bearing & bolts', passFailNa(), { required: true }),
    radioField('Ground-engaging tools (GET)', passFailNa(), { required: true, fieldKey: 'ground_engaging_tools' }),
  ];

  // ── Hydraulics & boom ───────────────────────────────────────────────────
  const hydraulicFields = [
    radioField('Hydraulic hoses & rams', passFailNa(), { required: true }),
    radioField('Boom & arm condition', passFailNa(), { required: true }),
    radioField('Attachment / bucket pins secure', passFailNa(), { required: true }),
    radioField('Quick hitch / coupler', passFailNa(), { required: true }),
    radioField('Cylinder pins & bushes', passFailNa(), { required: true }),
    radioField('Hydraulic controls function', passFailNa(), { required: true }),
  ];

  // ── Cab & safety ────────────────────────────────────────────────────────
  const cabFields = [
    radioField('ROPS / FOPS structure', passFailNa(), { required: true, fieldKey: 'rops_fops' }),
    radioField('Cabin condition & glass', passFailNa(), { required: true }),
    radioField('Seatbelt', passFailNa(), { required: true }),
    radioField('Mirrors & visibility', passFailNa(), { required: true }),
    radioField('Horn', passFailNa(), { required: true }),
    radioField('Reversing alarm / camera', passFailNa(), { required: true, fieldKey: 'reversing_alarm' }),
    radioField('Lights & beacon', passFailNa(), { required: true }),
    radioField('Guards & safety devices', passFailNa(), { required: true }),
    radioField('Fire extinguisher (charged & accessible)', passFailNa(), { required: true, fieldKey: 'fire_extinguisher' }),
  ];

  // ── Sign-off ────────────────────────────────────────────────────────────
  const signoffFields = [
    textareaField('Faults / comments', { placeholder: 'Describe any faults or issues observed...', fieldKey: 'faults_comments' }),
    imageField('Photos', { multiple: true }),
    toggleField('Safe to operate', { required: true, fieldKey: 'safe_to_operate' }),
    signatureField('Operator signature', { required: true, fieldKey: 'signature' }),
  ];

  return {
    templateKey: 'plant_excavator',
    title: 'Plant / Excavator Pre-Start',
    description: 'Pre-start inspection checklist for plant equipment and excavators.',
    category: 'prestart',
    pages: [
      page('Asset Information', 1, headerFields),
      page('Engine & Fluids', 2, engineFields),
      page('Undercarriage & Structure', 3, undercarriageFields),
      page('Hydraulics & Boom', 4, hydraulicFields),
      page('Cab & Safety', 5, cabFields),
      page('Sign-off', 6, signoffFields),
    ],
  };
}

// ── public API ───────────────────────────────────────────────────────────────

export interface PrestartFormTemplate {
  templateKey: string;
  title: string;
  description: string;
  category: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pages: any[];
}

/** Force every field optional — operators can submit a partial inspection. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeAllOptional(pages: any[]): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (items: any[]) => {
    for (const f of items || []) {
      if (!f) continue;
      f.required = false;
      if (Array.isArray(f.items)) walk(f.items);
    }
  };
  for (const page of pages) if (Array.isArray(page.items)) walk(page.items);
}

export function getPrestartFormTemplates(): PrestartFormTemplate[] {
  // Reset counter each time so IDs are deterministic within a single call
  counter = 0;
  const templates = [
    buildLightVehicleForm(),
    buildHeavyVehicleForm(),
    buildPlantExcavatorForm(),
  ];
  for (const t of templates) makeAllOptional(t.pages);
  return templates;
}

// ── default defect settings derivation ─────────────────────────────────────────

/**
 * Option values that mean "this item failed" — used to pre-tick defect answers
 * when seeding, so auto-defect creation works out of the box. Admins can still
 * adjust ticks afterwards in the Defect Settings screen.
 */
const BAD_OPTION_VALUES = new Set([
  'fail', 'failed', 'no', 'not_working', 'notworking', 'damaged', 'defective',
  'unsafe', 'faulty', 'poor', 'bad', 'leaking', 'broken', 'low',
]);

/** Items whose failure is safety-critical → seeded with `critical` severity. */
const CRITICAL_LABEL_RE =
  /\b(brake|steering|tyre|tire|seat\s?belt|coupling|tow|wheel|suspension|emergency|fire|hydraulic|rops|fops|horn)\b/i;

const DEFECT_ELIGIBLE_CHOICE = new Set(['dropdown', 'radio', 'multiselect']);

export interface DerivedDefectSettings {
  defectAnswers: Record<string, string[]>;
  severityByField: Record<string, SeverityValue>;
}

/**
 * Derive default defect settings from a template: for every choice item that
 * has a "bad" option (e.g. Fail), mark that value as a defect, with critical
 * severity for safety-critical items.
 */
export function deriveDefectSettingsFromTemplate(
  template: PrestartFormTemplate,
): DerivedDefectSettings {
  const defectAnswers: Record<string, string[]> = {};
  const severityByField: Record<string, SeverityValue> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (items: any[]) => {
    for (const field of items) {
      if (field.type === 'fieldgroup' && Array.isArray(field.items)) {
        walk(field.items);
        continue;
      }
      if (!DEFECT_ELIGIBLE_CHOICE.has(field.type) || !Array.isArray(field.options) || !field.fieldKey) {
        continue;
      }
      const bad = (field.options as { value: string }[])
        .map((o) => String(o.value))
        .filter((v) => BAD_OPTION_VALUES.has(v.toLowerCase()));
      if (bad.length === 0) continue;

      defectAnswers[field.fieldKey] = bad;
      severityByField[field.fieldKey] = CRITICAL_LABEL_RE.test(field.label || '')
        ? 'critical'
        : 'non_critical';
    }
  };

  for (const page of template.pages) {
    if (Array.isArray(page.items)) walk(page.items);
  }

  return { defectAnswers, severityByField };
}
