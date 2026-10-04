import type { SoilMoisture } from './three/soilMoisturePresentation';

/** Art-direction response to an index, NOT volumetric water content. A value
 * of .25 is a relative shader-wetness input, never “25% soil moisture”. These
 * fixed depth offsets/lags retain the existing topsoil/crack/evaporation scale
 * while giving deeper layers a slower, buffered response to the same scores.
 * No soil, irrigation or adaptation benefit is applied again here.
 */
export const LAYER_MOISTURE_DISPLAY = {
  topsoil: { offset: 0, lagDays: 0, response: 1 },
  rootZone: { offset: .035, lagDays: 4, response: .88 },
  deepSoil: { offset: .065, lagDays: 10, response: .70 },
} as const;

export function layerMoistureAt(samples: readonly { soilWaterIndex: number }[], simulationDay: number): SoilMoisture {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const initial = samples[0].soilWaterIndex / 100;
  return Object.fromEntries(Object.entries(LAYER_MOISTURE_DISPLAY).map(([layer, display]) => {
    const day = Math.min(samples.length - 1, Math.max(0, simulationDay - display.lagDays));
    const lower = Math.floor(day), upper = Math.min(samples.length - 1, lower + 1);
    const index = (samples[lower].soilWaterIndex + (samples[upper].soilWaterIndex - samples[lower].soilWaterIndex) * (day - lower)) / 100;
    return [layer, clamp(layer === 'topsoil' ? index : initial + display.offset + (index - initial) * display.response)];
  })) as SoilMoisture;
}
