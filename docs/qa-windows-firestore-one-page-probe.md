# Single-page Firestore document-list access probe

After operator verified Google ADC and Firestore database metadata:
- The next independent test is a **single** Firestore REST documents.list
  request against qa_evaluations with pageSize=1 and a field mask designed
  to avoid returning useful case fields. No case IDs, data or bearer tokens
  are written to the console.
- **Minimum 1 Firestore document read** may be charged even for an empty
  result; actual provider quota/billing is shared with all QA clients, and
  this script cannot measure concurrent usage.
- Before any Firestore request, checks the inactive frozen Windows state
  and atomically reserves one document read and request in existing
  qa_failover_v1.source_read_budget_daily. Caps the script's own existing
  daily project reservations to <=3000 document units and <=80 requests.
- Atomically creates a one-attempt-per-UTC-day file marker, even when the
  reservation or HTTP request fails. This avoids repeated user runs but
  does not constrain any other clients of Firestore.
- A successful list API request does NOT prove full 11-dataset permissions,
  live parity, quota headroom or a successful continuous listener.
- No automatic startup, migration, browser endpoint, data re-export,
  or QA_FAILOVER change occurs. The operator must explicitly run it on
  their local Windows host.
