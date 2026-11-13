// Separate Windows-only QA bridge candidate; does not replace the existing
// archive listener (8788), production web app, or QA Sparks.
// Default: monitor only, read-only Postgres role, isolated port 8789.
// A data/write listener requires independent, SHA-pinned server-owned proofs.
// No browser-provided switch, role or outage flag is accepted.
import {createHash} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {createServer} from 'node:http';
import {isAbsolute,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createQaBridgeRouter,validateLocalQaConnectionString}
  from './qaLocalBridgeServer.js';
import {createQaStandaloneDataBridge} from './qaStandbyBridgeRuntime.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};
const HEX=/^[a-f0-9]{64}$/;
const secret=x=>typeof x==='string'&&x.length>=40;
const allowableFlag=x=>x===undefined||x===''||x==='0'||x==='1';

export function validateQaWindowsBridgeConfig(env={}){
  const archiveUrl=env.QA_LOCAL_DATABASE_URL;
  const archiveToken=env.QA_LOCAL_BRIDGE_TOKEN;
  const dataEnabled=env.QA_LOCAL_STANDBY_DATA_ENABLED==='1';
  const writesEnabled=env.QA_LOCAL_STANDBY_WRITES_ENABLED==='1';
  const port=Number(env.QA_LOCAL_STANDBY_PORT||8790);
  if(!validateLocalQaConnectionString(archiveUrl)||!secret(archiveToken))
    fail('qa_candidate_requires_existing_local_read_only_connection');
  if(!Number.isSafeInteger(port)||port<1024||port>65535||port===8787||port===8788)
    fail('qa_candidate_port_must_not_replace_existing_bridge');
  for(const key of ['QA_LOCAL_STANDBY_DATA_ENABLED',
    'QA_LOCAL_STANDBY_WRITES_ENABLED','QA_STANDBY_CUTOVER_ENABLED'])
    if(!allowableFlag(env[key]))fail('qa_candidate_invalid_feature_flag');
  if(writesEnabled&&!dataEnabled)fail('qa_candidate_data_disabled');
  if(writesEnabled&&env.QA_STANDBY_CUTOVER_ENABLED!=='1')
    fail('qa_candidate_cutover_not_authorized');
  if(dataEnabled){
    if(!secret(env.QA_LOCAL_STANDBY_DATA_TOKEN)||
       env.QA_LOCAL_STANDBY_DATA_TOKEN===archiveToken)
      fail('qa_candidate_distinct_data_token_required');
    if(!validateLocalQaConnectionString(env.QA_LOCAL_STANDBY_WRITE_DATABASE_URL))
      fail('qa_candidate_dedicated_writer_missing');
    const proofPath=env.QA_LOCAL_STANDBY_PROOF_MODULE;
    if(typeof proofPath!=='string'||!isAbsolute(proofPath)||
       basename(proofPath)!=='qaStandbyProductionProofs.mjs'||
       !HEX.test(env.QA_LOCAL_STANDBY_PROOF_SHA256||''))
      fail('qa_candidate_reviewed_proof_module_missing');
  }
  return Object.freeze({port,archiveUrl,archiveToken,
    dataEnabled,writesEnabled,
    writerUrl:dataEnabled?env.QA_LOCAL_STANDBY_WRITE_DATABASE_URL:null,
    dataToken:dataEnabled?env.QA_LOCAL_STANDBY_DATA_TOKEN:null,
    proofPath:dataEnabled?env.QA_LOCAL_STANDBY_PROOF_MODULE:null,
    proofHash:dataEnabled?env.QA_LOCAL_STANDBY_PROOF_SHA256:null});
}
async function verifyProofModule(path,hash){
  const canonical=await realpath(path);
  if(canonical!==path)fail('qa_candidate_proof_module_symlink_forbidden');
  const bytes=await readFile(canonical);
  const actual=createHash('sha256').update(bytes).digest('hex');
  if(actual!==hash)fail('qa_candidate_proof_hash_mismatch');
  const mod=await import(pathToFileURL(canonical).href);
  if(typeof mod.createQaServerProofs!=='function')
    fail('qa_candidate_invalid_proof_provider');
  return mod.createQaServerProofs;
}

