/*
 * What can be imported from Excel and how each column is read.
 * Labels and aliases follow the farm's own record sheets (GlobalG.A.P. harvest
 * record, EC/pH record, fertigation worksheet, PPP application record, PPP data
 * sheet), so their headers match without editing.
 */

export type ValueType = 'date' | 'time' | 'text' | 'number' | 'int' | 'percent' | 'flag' | 'columns';

export type FieldSpec = {
  key: string;
  label: string;
  required: boolean;
  type: ValueType;
  description?: string;
  /** Other header names used for this column (matched without case, spaces or punctuation). */
  aliases?: string[];
  /** Allowed range for numbers; a value outside it is reported on its row instead of stopping the import. */
  min?: number;
  max?: number;
};

export type TargetKey = 'harvests' | 'ecph' | 'ecph_full' | 'fertigation' | 'pesticide_products' | 'pesticide_applications';

export type TargetSpec = {
  key: TargetKey;
  label: string;
  description: string;
  fields: FieldSpec[];
  /** The target needs a field name on every row (master-data lists do not). */
  needsField: boolean;
  /** Columns that make two rows the same record (the page drops repeats before sending). */
  sameRecord: string[];
  /** Options the page can switch on for this target. */
  options?: Array<{ key: string; label: string; description: string }>;
};

const f = (key: string, label: string, type: ValueType, required = false, aliases: string[] = [], description?: string): FieldSpec =>
  ({ key, label, type, required, aliases, ...(description ? { description } : {}) });
/** Same, with the range the value must fall in (the database column's limit or the agronomic one). */
const n = (key: string, label: string, type: ValueType, min: number, max: number, aliases: string[] = [], description?: string): FieldSpec =>
  ({ ...f(key, label, type, false, aliases, description), min, max });

const FIELD = ['field', 'field id', 'field name', 'field name/id', 'location', 'nh location', 'house', 'nethouse', 'greenhouse', 'block', 'farm code', 'plot', 'الحقل', 'الموقع', 'البيت', 'رقم البيت'];
const CROP = ['crop', 'product name', 'المحصول'];
const VARIETY = ['variety', 'cultivar', 'الصنف'];

