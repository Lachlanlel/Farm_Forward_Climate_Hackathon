// @ts-check
import { deepFreeze } from '../../shared/baseline-contract.js';
export const DEFAULT_WHEAT_PRICE_AUD_PER_TONNE = 350;
export const STUBBLE_RETENTION_COST_AUD_PER_HA = 6.00;
export const WIDER_ROWS_COST_AUD_PER_HA = 2.40;
export const COST_STATUS = 'research-informed-scenario-assumption';
const NSW_STATISTICS_URL = 'https://www.dpird.nsw.gov.au/about-us/publications/pdi/2025/statistics-tables';
const STUBBLE_COST_URL = 'https://www.agric.wa.gov.au/sites/gateway/files/S1%2BRebecca%2BSmith%2B2017.pdf';
const EQUIPMENT_CONTEXT_URL = 'https://airep.com.au/wp-content/uploads/2020/07/14.-EPF00001-Economic-analysis-of-sowing-position-on-non-wetting-sand.pdf';
export const RESULTS_MODEL_VERSION = '1.0-educational-severity-swi-loss';
/** @type {import('../../shared/results-types.js').ResultsAssumptions} */
export const RESULTS_ASSUMPTIONS = deepFreeze({
  version: '2026-10-04-v2',
  normalYieldTPerHa: 3.0,
  wheatPriceAudPerTonne: DEFAULT_WHEAT_PRICE_AUD_PER_TONNE,
  baseDroughtLoss: { moderate: .15, severe: .30, extreme: .55 },
  yieldMethod: 'clamp(normalYieldTPerHa * (1 - baseDroughtLoss[severity] * actualSWILoss / rawSeveritySWILoss), 0, normalYieldTPerHa); then wide-row adjustment',
  calibrationStatus: 'educational-unvalidated',
  // Representative scenario allowances affect economics only, not agronomy.
  strategyCosts: { stubbleCostPerHa: STUBBLE_RETENTION_COST_AUD_PER_HA, widerRowsCostPerHa: WIDER_ROWS_COST_AUD_PER_HA },
  costStatus: COST_STATUS,
  costBasis: {
    stubble: { strategyId: 'stubble-retention', valueAudPerHa: STUBBLE_RETENTION_COST_AUD_PER_HA, status: COST_STATUS,
      basis: 'representative residue-management allowance', sourceUrl: STUBBLE_COST_URL,
      detail: 'The referenced analysis assumes retaining stubble itself costs $0/ha and estimates reducing/managing loads at $6/ha. Farm Forward adopts $6/ha for additional residue-management effort, not the intrinsic cost of leaving stubble. Actual costs vary with stubble load, machinery and farm practice.' },
    wider: { strategyId: 'wider-rows', valueAudPerHa: WIDER_ROWS_COST_AUD_PER_HA, status: COST_STATUS,
      basis: 'representative annualised equipment/setup allowance', sourceUrl: EQUIPMENT_CONTEXT_URL,
      detail: 'EPARF/GRDC Guideline 14 (Ed Hunt, February 2018), page 4: approximately $30,000 additional guidance equipment, $4,800/year depreciation and interest divided across 2,000 ha = $2.40/ha. Farm Forward uses this as a proxy, not a universal quotation for conversion to 30 cm rows. Actual cost varies with machinery, guidance already owned, contractors and annual hectares.',
      calculation: { equipmentCapitalAud: 30000, annualDepreciationAndInterestAud: 4800, annualUtilisationHa: 2000 },
      evidenceStatus: 'historical equipment example verified; application to wider rows is a scenario assumption' }
  },
  costEvidence: { stubble: STUBBLE_COST_URL, wider: EQUIPMENT_CONTEXT_URL }
});
export const RESULTS_SOURCES = deepFreeze([
  { id: 'official-cdi', category: 'official-data', title: 'NSW DPIRD CDI / EDIS II baseline', url: 'https://edis.spaceport.intersect.org.au/', detail: 'Official regional starting indices and snapshot provenance. No predicted grain yield is supplied by NSW DPIRD.' },
  { id: 'farm-forward-v1', category: 'model-assumption', title: 'Farm Forward v1 drought scenario', url: null, detail: 'Educational drought targets, soil multipliers, irrigation/stubble SWI protection and .65 SWI/.35 RI plant-stress weighting; preserved from the current repository.' },
  { id: 'wide-rows', category: 'research-relationship', title: 'GRDC GrowNotes Wheat North (February 2016), Planting Table 7, printed page 18', url: 'https://grdc.com.au/__data/assets/pdf_file/0025/370672/GrowNote-Wheat-North-03-Planting.pdf', detail: 'Central/southern NSW 18→30 cm wheat comparison, citing NSW DPI (2012). Multipliers are the existing repository rounded points. Historical dollar effects in the source are not implementation costs. Verified 4 October 2026.' },
  { id: 'reference-yield', category: 'results-assumption', title: 'Recent NSW-average educational reference: 3.0 t/ha', url: NSW_STATISTICS_URL, detail: 'NSW DPIRD 2025 statistics report a five-year average wheat yield of 3.0 t/ha. Used as the educational normal-season baseline; not the selected farm’s measured yield, a guaranteed future yield or a location-specific forecast.' },
  { id: 'yield-conversion', category: 'results-assumption', title: 'Severity-calibrated SWI-loss yield proxy', url: null, detail: 'Source: user calibration instruction. Moderate/severe/extreme maximum reference loss = .15/.30/.55, scaled by actual SWI decline divided by the model severity loss before soil/protection. This is an unvalidated educational mapping from indices to grain yield, not a physical water balance. No PGI ratio. Reference yield is bounded 0–normal; zero raw SWI loss is unavailable.' },
  { id: 'price', category: 'economic-assumption', title: 'Rounded wheat scenario price: AUD 350/t', url: NSW_STATISTICS_URL, detail: 'A rounded scenario wheat price consistent with recent NSW values: NSW DPIRD 2025 reports $334.20/t for 2024–25 and a five-year average of $358.50/t. Historical context, not a live quote, guaranteed sale price or farm-specific contract price.' },
  { id: 'stubble-cost', category: 'economic-assumption', title: 'Stubble retention: AUD 6.00/ha', url: STUBBLE_COST_URL, detail: 'Research-informed scenario assumption; representative residue-management allowance. The referenced GRDC project economic analysis separates $0/ha for retaining stubble itself from about $6/ha for reducing/managing loads. Actual costs vary; no extra labour/fuel surcharge.' },
  { id: 'wider-cost', category: 'economic-assumption', title: 'Wider rows: AUD 2.40/ha', url: EQUIPMENT_CONTEXT_URL, detail: 'Research-informed scenario assumption; representative annualised equipment/setup allowance. EPARF/GRDC Guideline 14 (February 2018), page 4: $4,800/year over 2,000 ha = $2.40/ha, associated with approximately $30,000 additional guidance equipment. Applied as a wider-row setup proxy, not a universal conversion quote. Actual costs vary substantially; no extra fuel/labour surcharge or operating savings are modelled.' },
  { id: 'wide-row-crossover', category: 'model-assumption', title: 'The model’s interpolated crossover (~1.55 t/ha)', url: null, detail: 'Multiplier 1 occurs at 1.5454545 t/ha by interpolation between the 1 and 2 t/ha source points. This is a mathematical property of Farm Forward, not an empirically established universal agronomic threshold.' }
]);
