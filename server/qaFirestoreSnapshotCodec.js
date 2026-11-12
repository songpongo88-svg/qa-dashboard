// QA-only trusted snapshot transformation. NEVER silently recalculate scores.
// Used only after Firestore's eleven-dataset authoritative export is verified.
// The original typed Firestore document stays available in live_snapshot_rows.
const fail=code=>Object.assign(new Error(code),{code});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'?v:'';
const array=v=>Array.isArray(v)?v:[];
// Firestore allows Unicode IDs; the verified snapshot importer already accepts
// up to 900 characters. Preserve originals without renaming any evaluation.
const safeId=id=>typeof id==='string'&&id.length>0&&id.length<=900&&
  !id.includes('/')&&!/[\x00-\x1f\x7f]/.test(id);
const month=/^\d{4}-(0[1-9]|1[0-2])$/;
const sha=/^[0-9a-f]{64}$/;

export function decodeQaFirestoreValue(value,depth=0){
  if(depth>48||!plain(value))throw fail('firestore_value_invalid');
  const kinds=['nullValue','stringValue','booleanValue','integerValue',
    'doubleValue','timestampValue','bytesValue','referenceValue',
    'geoPointValue','arrayValue','mapValue'].filter(k=>Object.hasOwn(value,k));
  if(kinds.length!==1)throw fail('firestore_value_ambiguous');
  const kind=kinds[0],raw=value[kind];
  if(kind==='nullValue')return null;
  if(kind==='stringValue'||kind==='timestampValue'||kind==='referenceValue'){
    if(typeof raw!=='string')throw fail('firestore_value_invalid');
    return raw;
  }
  if(kind==='booleanValue'){
    if(typeof raw!=='boolean')throw fail('firestore_value_invalid');
    return raw;
  }
  if(kind==='integerValue'){
    if(!/^-?\d+$/.test(String(raw)))throw fail('firestore_value_invalid');
    const num=Number(raw);
    // JSON cannot preserve large integers without losing precision.
    if(!Number.isSafeInteger(num))throw fail('firestore_integer_not_safe');
    return num;
  }
  if(kind==='doubleValue'){
    const num=Number(raw);
    if(!Number.isFinite(num))throw fail('firestore_value_invalid');
    return num;
  }
  if(kind==='bytesValue'){
    if(typeof raw!=='string')throw fail('firestore_value_invalid');
    // The JSON record is not converted to a different binary representation.
    return {__firestoreBytesBase64:raw};
  }
  if(kind==='geoPointValue'){
    if(!plain(raw)||!Number.isFinite(Number(raw.latitude))||
      !Number.isFinite(Number(raw.longitude)))throw fail('firestore_value_invalid');
    return {latitude:Number(raw.latitude),longitude:Number(raw.longitude)};
  }
  if(kind==='arrayValue'){
    if(!plain(raw)||(!Array.isArray(raw.values)&&raw.values!==undefined))
      throw fail('firestore_value_invalid');
    return (raw.values||[]).map(v=>decodeQaFirestoreValue(v,depth+1));
  }
  if(kind==='mapValue'){
    if(!plain(raw)||(!plain(raw.fields)&&raw.fields!==undefined))
      throw fail('firestore_value_invalid');
    const mapped=Object.create(null);
    for(const [key,v] of Object.entries(raw.fields||{})){
      if(key==='__proto__'||key==='constructor'||key==='prototype')
        throw fail('firestore_field_name_unsafe');
      mapped[key]=decodeQaFirestoreValue(v,depth+1);
    }
    return {...mapped};
  }
  throw fail('firestore_value_unsupported');
}
export function decodeQaFirestoreSnapshotDocument(snapshot){
  if(!plain(snapshot)||!plain(snapshot.fields))throw fail('firestore_document_invalid');
  const data=Object.create(null);
  for(const [key,value] of Object.entries(snapshot.fields)){
    if(key==='__proto__'||key==='constructor'||key==='prototype')
      throw fail('firestore_field_name_unsafe');
    data[key]=decodeQaFirestoreValue(value);
  }
  return {...data};
}
const value=(row,k,c)=>row[k]??(c?row[c]:undefined);
const string=(row,k,c)=>text(value(row,k,c));
function requiredScore(row){
  const v=value(row,'final_score','finalScore');
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100)
    throw fail('evaluation_score_invalid_or_missing');
  return v;
}
export function normalizeQaFirestoreEvaluation(docId,snapshot,sourceHash){
  if(!safeId(docId)||!sha.test(sourceHash||''))
    throw fail('evaluation_identity_invalid');
  const original=decodeQaFirestoreSnapshotDocument(snapshot);
  if(original.id!==undefined&&original.id!==docId)
    throw fail('evaluation_document_id_mismatch');
  const preview=value(original,'raw_data_preview','rawDataPreview')||{};
  if(!plain(preview))throw fail('evaluation_metadata_invalid');
  const evaluationType=string(original,'evaluation_type','evaluationType')||
    text(preview['Evaluation Type'])||'case';
  if(!['case','no_case_month'].includes(evaluationType))
    throw fail('evaluation_type_invalid');
  const agentName=string(original,'agent_name','agentName')||
    string(original,'target_display_name','targetDisplayName');
  const exactMonth=string(original,'evaluation_month_key','evaluationMonthKey')||
    text(preview['Evaluation Month Key']);
  const monthSource=exactMonth||string(original,'audit_date','auditDate')||
    string(original,'audit_timestamp','auditTimestamp')||
    string(original,'submitted_at','submittedAt');
  const monthKey=/^(\d{4}-\d{2})/.exec(monthSource)?.[1]||monthSource;
  const caseId=string(original,'case_id','caseId');
  const score=requiredScore(original);
  const topics=value(original,'topics')??null;
  if(!agentName.trim()||!month.test(monthKey)||
    !Array.isArray(topics)||topics.some(t=>!plain(t))||
    (evaluationType==='case'&&!caseId.trim())||
    (evaluationType==='no_case_month'&&(caseId!==''||score!==0)))
    throw fail('evaluation_scope_or_topics_invalid');
  // Original values are preserved; none of the scoring components are
  // synthesized, re-weighted or recomputed.
  const record={
    id:docId,
    evaluationKey:string(original,'evaluation_key','evaluationKey')||docId,
    evaluationType,
    isTestCase:value(original,'is_test_case','isTestCase')===true,
    evaluationMonthKey:monthKey,
    caseId,agentName,
    targetUsername:string(original,'target_username','targetUsername'),
    targetDisplayName:string(original,'target_display_name','targetDisplayName'),
    targetEmail:string(original,'target_email','targetEmail'),
    targetRole:string(original,'target_role','targetRole'),
    auditDate:string(original,'audit_date','auditDate'),
    auditTimestamp:string(original,'audit_timestamp','auditTimestamp'),
    waitingTime:string(original,'waiting_time','waitingTime'),
    serviceTime:string(original,'service_time','serviceTime'),
    caseUrl:string(original,'case_url','caseUrl'),
    inquiry:string(original,'inquiry'),
    caseDescription:string(original,'case_description','caseDescription'),
    processReference:string(original,'process_reference','processReference')||
      text(preview['Process Reference']),
    evidenceUrls:array(value(original,'evidence_urls','evidenceUrls')),
    callLogs:array(value(original,'call_logs','callLogs')),
    criticalError:value(original,'critical_error','criticalError')===true,
    finalScore:score,
    grade:string(original,'grade'),
    qaScheme:string(original,'qa_scheme','qaScheme'),
    rubricName:string(original,'rubric_name','rubricName'),
    rubricPeriod:string(original,'rubric_period','rubricPeriod'),
    completedTopics:Number(value(original,'completed_topics','completedTopics')??0),
    totalTopics:Number(value(original,'total_topics','totalTopics')??0),
    strengths:array(value(original,'strengths')),
    improvements:array(value(original,'improvements')),
    topics,
    rawDataPreview:preview,
    evaluatorUsername:string(original,'evaluator_username','evaluatorUsername'),
    evaluatorName:string(original,'evaluator_name','evaluatorName'),
    submittedAt:string(original,'submitted_at','submittedAt'),
    createdAt:string(original,'created_at','createdAt'),
    updatedAt:string(original,'updated_at','updatedAt'),
    deletedAt:string(original,'deleted_at','deletedAt'),
  };
  if(!Number.isSafeInteger(record.completedTopics)||record.completedTopics<0||
     !Number.isSafeInteger(record.totalTopics)||record.totalTopics<0||
     !plain(record.rawDataPreview)||!record.evaluatorUsername.trim())
    throw fail('evaluation_metadata_invalid');
  if(record.topics.some(t=>
     typeof t.code!=='string'||!Number.isFinite(t.score)||
     !Number.isFinite(t.max)||t.score<0||t.max<0||t.score>t.max))
    throw fail('evaluation_topic_score_invalid');
  return Object.freeze({
    evaluationId:docId,sourceHash,record,
    deletedAt:record.deletedAt||null,
    unchangedFinalScore:score,
    rawFirestoreDocument:snapshot,
  });
}
