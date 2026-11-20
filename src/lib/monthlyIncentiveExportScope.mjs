// Only evaluations from the selected performance month belong in the
// ordinary Monthly Incentive Authorization; deferred payments are separate.
export function currentMonthIncentiveDocuments(month,docs) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month||""))) return [];
  return (Array.isArray(docs)?docs:[]).filter(doc=>doc &&
    doc.monthKey===month && !doc.carryOverFrom);
}
export function requireCurrentMonthIncentiveDocuments(month,docs) {
  const incoming=Array.isArray(docs)?docs:[];
  const monthly=currentMonthIncentiveDocuments(month,incoming);
  if(monthly.length!==incoming.length){
    const examples=incoming.filter(doc=>!doc||doc.monthKey!==month||doc.carryOverFrom)
      .map(doc=>String(doc?.id||doc?.monthKey||"?")).slice(0,5).join(", ");
    throw new Error(`Monthly Incentive ${month}: พบเอกสารต่างเดือนในรายงาน (${examples})`);
  }
  return monthly;
}