// Injection points exist solely for isolated tests. Production always creates
// physical local PostgreSQL pools and re-checks the actual database roles.
export async function createQaWindowsBridgeServer({
  env=process.env,pgModule,proofLoader=verifyProofModule,
  serverFactory=createServer,injectPools,sourceOverrides,
}={}){
  const config=validateQaWindowsBridgeConfig(env);
  const fixture=env.QA_PG_ISOLATED_TEST==='1';
  if((injectPools||sourceOverrides||pgModule||proofLoader!==verifyProofModule||
      serverFactory!==createServer)&&!fixture)
    fail('qa_candidate_production_injection_forbidden');
  let readPool,writePool,server;
  try{
    if(injectPools){
      if(!fixture)fail('qa_candidate_test_injection_denied');
      readPool=injectPools.readPool;
      writePool=injectPools.writePool;
    }else{
      const pg=pgModule||(await import('pg')).default;
      readPool=new pg.Pool({connectionString:config.archiveUrl,max:3,
        connectionTimeoutMillis:5000,idleTimeoutMillis:10000,
        options:'-c default_transaction_read_only=on'});
    }
    // Fail BEFORE opening port if the archive cannot be read in read-only mode.
    const readRole=(await readPool.query(
      "SELECT current_database() AS db,current_user AS role,"+
      " current_setting('transaction_read_only') AS readonly,"+
      " r.rolsuper AS superuser FROM pg_roles r WHERE r.rolname=current_user"
    )).rows?.[0];
    if((readRole?.db!=='qa_dashboard_lab'&&
       !(fixture&&readRole?.db==='qa_cutover_ci_test'))||
       readRole.readonly!=='on'||readRole.superuser!==false)
      fail('qa_candidate_read_role_unverified');
    let handler=createQaBridgeRouter(readPool,{token:config.archiveToken});
    if(config.dataEnabled){
      if(!writePool){
        const pg=pgModule||(await import('pg')).default;
        writePool=new pg.Pool({connectionString:config.writerUrl,max:2,
          connectionTimeoutMillis:5000,idleTimeoutMillis:10000,
          statement_timeout:5000});
      }
      const writer=(await writePool.query(
        "SELECT current_database() AS db,current_user AS role,"+
        " current_setting('transaction_read_only') AS readonly,"+
        " r.rolsuper AS superuser,"+
        " has_table_privilege(current_user,"+
        " 'qa_failover_v1.evaluations','INSERT,SELECT,UPDATE') AS eval_writer,"+
        " has_table_privilege(current_user,"+
        " 'qa_failover_v1.outbox','INSERT,SELECT,UPDATE') AS queue_writer"+
        " FROM pg_roles r WHERE r.rolname=current_user"
      )).rows?.[0];
      if((writer?.db!=='qa_dashboard_lab'&&
         !(fixture&&writer?.db==='qa_cutover_ci_test'))||
         writer.readonly!=='off'||writer.superuser!==false||
         writer.role===readRole.role||
         writer.eval_writer!==true||writer.queue_writer!==true)
        fail('qa_candidate_dedicated_write_role_unverified');
      const createProofs=sourceOverrides?.createQaServerProofs||
        await proofLoader(config.proofPath,config.proofHash);
      const sources=await createProofs({readPool,writePool});
      handler=createQaStandaloneDataBridge({
        readPool,writePool,token:config.dataToken,
        archiveToken:config.archiveToken,sources,env,
      });
    }
    server=serverFactory((req,res)=>{
      try{
        Promise.resolve(handler(req,res)).catch(()=>{
          if(!res.headersSent)res.writeHead(503,{'Cache-Control':'no-store'});
          if(!res.writableEnded)res.end();
        });
      }catch{
        if(!res.headersSent)res.writeHead(503,{'Cache-Control':'no-store'});
        if(!res.writableEnded)res.end();
      }
    });
    server.requestTimeout=8000;
    server.headersTimeout=9000;
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(config.port,'127.0.0.1',()=>{
        server.off('error',reject);resolve();
      });
    });
    const shutdown=async()=>{
      await new Promise(resolve=>server.close(resolve));
      await writePool?.end?.();
      await readPool?.end?.();
    };
    return Object.freeze({port:config.port,dataEnabled:config.dataEnabled,
      writesEnabled:config.writesEnabled,
      archiveReadOnly:true,server,shutdown});
  }catch(error){
    try{await new Promise(resolve=>server?.close(resolve)??resolve());}catch{}
    await writePool?.end?.().catch(()=>{});
    await readPool?.end?.().catch(()=>{});
    throw error;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  createQaWindowsBridgeServer().then(instance=>{
    console.log('QA_WINDOWS_BRIDGE_PORT='+instance.port);
    console.log('QA_WINDOWS_BRIDGE=LOOPBACK_ONLY');
    console.log('QA_WINDOWS_BRIDGE_DATA='+(
      instance.dataEnabled?'SERVER_VERIFIED_ONLY':'DISABLED'));
    console.log('QA_WINDOWS_BRIDGE_WRITES='+(
      instance.writesEnabled?'SERVER_VERIFIED_ONLY':'DISABLED'));
    console.log('QA_PRODUCTION_FAILOVER=NOT_AUTOMATICALLY_ENABLED');
    let stopping=false;
    const stop=()=>{if(stopping)return;stopping=true;void instance.shutdown();};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }).catch(error=>{
    console.error('QA_WINDOWS_BRIDGE=START_BLOCKED_'+(
      /^[a-z_]+$/.test(error?.code||'')?error.code:'CONFIGURATION'));
    process.exitCode=2;
  });
}
