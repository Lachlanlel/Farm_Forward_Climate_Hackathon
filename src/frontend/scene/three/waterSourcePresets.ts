import type { MoistureTransportInput } from './soilMoistureTransport';
import type { WaterSourceReviewPlan } from './waterSourcePresentation';

/** EXTERNALLY AUTHORED REVIEW DATA, not a water-balance model. Moisture and
 * fluxes are supplied independently of source particles, on one progression. */
export const WATER_SOURCE_REVIEWS: Record<'rain'|'irrigation', {source:WaterSourceReviewPlan;transport:MoistureTransportInput}> = {
  rain:{source:{waterSystem:'rainfed',durationSeconds:6,samples:[
    {progress:0,rainfallRate:0,irrigationRate:0}, {progress:.18,rainfallRate:.5,irrigationRate:0},
    {progress:.52,rainfallRate:1,irrigationRate:0}, {progress:.82,rainfallRate:.5,irrigationRate:0},
    {progress:1,rainfallRate:0,irrigationRate:0}]},
    transport:{previousMoisture:{topsoil:.35,rootZone:.5,deepSoil:.65},nextMoisture:{topsoil:.35,rootZone:.5,deepSoil:.65},durationSeconds:6}},
  irrigation:{source:{waterSystem:'irrigated',durationSeconds:6,samples:[
    {progress:0,rainfallRate:0,irrigationRate:0}, {progress:.15,rainfallRate:0,irrigationRate:.55},
    {progress:.65,rainfallRate:0,irrigationRate:.8}, {progress:.86,rainfallRate:0,irrigationRate:.55},
    {progress:1,rainfallRate:0,irrigationRate:0}]},
    transport:{previousMoisture:{topsoil:.15,rootZone:.25,deepSoil:.4},nextMoisture:{topsoil:.7,rootZone:.5,deepSoil:.45},durationSeconds:6,
      simulationTiming:{startTime:0,stepDuration:24,timeUnit:'hour'},fluxReference:1,
      moistureSamples:[{progress:0,soilMoisture:{topsoil:.15,rootZone:.25,deepSoil:.4}},
        {progress:.28,soilMoisture:{topsoil:.37,rootZone:.27,deepSoil:.4}},
        {progress:.62,soilMoisture:{topsoil:.6,rootZone:.42,deepSoil:.42}},
        {progress:1,soilMoisture:{topsoil:.7,rootZone:.5,deepSoil:.45}}],
      fluxSamples:[{progress:0,fluxes:{irrigationInput:0,topToRoot:0,rootToDeep:0}},
        {progress:.15,fluxes:{irrigationInput:.55,topToRoot:.15,rootToDeep:0}},
        {progress:.65,fluxes:{irrigationInput:.8,topToRoot:.65,rootToDeep:.25}},
        {progress:.86,fluxes:{irrigationInput:.55,topToRoot:.4,rootToDeep:.18}},
        {progress:1,fluxes:{irrigationInput:0,topToRoot:0,rootToDeep:0}}]}}
};
