import type { MoistureTrajectorySample } from './three/soilMoisturePresentation';
import type { MoistureTransportInput } from './three/soilMoistureTransport';

/** Dimensionless art direction, NOT an ET rate or water balance. The demand
 * values mirror Farm Forward v1 for relative presentation only. No amount is
 * subtracted from the supplied moisture trajectory and crop uptake is separate.
 * Demand constants intentionally remain mirrored here: the renderer does not
 * import backend-only model code. Consolidation can accompany a shared contract.
 */
export const EVAPORATION_DISPLAY = {
  demand: { moderate: 1.10, severe: 1.20, extreme: 1.30 },
  declineReference: .004, // normalised display-moisture change per model day
  resumeDays: 1.5,
  sampleDays: .25,
} as const;

export type EvaporationOptions = {
  droughtIntensity: keyof typeof EVAPORATION_DISPLAY.demand;
  adaptations?: { stubbleRetention?: boolean };
};
const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };

/** Explain declining stretches of the EXISTING topsoil samples. Caller only
 * invokes this for dry periods, after wetting and redistribution have finished.
 * Knots at each change of slope prevent activity leaking into flat/rising soil.
 */
export function evaporationFluxSamples(
  points: readonly MoistureTrajectorySample[], days: number, options: EvaporationOptions
): NonNullable<MoistureTransportInput['fluxSamples']> {
  const config = EVAPORATION_DISPLAY;
  const segments = points.slice(1).map((right, i) => ({
    from: points[i].progress, to: right.progress,
    decline: Math.max(0, (points[i].soilMoisture.topsoil - right.soilMoisture.topsoil) /
      ((right.progress - points[i].progress) * days)),
  }));
  const knots = new Set(points.map(point => point.progress));
  for (let day = config.sampleDays; day < days; day += config.sampleDays) knots.add(day / days);
  return [...knots].sort((a, b) => a - b).map(progress => {
    const touching = segments.filter(segment => progress >= segment.from && progress <= segment.to);
    const decline = Math.min(...touching.map(segment => segment.decline));
    // Same presentation mapping for every strategy. Stubble's smaller loss
    // already enters through the supplied SWI/topsoil slope; never add a second
    // strategy multiplier or delay that overstates the model's 15% protection.
    const envelope = smooth(progress * days / config.resumeDays) *
      smooth((1 - progress) * days / .5);
    const evaporationLoss = decline > 0 ? decline / (decline + config.declineReference) *
      config.demand[options.droughtIntensity] * envelope : 0;
    return { progress, fluxes: { evaporationLoss } };
  });
}
