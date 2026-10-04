/** Representative 12-week established-crop window, not cultivar/season dates.
 * Renderer values are art mappings; future model outputs may replace this
 * preview interpolation. No stress, PGI, root access or biology is calculated. */
export const cropStageAnchors = {
  week0: { week: 0, stage: 'Z30–31', description: 'Early stem elongation / end of tillering', rendererDevelopment: .48 },
  week4: { week: 4, stage: 'Z37–39', description: 'Late stem elongation / flag-leaf period', rendererDevelopment: .62 },
  week8: { week: 8, stage: 'Z65–73', description: 'Flowering / very early grain development', rendererDevelopment: .84 },
  week12: { week: 12, stage: 'Z83–87', description: 'Dough development / approaching physiological maturity', rendererDevelopment: .96 },
} as const;

export type CropStageMapping = Record<keyof typeof cropStageAnchors, { week: number; stage: string; description: string; rendererDevelopment: number }>;

export function developmentForEpisodeWeek(week: number, anchors: CropStageMapping = cropStageAnchors): number {
  if (!Number.isFinite(week) || week < 0 || week > 12) throw new RangeError('Episode preview week must be from 0 to 12.');
  const points = [anchors.week0, anchors.week4, anchors.week8, anchors.week12];
  points.forEach((point, index) => {
    if (point.week !== index * 4 || !Number.isFinite(point.rendererDevelopment) || point.rendererDevelopment < 0 || point.rendererDevelopment > 1 ||
      (index > 0 && point.rendererDevelopment < points[index - 1].rendererDevelopment))
      throw new RangeError('Stage anchors need weeks 0/4/8/12 and increasing normalised renderer development.');
  });
  if (week === 12) return points[3].rendererDevelopment;
  const index = Math.floor(week / 4), start = points[index], end = points[index + 1];
  return start.rendererDevelopment + (end.rendererDevelopment - start.rendererDevelopment) * (week - start.week) / (end.week - start.week);
}

// Internal review fixtures only. These are not a user growth-stage selector or
// production timeline controls. Stress is supplied independently, never inferred.
export const CROP_STAGE_REVIEW_PRESETS = [
  { id: 'A', week: 0, cropStress: 0 }, { id: 'B', week: 4, cropStress: 0 },
  { id: 'C', week: 8, cropStress: 0 }, { id: 'D', week: 12, cropStress: 0 },
  { id: 'E', week: 8, cropStress: 0 }, { id: 'F', week: 8, cropStress: .85 },
  { id: 'G', week: 12, cropStress: 0 }, { id: 'H', week: 12, cropStress: .85 },
] as const;
