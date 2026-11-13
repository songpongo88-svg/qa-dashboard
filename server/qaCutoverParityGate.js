// Cutover precondition gate for QA Dashboard. No network access or writes.
// The caller must obtain authoritative COMPLETE source snapshots in a secure,
// trusted backend process. Browser/local cache is never an authoritative source.
// Each record digest must come from a canonicalized document export. Do not
// supply unverified case IDs or user-entered "complete" flags to this module.
const EXPECTED_DATASETS = Object.freeze([
  'qa_evaluations',
  'qa_appeal_events',
  'qa_signature_documents',
  'historical_qa_excel_rows',
]);

export function evaluateQaCutoverParity(manifests, now = Date.now()) {
  const blockers = [];
  const details = [];
  if (!Array.isArray(manifests)) {
    return { ready: false, blockers: ['missing_authoritative_manifests'], details };
  }
  const manifestMap = new Map();
  for (const manifest of manifests) {
    if (!manifest || !EXPECTED_DATASETS.includes(manifest.dataset) || manifestMap.has(manifest.dataset)) {
      blockers.push('invalid_or_duplicate_dataset_manifest');
      continue;
    }
    manifestMap.set(manifest.dataset, manifest);
  }
  for (const name of EXPECTED_DATASETS) {
    const pair = manifestMap.get(name);
    if (!pair || !pair.source || !pair.destination) {
      blockers.push(name + ':missing_source_or_destination');
      continue;
    }
    const { source, destination } = pair;
    // The source MUST be a server-verified fresh, complete Firebase export
    // (for Excel: full original workbook archive inventory). A local backup
    // count, 563-row candidate parity, or queued sync cannot satisfy this.
    const authoritative = name === 'historical_qa_excel_rows'
      ? 'verified-original-excel-archive' : 'firebase-current';
    const trusted = source.authority === authoritative
      && source.complete === true && source.verified === true
      && source.syncState === 'validated'
      && Number.isInteger(source.observedCount)
      && Number.isFinite(Date.parse(source.checkedAt))
      && now - Date.parse(source.checkedAt) >= 0
      && now - Date.parse(source.checkedAt) <= 5 * 60_000;
    if (!trusted) {
      blockers.push(name + ':source_not_live_verified');
      continue;
    }
    if (destination.authority !== 'postgresql-cutover-candidate'
      || destination.verified !== true || destination.complete !== true
      || !Number.isInteger(destination.observedCount)) {
      blockers.push(name + ':destination_not_verified');
      continue;
    }
    const parse = (snapshot, side) => {
      if (!Array.isArray(snapshot.entries) || snapshot.entries.length !== snapshot.observedCount) {
        blockers.push(name + ':' + side + '_count_mismatch');
        return null;
      }
      const map = new Map();
      for (const row of snapshot.entries) {
        if (!row || typeof row.key !== 'string' || !row.key || !/^[a-f0-9]{64}$/.test(row.sha256 || '') || map.has(row.key)) {
          blockers.push(name + ':' + side + '_invalid_or_duplicate_identity');
          return null;
        }
        map.set(row.key, row.sha256);
      }
      return map;
    };
    const before = parse(source, 'source');
    const after = parse(destination, 'destination');
    if (!before || !after) continue;
    let missing = 0, changed = 0, extra = 0;
    for (const [key, hash] of before) {
      if (!after.has(key)) missing++;
      else if (after.get(key) !== hash) changed++;
    }
    for (const key of after.keys()) if (!before.has(key)) extra++;
    if (missing || changed || extra) blockers.push(name + ':data_mismatch');
    details.push({ dataset: name, sourceCount: before.size, destinationCount: after.size, missing, changed, extra });
  }
  // All QA datasets must have been verified. The gate cannot silently skip
  // appeals, signatures or old workbook rows just because evaluations match.
  return {
    ready: blockers.length === 0 && details.length === EXPECTED_DATASETS.length,
    blockers: [...new Set(blockers)],
    details,
  };
}
