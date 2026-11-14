// Durable per-day source-read reservations for the QA-only Windows importer.
// This is a conservative QUERY BUDGET, not an exact Firestore billing meter.
// Reservations are never refunded on timeout/HTTP failure: a failed scan must
// not get unlimited retries against the original Firestore quota.
const fail=code=>Object.assign(new Error(code),{code});
const PROJECT=/^[a-z][a-z0-9-]{4,62}$/;
export function createQaSourceReadBudget({
  client,projectId,dailyDocumentLimit=6000,dailyRequestLimit=120,
  now=()=>new Date(),
}={}){
  if(typeof client?.query!=='function'||!PROJECT.test(projectId||'')||
    !Number.isSafeInteger(dailyDocumentLimit)||dailyDocumentLimit<11||
    dailyDocumentLimit>20000||
    !Number.isSafeInteger(dailyRequestLimit)||dailyRequestLimit<11||
    dailyRequestLimit>500||typeof now!=='function')
    throw fail('source_daily_budget_invalid');
  return Object.freeze({
    async reserve({requestedPageSize}={}){
      if(!Number.isSafeInteger(requestedPageSize)||requestedPageSize<1||
        requestedPageSize>500)
        throw fail('source_read_reservation_invalid');
      const d=now();
      if(!(d instanceof Date)||!Number.isFinite(d.valueOf()))
        throw fail('source_budget_clock_invalid');
      const utcDay=d.toISOString().slice(0,10);
      if(requestedPageSize>dailyDocumentLimit)
        throw fail('source_daily_budget_exhausted');
      // One atomic PostgreSQL UPSERT. A single day/project counter is shared
      // across all Windows processes, attempts and simultaneous console runs.
      // Each call reserves its FULL page size, even for empty result pages.
      // Statement errors MUST fail closed; no bypass or in-memory fallback.
      let result;
      try{
        result=await client.query(
          'INSERT INTO qa_failover_v1.source_read_budget_daily'+
          ' (budget_day,project_id,reserved_document_units,reserved_requests)'+
          ' VALUES ($1::date,$2,$3,1)'+
          ' ON CONFLICT (budget_day,project_id) DO UPDATE SET'+
          ' reserved_document_units=qa_failover_v1.source_read_budget_daily.reserved_document_units'+
          ' +EXCLUDED.reserved_document_units,'+
          ' reserved_requests=qa_failover_v1.source_read_budget_daily.reserved_requests+1,'+
          ' updated_at=now()'+
          ' WHERE qa_failover_v1.source_read_budget_daily.reserved_document_units'+
          ' +EXCLUDED.reserved_document_units<=$4'+
          ' AND qa_failover_v1.source_read_budget_daily.reserved_requests+1<=$5'+
          ' RETURNING reserved_document_units,reserved_requests',
          [utcDay,projectId,requestedPageSize,dailyDocumentLimit,dailyRequestLimit]);
      }catch{throw fail('source_daily_budget_storage_unavailable');}
      if(result?.rowCount!==1||result.rows?.length!==1)
        throw fail('source_daily_budget_exhausted');
      const row=result.rows[0];
      if(!Number.isSafeInteger(Number(row.reserved_document_units))||
        Number(row.reserved_document_units)>dailyDocumentLimit||
        !Number.isSafeInteger(Number(row.reserved_requests))||
        Number(row.reserved_requests)>dailyRequestLimit)
        throw fail('source_daily_budget_receipt_invalid');
      return Object.freeze({
        budgetDayUtc:utcDay,
        reservedDocumentUnits:Number(row.reserved_document_units),
        reservedRequests:Number(row.reserved_requests),
        estimatedNotBilledReads:true,
      });
    },
  });
}
