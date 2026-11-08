"""Read-only, complete Sparks census through the expiring Vercel transport."""
import argparse,concurrent.futures,hashlib,json,pathlib,urllib.request
p=argparse.ArgumentParser();p.add_argument('--base-url',required=True);p.add_argument('--secret-file',required=True);p.add_argument('--out',required=True)
a=p.parse_args();secret=json.load(open(a.secret_file))['token']
roots=['qa_sparks_wallets','qa_sparks_true_money_requests','qa_sparks_reward_settings','qa_sparks_special_reward_requests',
 'qa_sparks_special_receipt_evidence','qa_sparks_special_receipt_locks','qa_sparks_fruit_players_v1','qa_sparks_fruit_boards',
 'qa_sparks_fruit_rounds','qa_sparks_lottery_draws_v1','qa_sparks_treasure_daily','qa_announcement_shield',
 'qa_sparks_snakes_rooms_v1','qa_sparks_snakes_members_v1','qa_sparks_typing_relief_operations']
children={'qa_sparks_wallets':['history','lottery_tickets'],'qa_sparks_reward_settings':['history'],'qa_sparks_lottery_draws_v1':['players']}
prefix='projects/qa-dashboard-b0b5d/databases/(default)/documents/'
def collection(name):
 rows=[];token=''
 while True:
  request=urllib.request.Request(a.base_url+'/api/sparks-migration',data=json.dumps({'action':'snapshot','collection':name,'pageToken':token}).encode(),headers={'content-type':'application/json','x-qa-migration-token':secret})
  with urllib.request.urlopen(request,timeout=45) as r:data=json.load(r)
  rows.extend(data.get('documents',[]));token=data.get('nextPageToken','')
  if not token:return rows
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 groups=dict(zip(roots,pool.map(collection,roots)))
 nested=[doc['name'][len(prefix):]+'/'+child for root,docs in groups.items() for doc in docs for child in children.get(root,[])]
 for name,docs in zip(nested,pool.map(collection,nested)):groups[name]=docs
docs=sorted([d for rows in groups.values() for d in rows if 'fields' in d],key=lambda d:d['name'])
assert len({d['name'] for d in docs})==len(docs),'Duplicate source paths'
result={'documents':docs,'counts':{k:len(v) for k,v in groups.items()},'sha256':hashlib.sha256(json.dumps(docs,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
pathlib.Path(a.out).write_text(json.dumps(result));pathlib.Path(a.out).chmod(0o600)
print(json.dumps({'documents':len(docs),'wallets':len(groups['qa_sparks_wallets']),'sha256':result['sha256'],'root_counts':{k:len(groups[k]) for k in roots}}))
