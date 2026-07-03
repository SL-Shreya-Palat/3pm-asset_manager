/**
 * Pre-start inspection form templates.
 *
 * Asset templates (A–C) are modelled after Whiparound-style inspection
 * checklists with pass / fail / na options — compatible with the auto-derived
 * defect-settings architecture.
 *
 * The Driver Wellness template (D) is a fitness-for-duty assessment with
 * custom option values; its defect settings are supplied explicitly via
 * `customDefectSettings` since the pass/fail auto-derivation does not apply.
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
    textField('Unit Number', { placeholder: 'e.g. LV-001' }),
    datetimeField('Date & Time'),
    numberField('Odometer (km)', { placeholder: '0', min: 0, fieldKey: 'odometer_km' }),
  ];

  // ── Exterior & body ─────────────────────────────────────────────────────
  const exteriorFields = [
    radioField('Body condition & panels', passFailNa()),
    radioField('Lights & indicators', passFailNa()),
    radioField('Tyres — tread & pressure', passFailNa()),
    radioField('Wheels & wheel nuts', passFailNa()),
    radioField('Mirrors (all)', passFailNa()),
    radioField('Windscreen & wipers', passFailNa()),
    radioField('Number plates & registration', passFailNa()),
  ];

  // ── Under hood & mechanical ─────────────────────────────────────────────
  const mechanicalFields = [
    radioField('Engine oil level', passFailNa()),
    radioField('Coolant level', passFailNa()),
    radioField('Brake fluid level', passFailNa()),
    radioField('Power steering fluid', passFailNa()),
    radioField('Windscreen washer fluid', passFailNa()),
    radioField('No visible leaks', passFailNa()),
    radioField('Belts & hoses condition', passFailNa()),
    radioField('Battery terminals secure', passFailNa()),
  ];

  // ── Cab / interior ──────────────────────────────────────────────────────
  const interiorFields = [
    radioField('Seatbelts', passFailNa()),
    radioField('Horn', passFailNa()),
    radioField('Brakes (pedal feel)', passFailNa()),
    radioField('Park brake', passFailNa()),
    radioField('Steering', passFailNa()),
    radioField('Dashboard warning lights', passFailNa()),
    radioField('Gauges & instruments', passFailNa()),
    radioField('Air conditioning / heating', passFailNa()),
  ];

  // ── Safety equipment ────────────────────────────────────────────────────
  const safetyFields = [
    radioField('Fire extinguisher (charged & accessible)', passFailNa(), { fieldKey: 'fire_extinguisher' }),
    radioField('First aid kit', passFailNa()),
    radioField('Warning triangle / hazard equipment', passFailNa(), { fieldKey: 'warning_triangle' }),
    radioField('Exhaust & emissions', passFailNa()),
  ];

  // ── Sign-off ────────────────────────────────────────────────────────────
  const signoffFields = [
    textareaField('Faults / comments', { placeholder: 'Describe any faults or issues observed...', fieldKey: 'faults_comments' }),
    imageField('Photos', { multiple: true }),
    toggleField('Safe to operate', { fieldKey: 'safe_to_operate' }),
    signatureField('Operator signature', { fieldKey: 'signature' }),
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
    textField('Unit Number', { placeholder: 'e.g. HV-010' }),
    datetimeField('Date & Time'),
    numberField('Odometer (km)', { placeholder: '0', min: 0, fieldKey: 'odometer_km' }),
    numberField('Engine Hours', { placeholder: '0', min: 0 }),
  ];

  // ── Engine compartment ──────────────────────────────────────────────────
  const engineFields = [
    radioField('Engine oil level', passFailNa()),
    radioField('Coolant level', passFailNa()),
    radioField('Power steering fluid', passFailNa()),
    radioField('Windscreen washer fluid', passFailNa()),
    radioField('Belts & hoses condition', passFailNa()),
    radioField('Battery condition & terminals', passFailNa(), { fieldKey: 'battery_condition' }),
    radioField('No visible leaks', passFailNa()),
    radioField('Exhaust system & DPF', passFailNa(), { fieldKey: 'exhaust_dpf' }),
  ];

  // ── Exterior & body ─────────────────────────────────────────────────────
  const exteriorFields = [
    radioField('Body & chassis condition', passFailNa(), { fieldKey: 'body_chassis' }),
    radioField('Lights, indicators & reflectors', passFailNa()),
    radioField('Tyres — tread & pressure (all axles)', passFailNa(), { fieldKey: 'tyres_all_axles' }),
    radioField('Wheels & wheel nuts', passFailNa()),
    radioField('Mirrors (all)', passFailNa()),
    radioField('Windscreen & wipers', passFailNa()),
    radioField('Mud flaps & splash guards', passFailNa(), { fieldKey: 'mud_flaps' }),
    radioField('Number plates & registration', passFailNa()),
  ];

  // ── Brakes ──────────────────────────────────────────────────────────────
  const brakeFields = [
    radioField('Service brakes', passFailNa()),
    radioField('Air brakes — pressure build-up', passFailNa(), { fieldKey: 'air_brakes_pressure' }),
    radioField('Air brakes — leak test', passFailNa(), { fieldKey: 'air_brakes_leak' }),
    radioField('Park brake', passFailNa()),
    radioField('Low-pressure warning', passFailNa(), { fieldKey: 'low_pressure_warning' }),
    radioField('Brake lines & hoses', passFailNa()),
  ];

  // ── Cab / interior ──────────────────────────────────────────────────────
  const interiorFields = [
    radioField('Seatbelts', passFailNa()),
    radioField('Horn', passFailNa()),
    radioField('Reversing alarm / camera', passFailNa(), { fieldKey: 'reversing_alarm_camera' }),
    radioField('Steering play', passFailNa()),
    radioField('Dashboard warning lights', passFailNa()),
    radioField('Gauges & instruments', passFailNa()),
    radioField('Air conditioning / heating', passFailNa()),
  ];

  // ── Coupling & load (trailer) ───────────────────────────────────────────
  const couplingFields = [
    radioField('Coupling / tow connection secure', passFailNa(), { fieldKey: 'coupling_connection' }),
    radioField('Air & electrical lines connected', passFailNa(), { fieldKey: 'air_electrical_lines' }),
    radioField('Trailer brakes operational', passFailNa()),
    radioField('Load restraint equipment', passFailNa()),
    radioField('Load distribution & securing', passFailNa(), { fieldKey: 'load_securing' }),
  ];

  // ── Safety equipment ────────────────────────────────────────────────────
  const safetyFields = [
    radioField('Fire extinguisher (charged & accessible)', passFailNa(), { fieldKey: 'fire_extinguisher' }),
    radioField('First aid kit', passFailNa()),
    radioField('Warning triangle / hazard equipment', passFailNa(), { fieldKey: 'warning_triangle' }),
    radioField('Spill kit', passFailNa()),
  ];

  // ── Sign-off ────────────────────────────────────────────────────────────
  const signoffFields = [
    textareaField('Faults / comments', { placeholder: 'Describe any faults or issues observed...', fieldKey: 'faults_comments' }),
    imageField('Photos', { multiple: true }),
    toggleField('Safe to operate', { fieldKey: 'safe_to_operate' }),
    signatureField('Operator signature', { fieldKey: 'signature' }),
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
    textField('Unit Number', { placeholder: 'e.g. EX-005' }),
    datetimeField('Date & Time'),
    numberField('Engine Hours', { placeholder: '0', min: 0 }),
  ];

  // ── Engine & fluids ─────────────────────────────────────────────────────
  const engineFields = [
    radioField('Engine oil level', passFailNa()),
    radioField('Coolant level', passFailNa()),
    radioField('Hydraulic fluid level', passFailNa()),
    radioField('Fuel level sufficient', passFailNa()),
    radioField('No visible leaks', passFailNa()),
    radioField('Air filter / pre-cleaner', passFailNa(), { fieldKey: 'air_filter' }),
    radioField('Dashboard gauges normal', passFailNa()),
  ];

  // ── Undercarriage & structure ───────────────────────────────────────────
  const undercarriageFields = [
    radioField('Tracks / tyres & undercarriage', passFailNa()),
    radioField('Track tension & alignment', passFailNa()),
    radioField('Chassis & frame condition', passFailNa()),
    radioField('Swing bearing & bolts', passFailNa()),
    radioField('Ground-engaging tools (GET)', passFailNa(), { fieldKey: 'ground_engaging_tools' }),
  ];

  // ── Hydraulics & boom ───────────────────────────────────────────────────
  const hydraulicFields = [
    radioField('Hydraulic hoses & rams', passFailNa()),
    radioField('Boom & arm condition', passFailNa()),
    radioField('Attachment / bucket pins secure', passFailNa()),
    radioField('Quick hitch / coupler', passFailNa()),
    radioField('Cylinder pins & bushes', passFailNa()),
    radioField('Hydraulic controls function', passFailNa()),
  ];

  // ── Cab & safety ────────────────────────────────────────────────────────
  const cabFields = [
    radioField('ROPS / FOPS structure', passFailNa(), { fieldKey: 'rops_fops' }),
    radioField('Cabin condition & glass', passFailNa()),
    radioField('Seatbelt', passFailNa()),
    radioField('Mirrors & visibility', passFailNa()),
    radioField('Horn', passFailNa()),
    radioField('Reversing alarm / camera', passFailNa(), { fieldKey: 'reversing_alarm' }),
    radioField('Lights & beacon', passFailNa()),
    radioField('Guards & safety devices', passFailNa()),
    radioField('Fire extinguisher (charged & accessible)', passFailNa(), { fieldKey: 'fire_extinguisher' }),
  ];

  // ── Sign-off ────────────────────────────────────────────────────────────
  const signoffFields = [
    textareaField('Faults / comments', { placeholder: 'Describe any faults or issues observed...', fieldKey: 'faults_comments' }),
    imageField('Photos', { multiple: true }),
    toggleField('Safe to operate', { fieldKey: 'safe_to_operate' }),
    signatureField('Operator signature', { fieldKey: 'signature' }),
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

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE D — Driver Wellness Pre-Start Check
//
// Driver-centric fitness-for-duty check covering fatigue, substance use,
// medical fitness, mental wellbeing, and PPE compliance.
// ═════════════════════════════════════════════════════════════════════════════

function buildDriverWellnessForm() {
  // ── Wellness assessment ─────────────────────────────────────────────────
  const wellnessFields = [
    radioField('Hours of sleep in the last 24 hours', [
      { id: uid('opt'), title: '7 hours or more', value: '7_plus' },
      { id: uid('opt'), title: '5–7 hours', value: '5_to_7' },
      { id: uid('opt'), title: 'Less than 5 hours', value: 'under_5' },
    ], { fieldKey: 'sleep_hours' }),

    radioField('Current fatigue level', [
      { id: uid('opt'), title: 'Alert and well-rested', value: 'alert' },
      { id: uid('opt'), title: 'Slightly tired but fit to work', value: 'slightly_tired' },
      { id: uid('opt'), title: 'Fatigued / drowsy', value: 'fatigued' },
      { id: uid('opt'), title: 'Severely fatigued / unable to concentrate', value: 'severely_fatigued' },
    ], { fieldKey: 'fatigue_level' }),

    radioField('Have you consumed alcohol in the last 12 hours?', [
      { id: uid('opt'), title: 'No', value: 'no' },
      { id: uid('opt'), title: 'Yes', value: 'yes' },
    ], { fieldKey: 'alcohol_consumed' }),

    radioField('Are you under the influence of any drugs or medications that may impair your ability to drive or operate equipment?', [
      { id: uid('opt'), title: 'No', value: 'no' },
      { id: uid('opt'), title: 'Yes — prescribed (may cause drowsiness)', value: 'yes_prescribed' },
      { id: uid('opt'), title: 'Yes — other', value: 'yes_other' },
    ], { fieldKey: 'drugs_medication' }),

    radioField('Do you have any illness, injury, or medical condition that could affect your ability to perform duties safely?', [
      { id: uid('opt'), title: 'No', value: 'no' },
      { id: uid('opt'), title: 'Yes — minor (manageable)', value: 'yes_minor' },
      { id: uid('opt'), title: 'Yes — significant (may affect performance)', value: 'yes_significant' },
    ], { fieldKey: 'medical_condition' }),

    radioField('Emotional and mental wellbeing', [
      { id: uid('opt'), title: 'Good — feeling well and focused', value: 'good' },
      { id: uid('opt'), title: 'Fair — some stress but manageable', value: 'fair' },
      { id: uid('opt'), title: 'Poor — distracted, anxious, or upset', value: 'poor' },
    ], { fieldKey: 'mental_wellbeing' }),

    radioField('Vision and hearing', [
      { id: uid('opt'), title: 'No issues', value: 'no_issues' },
      { id: uid('opt'), title: 'Minor issue (e.g. mild headache, slight blur)', value: 'minor_issue' },
      { id: uid('opt'), title: 'Impaired — affecting ability to operate safely', value: 'impaired' },
    ], { fieldKey: 'vision_hearing' }),

    radioField('Physical fitness to perform tasks', [
      { id: uid('opt'), title: 'Fit — no restrictions', value: 'fit' },
      { id: uid('opt'), title: 'Restricted — can perform some tasks', value: 'restricted' },
      { id: uid('opt'), title: 'Unfit — unable to perform physical tasks safely', value: 'unfit' },
    ], { fieldKey: 'physical_fitness' }),

    radioField('Are you wearing all required PPE for this shift?', [
      { id: uid('opt'), title: 'Yes', value: 'yes' },
      { id: uid('opt'), title: 'No', value: 'no' },
    ], { fieldKey: 'ppe_worn' }),

    radioField('Have you been briefed on today\'s tasks, hazards, and site conditions?', [
      { id: uid('opt'), title: 'Yes', value: 'yes' },
      { id: uid('opt'), title: 'No', value: 'no' },
      { id: uid('opt'), title: 'N/A', value: 'na' },
    ], { fieldKey: 'briefing_received' }),
  ];

  // ── Declaration & sign-off ──────────────────────────────────────────────
  const signoffFields = [
    textareaField('Comments / Additional information', {
      placeholder: 'Note anything relevant to your fitness for duty...',
      fieldKey: 'signoff_comments',
    }),
    imageField('Supporting photos', { multiple: true, fieldKey: 'signoff_photos' }),
    toggleField('I declare that I am fit for duty', { fieldKey: 'fit_for_duty' }),
    signatureField('Driver Signature', { required: true, fieldKey: 'driver_signature' }),
  ];

  return {
    templateKey: 'driver_wellness',
    title: 'Driver Wellness Pre-Start Check',
    description: 'Driver fitness-for-duty assessment covering fatigue, substance use, medical fitness, mental wellbeing, and PPE compliance.',
    category: 'prestart',
    pages: [
      page('Wellness Assessment', 1, wellnessFields),
      page('Declaration & Sign-Off', 2, signoffFields),
    ],
    // Explicit defect settings — the generic derivation (pass/fail) does not
    // apply to wellness questions where "yes" can be a bad answer.
    customDefectSettings: {
      defectAnswers: {
        sleep_hours: ['under_5'],
        fatigue_level: ['fatigued', 'severely_fatigued'],
        alcohol_consumed: ['yes'],
        drugs_medication: ['yes_prescribed', 'yes_other'],
        medical_condition: ['yes_significant'],
        mental_wellbeing: ['poor'],
        vision_hearing: ['impaired'],
        physical_fitness: ['unfit'],
        ppe_worn: ['no'],
        briefing_received: ['no'],
      } as Record<string, string[]>,
      severityByField: {
        fatigue_level: 'high' as SeverityValue,
        alcohol_consumed: 'high' as SeverityValue,
        drugs_medication: 'high' as SeverityValue,
        vision_hearing: 'high' as SeverityValue,
        physical_fitness: 'high' as SeverityValue,
        sleep_hours: 'low' as SeverityValue,
        medical_condition: 'medium' as SeverityValue,
        mental_wellbeing: 'medium' as SeverityValue,
        ppe_worn: 'medium' as SeverityValue,
        briefing_received: 'low' as SeverityValue,
      } as Record<string, SeverityValue>,
    },
  };
}

// ── schema version ───────────────────────────────────────────────────────────
// Bump this whenever template schemas change so the auto-update mechanism
// detects stale forms and re-publishes them.
export const PRESTART_TEMPLATE_SCHEMA_VERSION = 2;

// ── public API ───────────────────────────────────────────────────────────────

export interface PrestartFormTemplate {
  templateKey: string;
  title: string;
  description: string;
  category: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pages: any[];
  /** Explicit defect settings for templates where auto-derivation doesn't apply. */
  customDefectSettings?: DerivedDefectSettings;
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
    buildDriverWellnessForm(),
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

/** Items whose failure is safety-critical → seeded with `high` severity. */
const CRITICAL_LABEL_RE =
  /\b(brake|steering|tyre|tire|seat\s?belt|coupling|tow|wheel|suspension|emergency|fire|hydraulic|rops|fops|horn)\b/i;

const DEFECT_ELIGIBLE_CHOICE = new Set(['dropdown', 'radio', 'multiselect']);

export interface DerivedDefectSettings {
  defectAnswers: Record<string, string[]>;
  severityByField: Record<string, SeverityValue>;
}

/**
 * Derive default defect settings from a template: for every choice item that
 * has a "bad" option (e.g. Fail), mark that value as a defect, with high
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
        ? 'high'
        : 'low';
    }
  };

  for (const page of template.pages) {
    if (Array.isArray(page.items)) walk(page.items);
  }

  return { defectAnswers, severityByField };
}
