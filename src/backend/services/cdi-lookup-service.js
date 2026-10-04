import { deepFreeze, sydneyDate } from '../../shared/baseline-contract.js';
import { findContainingArea } from './spatial-lookup.js';
const unavailable = reason => ({ status: 'unavailable', reason, official: false, baselineCDI: null });
export function lookupBaseline(repository, input, today = sydneyDate()) {
  const location = input?.location;
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || location.latitude < -37.7 || location.latitude > -28.1 || location.longitude < 140.9 || location.longitude > 153.7) return unavailable('invalid-nsw-location');
  const simulationStartDate = input.simulationStartDate || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(simulationStartDate) || !Number.isFinite(Date.parse(simulationStartDate)) || new Date(simulationStartDate).toISOString().slice(0, 10) !== simulationStartDate || simulationStartDate > today) return unavailable('invalid-start-date');
  const snapshot = repository.latestOnOrBefore(simulationStartDate);
  if (!snapshot) return unavailable('no-snapshot-on-or-before-start');
  const matched = findContainingArea(snapshot.areas, location.longitude, location.latitude, snapshot.source.boundaryToleranceDegrees);
  if (!matched.area) return unavailable(matched.reason);
  const record = matched.area;
  const missingFields = [];
  const percentile = key => {
    const value = record[key];
    if (!Number.isFinite(value) || value < 0 || value > 100) { missingFields.push(key); return null; }
    return value;
  };
  const baselineCDI = {
    location: {
      displayName: String(location.displayName || '').slice(0, 240),
      suburbOrTown: String(location.suburbOrTown || location.suburb || '').slice(0, 120),
      postcode: location.postcode ? String(location.postcode).slice(0, 10) : null,
      latitude: location.latitude, longitude: location.longitude
    },
    spatialArea: { id: record.id, parish: record.parish, county: record.county, lga: record.lga || null, llsRegion: record.llsRegion || null, level: 'parish' },
    simulationStartDate, snapshotDate: snapshot.snapshotDate, official: true,
    cdiPhase: record.cdiPhase || null,
    rainfallIndex: percentile('rainfallIndex'), soilWaterIndex: percentile('soilWaterIndex'), plantGrowthIndex: percentile('plantGrowthIndex'),
    droughtDirectionIndex: Number.isFinite(record.droughtDirectionIndex) ? record.droughtDirectionIndex : null,
    source: { ...snapshot.source }, missingFields
  };
  if (!baselineCDI.cdiPhase) missingFields.push('cdiPhase');
  if (baselineCDI.droughtDirectionIndex === null) missingFields.push('droughtDirectionIndex');
  return deepFreeze({ status: 'ready', official: true, baselineCDI });
}
