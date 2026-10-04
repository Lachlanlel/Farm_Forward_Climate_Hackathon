/** TEMPORARY visual review. Arbitrary relative fixture flux, not calibrated
 * physical soil rates. Neither soil type nor drought appears in this mapping. */
export const MOISTURE_RATE_REVIEWS = {
  slow: { relativeFlux: .30, screenSeconds: 8 },
  medium: { relativeFlux: 1, screenSeconds: 6 },
  fast: { relativeFlux: 3, screenSeconds: 4 },
} as const;
export type MoistureRateReview = keyof typeof MOISTURE_RATE_REVIEWS;