export const TARGETS: Record<TargetKey, TargetSpec> = {
  harvests: {
    key: 'harvests',
    sameRecord: ['field_name', 'date', 'batch_number', 'segment_id', 'total_quantity', 'start_time'],
    label: 'Harvest record',
    description: 'One row per harvest of a field (receipt or batch). The crop comes from the sheet, else from Crop Rotation.',
    needsField: true,
    fields: [
      f('field_name', 'Field name', 'text', true, FIELD),
      f('date', 'Date of harvest', 'date', true, ['date', 'harvest date', 'date of harvest', 'التاريخ', 'تاريخ']),
      { ...f('total_quantity', 'Total harvested quantity (kg)', 'number', true, ['quantity', 'qty', 'harvest qty', 'total quantity', 'weight', 'kg', 'الكمية', 'الوزن', 'الانتاج', 'الإنتاج']), min: 0, max: 99999999 },
      f('crop_name', 'Crop', 'text', false, CROP),
      f('variety_name', 'Variety', 'text', false, VARIETY),
      f('start_time', 'Start time', 'time', false, ['start']),
      f('end_time', 'End time', 'time', false, ['end']),
      f('shift_number', 'Shift number', 'text', false, ['shift']),
      f('batch_number', 'Receipt or batch number', 'text', false, ['receipt no/batch number', 'batch number', 'batch', 'receipt', 'lot']),
      f('segment_id', 'Segment (valve, side, section)', 'text', false, ['segment id', 'segment', 'section', 'bay']),
      n('harvested_area_ha', 'Harvested area (ha)', 'number', 0, 999999, ['total harvested area ha', 'harvested area', 'area ha']),
      f('packhouse', 'Packhouse', 'text', false, ['transported into', 'tranposrted into packhouse name', 'packhouse name']),
      f('authorized_by', 'Authorized and verified by', 'text', false, ['authorized and verified by', 'authorized by', 'verified by']),
      f('week_number', 'Week number', 'int', false, ['week no', 'week', 'الاسبوع', 'الأسبوع']),
      f('notes', 'Notes', 'text', false, ['note', 'remarks', 'comments', 'ملاحظات']),
    ],
  },
  ecph_full: {
    key: 'ecph_full',
    sameRecord: ['field_name', 'date', 'time', 'valve_number'],
    label: 'EC & pH record (valves)',
    description: 'One row per valve. Rows of the same field, date and time make one reading; blank cells under merged dates are filled.',
    needsField: true,
    fields: [
      f('field_name', 'Field (NH location)', 'text', true, FIELD),
      f('date', 'Date', 'date', true, ['date', 'التاريخ']),
      f('valve_number', 'Valve', 'int', true, ['valve', 'valve no', 'valve number', 'صمام']),
      f('time', 'Time', 'time', false, ['time', 'الوقت']),
      n('ec_in', 'EC in', 'number', 0, 50, ['ec drip', 'drip ec']),
      n('ec_out', 'EC out', 'number', 0, 50, ['ec drain', 'drain ec']),
      n('ph_in', 'pH in', 'number', 0, 14, ['ph drip', 'drip ph']),
      n('ph_out', 'pH out', 'number', 0, 14, ['ph drain', 'drain ph']),
      n('drip_volume', 'Drip volume', 'number', 0, 999999, ['drip volume', 'drip']),
      n('drain_volume', 'Drain volume', 'number', 0, 99999999, ['drain volume']),
      n('percent_drain', '% Drain', 'percent', 0, 999.99, ['drain %', '%drain', 'drain percent'], 'Fractions (0.53) are read as 53%'),
      f('qty_of_water', 'Qty of water (m³)', 'number', false, ['qty of water m3', 'qty of water']),
      f('cycle', 'Cycle', 'int', false, ['cycles']),
      f('total_water_qty', 'Total water qty', 'number', false, ['total water qty']),
      f('total_water_drip', 'Total water qty based on drip volume', 'number', false, ['total water qty based on drip volume']),
      f('weather_condition', 'Weather', 'text', false, ['weather', 'weather condition']),
      f('irrigation_status', 'Irrigation or pipe status', 'text', false, ['irrigation status', 'pipe status']),
      f('crop_name', 'Crop', 'text', false, CROP),
    ],
  },
  ecph: {
    key: 'ecph',
    sameRecord: ['field_name', 'date', 'time'],
    label: 'EC & pH water only',
    description: 'Water per reading without valve values. Use the EC & pH record for valve readings.',
    needsField: true,
    fields: [
      f('field_name', 'Field', 'text', true, FIELD),
      f('date', 'Date', 'date', true, ['date', 'التاريخ']),
      f('time', 'Time', 'time', false, ['time']),
      f('qty_of_water', 'Qty of water (m³)', 'number', false, ['qty of water m3', 'qty of water']),
      f('cycle', 'Cycle', 'int', false, ['cycles']),
      f('total_water_qty', 'Total water qty', 'number', false, ['total water qty']),
      f('crop_name', 'Crop', 'text', false, CROP),
    ],
  },
  fertigation: {
    key: 'fertigation',
    sameRecord: ['field_name', 'date', 'daily_water', 'total_fertilizer', 'fertilizer_columns'],
    label: 'Fertigation worksheet',
    description: 'One row per field and day. Fertilizer columns are kept per product and added up into the total.',
    needsField: true,
    fields: [
      f('field_name', 'Field ID', 'text', true, FIELD),
      f('date', 'Date', 'date', true, ['date', 'التاريخ']),
      f('week_number', 'Week number', 'int', false, ['week no', 'week']),
      f('valves_count', 'Number of valves', 'int', false, ['number of valves', 'no of valves', 'valves']),
      n('flow_rate', 'Water qty per valve (m³)', 'number', 0, 99999999, ['water qty m3/valve', 'water qty']),
      f('frequency', 'Frequency (cycles a day)', 'int', false, ['frequency', 'cycles']),
      n('daily_water', 'Daily total (m³)', 'number', 0, 99999999, ['daily total m3', 'daily total', 'daily water']),
      n('total_fertilizer', 'Total fertilizer (kg)', 'number', 0, 99999999, ['total fertilizer', 'total fert']),
      f('fertilizer_columns', 'Fertilizer columns (kg)', 'columns', false, [], 'Each picked column is one fertilizer; its name is the column header'),
      f('crop_name', 'Crop', 'text', false, CROP),
      f('variety_name', 'Variety', 'text', false, VARIETY),
    ],
  },
  pesticide_products: {
    key: 'pesticide_products',
    sameRecord: ['name'],
    label: 'PPP data sheet (product catalog)',
    description: 'Plant protection products with active ingredient, PHI and intervals. Products already in the catalog are kept as they are.',
    needsField: false,
    fields: [
      f('name', 'Product trade name', 'text', true, ['product trade name', 'trade name', 'product name', 'name of ppp', 'product']),
      f('active_ingredient', 'Active ingredient', 'text', false, ['active ingredient s', 'active ingredients', 'a i']),
      f('target_crops', 'Target crops', 'text', false, ['target crop s', 'target crops']),
      f('target_pests', 'Target diseases and pests', 'text', false, ['traget disease/pests', 'target disease/pests', 'target pests']),
      f('max_individual_dose', 'Maximum individual dose', 'text', false, []),
      f('max_total_dose', 'Maximum total dose', 'text', false, []),
      f('max_applications', 'Maximum number of applications', 'text', false, []),
      f('growth_stage', 'Time of application (growth stage)', 'text', false, ['growth stage']),
      f('spray_interval', 'Spray interval', 'text', false, []),
      f('phi', 'PHI', 'text', false, ['pre-harvest interval', 'phi days'], 'Text such as "3 days"; the number of days is kept for PHI checks'),
      f('re_entry_interval', 'Re-entry interval', 'text', false, ['re entry interval', 'rei']),
      f('bumble_bee_interval', 'Interval for bumble bees', 'text', false, ['bumble bees']),
      f('chemical_category', 'Chemical category', 'text', false, ['category', 'irac', 'frac']),
      f('has_label_msds', 'Label and MSDS available', 'flag', false, ['availability of label & msds', 'label msds']),
    ],
  },
  pesticide_applications: {
    key: 'pesticide_applications',
    sameRecord: ['field_name', 'date', 'product_name', 'start_time'],
    label: 'PPP application record',
    description: 'Past sprays, approved as recorded. The clear-to-harvest date comes from the sheet, else from the PHI.',
    needsField: true,
    options: [
      { key: 'createMissingProducts', label: 'Add products that are not in the catalog', description: 'A product name the catalog does not have is added with the active ingredient and PHI from the row' },
    ],
    fields: [
      f('field_name', 'Field ID (pivot, NH, GH)', 'text', true, FIELD),
      f('date', 'PPP application date', 'date', true, ['ppp application date', 'application date', 'date']),
      f('product_name', 'Name of PPP', 'text', true, ['name of ppp', 'product', 'product name', 'trade name']),
      f('crop_name', 'Crop', 'text', false, ['crop']),
      f('variety', 'Variety', 'text', false, VARIETY),
      f('segment_id', 'Segment (bay, section)', 'text', false, ['segment id', 'segment', 'bay']),
      f('scouting_date', 'Scouting date', 'date', false, ['scouting date']),
      f('justification', 'Justification (pest, disease or preventive)', 'text', false, ['justification', 'target pest', 'pest']),
      f('percent_seen', '% seen / expected problem', 'text', false, ['%seen', 'percent seen']),
      f('start_time', 'Start time', 'time', false, ['application start time', 'start time']),
      f('end_time', 'End time', 'time', false, ['application end time', 'end time']),
      f('active_ingredient', 'Active ingredient', 'text', false, ['active ingredient']),
      n('dosage', 'Dose per litre of water', 'number', 0, 9999999, ['dose of ppp/l of water', 'dose']),
      n('rate_per_ha', 'Rate of application per ha', 'number', 0, 999999999, ['rate of application/ha', 'rate']),
      n('unit_price', 'Unit price', 'number', 0, 9999999999, ['price']),
      n('cost', 'Cost', 'number', 0, 9999999999, []),
      f('uom', 'Unit', 'text', false, ['uom', 'unit']),
      n('total_quantity_applied', 'Total quantity applied (L)', 'number', 0, 9999999999, ['total quatity applied ltr', 'total quantity applied', 'water volume']),
      f('machinery', 'Machinery used', 'text', false, ['machinery']),
      f('phi_days', 'PHI (days)', 'int', false, ['pre-harvest interval phi days', 'phi days', 'phi']),
      f('clear_date', 'Clear to harvest date', 'date', false, ['clear to harvest date', 'clear date']),
      f('weather', 'Weather during application', 'text', false, ['weather during application', 'weather']),
      f('operator_name', 'Sprayer operator', 'text', false, ['equipment eg: sprayer operator', 'operator', 'sprayer operator']),
      f('verified_by', 'Authorized and verified by', 'text', false, ['application-*authorized and **verified by', 'authorized', 'verified by']),
    ],
  },
};

export function listTargets(): TargetSpec[] {
  return [TARGETS.harvests, TARGETS.ecph_full, TARGETS.fertigation, TARGETS.pesticide_applications, TARGETS.pesticide_products, TARGETS.ecph];
}
