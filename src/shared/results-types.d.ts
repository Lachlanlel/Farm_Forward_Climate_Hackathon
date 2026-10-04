export type Adaptations = { stubbleRetention: boolean; widerRows: boolean };
export type Indices = { rainfallIndex: number; soilWaterIndex: number; plantGrowthIndex: number };
export type Location = { latitude: number; longitude: number; displayName?: string; suburbOrTown?: string; suburb?: string; postcode?: string | null };
export type Scenario = { droughtIntensity: 'moderate' | 'severe' | 'extreme'; soilType: 'clay' | 'sandy'; waterSupply: 'rainfed' | 'irrigated'; adaptations: Adaptations };
export type OfficialBaseline = Indices & {
  official: boolean; simulationStartDate: string; snapshotDate: string; cdiPhase: string | null;
  location: Location; spatialArea: { id: string; parish: string; [key: string]: unknown };
  source: Record<string, unknown>; missingFields: string[];
};
export type Projection = { modelVersion: string; durationDays: number; baseline: Indices; projectedEnd: Indices; scenario: Scenario };
export type RunDescriptor = {
  contractVersion: string; simulationModelVersion: string; resultsModelVersion: string;
  assumptionsVersion: string; configurationIdentity: string; simulationStartDate: string;
  farmAreaHa: number; location: Location; scenario: Scenario;
  baselineIdentity: { snapshotDate: string; spatialAreaId: string; sourceChecksums: Record<string, string> };
  officialStartingIndices: Indices; projectedEnd: Indices;
};
export type CompletedRun = RunDescriptor & { completedDay: number };
export type StrategyCosts = { stubbleCostPerHa: number | null; widerRowsCostPerHa: number | null };
export type ScenarioCostStatus = 'research-informed-scenario-assumption';
export type CostBasis = { strategyId: 'stubble-retention' | 'wider-rows'; valueAudPerHa: number; status: ScenarioCostStatus;
  basis: string; sourceUrl: string; detail: string; calculation?: { equipmentCapitalAud: number; annualDepreciationAndInterestAud: number; annualUtilisationHa: number }; evidenceStatus?: string };
export type ResultsAssumptions = { version: string; normalYieldTPerHa: number; wheatPriceAudPerTonne: number;
  baseDroughtLoss: { moderate: number; severe: number; extreme: number }; yieldMethod: string; calibrationStatus: string;
  strategyCosts: StrategyCosts; costEvidence: { stubble: string | null; wider: string | null };
  costStatus: ScenarioCostStatus; costBasis: { stubble: CostBasis; wider: CostBasis } };
export type ResultsInput = {
  farmAreaHa: number; normalYieldTPerHa: number; droughtReferenceYieldTPerHa: number;
  adaptedReferenceYieldTPerHa: number; wheatPriceAudPerTonne: number;
  adaptations: Adaptations; strategyCosts: StrategyCosts;
  costStatus?: ScenarioCostStatus; costBasis?: { stubble: CostBasis; wider: CostBasis };
};
export type Metrics = {
  normalYieldTPerHa: number; droughtBaselineYieldTPerHa: number; referenceYieldTPerHa: number;
  finalYieldTPerHa: number; wideRowMultiplier: number; farmAreaHa: number;
  normalProductionT: number; droughtBaselineProductionT: number; finalProductionT: number;
  cropSavedT: number; yieldLossPercent: number; revenueAfterDroughtAud: number;
  grossValueProtectedAud: number; strategyCostAud: number | null; netBenefitAud: number | null;
  costStatus: 'available' | 'unavailable' | 'not-applicable' | ScenarioCostStatus; costBasis: CostBasis[]; missingCostStrategies: string[];
  aboveNormalReference: boolean;
};
export type Comparison = { id: 'stubble' | 'wider' | 'combined'; name: string; description: string; adaptations: Adaptations; metrics: Metrics };
export type ResultsResponse = {
  status: 'ready'; contractVersion: string; run: CompletedRun; baselineCDI: OfficialBaseline;
  projection: Projection; finalMetrics: Metrics; comparisons: Comparison[];
  assumptions: ResultsAssumptions;
  yieldDiagnostics: { rawSeveritySWILoss: number; actualSWILoss: number; conditionFactor: number; bounded: boolean; referenceYieldTPerHa: number };
  sources: { id: string; category: string; title: string; url: string | null; detail: string }[];
  warnings: string[];
};
