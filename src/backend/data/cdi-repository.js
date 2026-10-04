// Repository data is injected at build time. No live CDI API is called.
export function createCdiRepository(dataset) {
  const snapshots = [...dataset.snapshots].sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
  return Object.freeze({
    latestOnOrBefore(date) { return snapshots.find(snapshot => snapshot.snapshotDate <= date) || null; }
  });
}
