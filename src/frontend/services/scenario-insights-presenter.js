import { deterministicScenarioInsights, supportedInsightWordings, validatedScenarioInsights } from '../components/results/scenario-insight-text.js';

export const SCENARIO_INSIGHTS_INSTRUCTION = 'Write a concise educational interpretation using only the supplied structured facts. Do not calculate values, invent mechanisms, introduce external facts or give general farming advice. Return exactly insight1, insight2, insight3 and recommendation. Choose only from the supplied supported wordings for each field; the conclusion must qualify the simulated scenario.';

// Explicit allowlist: no location, CDI data, run descriptor, HTML or timeline.
export function scenarioInsightsPayload(context) {
  return {
    version: context.version, currentStrategy: context.currentScenario.name,
    droughtSeverity: context.droughtSeverity, current: { ...context.current },
    comparisons: context.selectedComparisons.map(({ id, name, yieldTPerHa, cropSavedT, implementationCostAud, netBenefitAud }) => ({ id, name, yieldTPerHa, cropSavedT, implementationCostAud, netBenefitAud })),
    widerRows: structuredClone(context.widerRows),
    bestYieldStrategy: context.rankings.highestYieldScenario?.name || null,
    bestNetBenefitStrategy: context.rankings.economicsComparable ? context.rankings.highestNetBenefitScenario?.name || null : null,
    supportedWordings: supportedInsightWordings(context)
  };
}

/** Optional adapter seam; no external endpoint or API credentials are configured.
 * The UI renders deterministic text synchronously. A future provider can request
 * a validated replacement without delaying that initial render. */
export async function resolveScenarioInsights(context, { rewrite, timeoutMs = 1500 } = {}) {
  const fallback = deterministicScenarioInsights(context);
  if (typeof rewrite !== 'function') return fallback;
  const controller = new AbortController();
  let timeout;
  try {
    const candidate = await Promise.race([
      Promise.resolve().then(() => rewrite(scenarioInsightsPayload(context), { signal: controller.signal, instruction: SCENARIO_INSIGHTS_INSTRUCTION })),
      new Promise(resolve => { timeout = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs); })
    ]);
    return validatedScenarioInsights(context, candidate);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
