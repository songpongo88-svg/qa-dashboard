type DiscussionEvent = { id?: string; event_type: string; username?: string; case_id?: string; target_agent?: string; created_at?: string; source_case_unavailable?: boolean; details?: Record<string, any> };
export function buildAppealDiscussionTasks(events: readonly DiscussionEvent[], user: {username:string;role:string}, readIds: readonly string[]) {
  if (!user.username) return [];
  const identity=(value:unknown)=>String(value||'').trim().toLowerCase();
  const threads=new Map<string,DiscussionEvent[]>();
  for(const event of events){const d=event.details||{};if(event.event_type!=='appeal_internal_message'||event.source_case_unavailable||!d.requestId||!d.seniorUsername)continue;
    if(user.role!=='Quality Assurance'&&identity(d.seniorUsername)!==identity(user.username))continue;
    const key=String(d.requestId)+'::'+identity(d.seniorUsername)+'::'+String(d.threadId||'legacy');threads.set(key,[...(threads.get(key)||[]),event]);}
  const tasks=[];
  for(const [thread,rows] of threads){rows.sort((a,b)=>Date.parse(a.details?.editedAt||a.created_at||'')-Date.parse(b.details?.editedAt||b.created_at||'')||String(a.id).localeCompare(String(b.id)));
    const latest=rows.at(-1)!;const question=[...rows].reverse().find(row=>row.details?.senderRole==='Quality Assurance');if(!question)continue;
    const answered=latest.details?.senderRole!=='Quality Assurance';
    const recipientRole=String(question.details?.recipientRole||'Senior');const recipientLabel=['Senior','Supervisor'].includes(recipientRole)?'Senior':'Agent';
    if(user.role==='Quality Assurance'&&(!answered||identity(question.username)!==identity(user.username)))continue;
    if(user.role!=='Quality Assurance'&&answered)continue;
    const d=latest.details||{},q=question.details||{};const id='appeal-discussion::'+thread+'::'+String(d.revisionId||d.messageId||latest.id);
    tasks.push({id,type:'appeal-discussion' as const,title:`${answered?recipientLabel+' responded':'Question from QA'}: ${latest.case_id||question.case_id||''}`,badge:answered?recipientLabel+' Responded':'Awaiting '+recipientLabel+' Response',description:[`Agent: ${latest.target_agent||question.target_agent||'-'}`,`Topic: ${q.topicCode||'Whole Case'}`,`From: ${q.senderName||question.username||'-'}`,`Question: ${q.message||'(Evidence attached)'}`,answered?`Response: ${d.message||'(Evidence attached)'}`:'',`Sent: ${latest.created_at||''}`].filter(Boolean).join('\n'),count:1,unread:!readIds.includes(id),actionLabel:answered?'View '+recipientLabel+' Response':'Reply to QA',appealRequestId:String(d.requestId),caseId:String(latest.case_id||question.case_id||''),agentName:String(latest.target_agent||question.target_agent||'')});
  }return tasks;
}
