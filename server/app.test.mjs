import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app.mjs';
import { today, shiftDate } from './data.mjs';
import { parseMetricCSV } from './import.mjs';
import { parseNews, syncMetricool } from './integrations.mjs';

async function fixture(t,{dbPath=':memory:',fetchImpl=async()=>{throw Error('offline');}}={}){
  const app=createApp({dbPath,fetchImpl,serveStatic:false,auth:{password:'',publicMode:false,allowedOrigin:''}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.close();app.locals.db.close();});
  const url=`http://127.0.0.1:${server.address().port}`;
  return {app,url,request:async(path,body,method='POST')=>{const r=await fetch(url+path,body===undefined?undefined:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:r.status===204?null:(r.headers.get('content-type')?.includes('json')?await r.json():await r.text())};}};
}
test('real empty dashboard stays empty; demo data never enters the real database',async t=>{
  const f=await fixture(t);const demo=await f.request('/api/dashboard?source=demo&days=30');assert.equal(demo.status,200);assert.equal(demo.data.daily.length,30);assert.ok(demo.data.stats.views>0);assert.equal(demo.data.demo,true);
  const real=await f.request('/api/dashboard?source=live&days=30');assert.equal(real.data.hasData,false);assert.equal(real.data.stats.views,null);assert.equal(f.app.locals.db.prepare('SELECT count(*) n FROM metrics').get().n,0);
});
test('CSV import accepts locale headers, updates atomically, distinguishes missing from zero',async t=>{
  const f=await fixture(t),d=today();let r=await f.request('/api/import',{csv:`Data;Visualizações;Alcance;Curtidas\n${d};1.234;800;0`});assert.equal(r.status,200);assert.equal(r.data.count,1);
  r=await f.request('/api/dashboard?days=7');assert.equal(r.data.stats.views,1234);assert.equal(r.data.stats.likes,0);assert.equal(r.data.stats.followers,null);assert.equal(r.data.stats.engagement,null);
  r=await f.request('/api/import',{csv:`date,views,likes\n${d},900,15\n${shiftDate(d,-1)},notanumber,1`});assert.equal(r.status,400);assert.equal(f.app.locals.db.prepare('SELECT views FROM metrics WHERE date=?').get(d).views,1234);
  r=await f.request('/api/import',{csv:`date,views\n${d},800`});assert.equal(r.status,200);const row=f.app.locals.db.prepare('SELECT * FROM metrics WHERE date=?').get(d);assert.equal(row.views,800);assert.equal(row.likes,null);
});
test('invalid dates, duplicated days and malformed CSV are rejected',()=>{
  for(const csv of ['date,views\n2026-02-30,10','date,views\n2099-01-01,5',`date,views\n${today()},5\n${today()},8`,'date,views\n2026-01-01,-2','date,views\n2026-01-01,NaN','date,views\n2026-01-01,2,3'])assert.throws(()=>parseMetricCSV(csv));
});
test('profiles and planner persist after the SQLite database is reopened',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'joare-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const dbPath=join(dir,'db.sqlite');
  const first=await fixture(t,{dbPath});let result=await first.request('/api/settings',{handle:'@camila.exemplo',name:'Camila Joare'},'PUT');assert.equal(result.data.handle,'camila.exemplo');
  const created=await first.request('/api/ideas',{title:'Meu post',format:'Reel',pillar:'MEI',hook:'Uma pergunta',caption:'Um conteúdo',date:today(),status:'planned'});assert.equal(created.status,201);
  const other=createApp({dbPath,serveStatic:false,auth:{password:'',publicMode:false,allowedOrigin:''}});t.after(()=>other.locals.db.close());assert.equal(other.locals.db.prepare("SELECT value FROM settings WHERE key='handle'").get().value,'camila.exemplo');assert.equal(other.locals.db.prepare('SELECT status FROM ideas WHERE id=?').get(created.data.id).status,'planned');
});
test('CSV export preserves zeros and blanks, query and origin validation work',async t=>{
  const f=await fixture(t);await f.request('/api/import',{csv:`date,views,likes\n${today()},0,5`});const exported=await f.request('/api/export?days=7');assert.match(exported.data,new RegExp(`${today()},0,,5,,,,`));
  assert.equal((await f.request('/api/dashboard?days=999')).status,400);assert.equal((await f.request('/api/dashboard?source=fake')).status,400);assert.equal((await f.request('/api/settings',{token:'do-not-store'},'PUT')).status,400);
});
test('UOL parser accepts genuine source links and failed updates report errors honestly',async t=>{
  const xml='<rss><channel><item><title>Novidades do imposto</title><link>https://economia.uol.com.br/noticias/imposto.htm</link><description>Receita Federal</description><pubDate>Tue, 27 Oct 2026 10:00:00 GMT</pubDate></item><item><title>imposto</title><link>https://evil.example/noticia</link></item></channel></rss>';
  assert.equal(parseNews(xml).length,1);const f=await fixture(t);const result=await f.request('/api/news');assert.equal(result.data.articles.length,0);assert.equal(result.data.stale,true);assert.ok(result.data.error);assert.equal(result.data.fetchedAt,null);
});
test('Metricool missing configuration is actionable and API responses are not fabricated',async t=>{
  const f=await fixture(t);const original=process.env.METRICOOL_TOKEN;delete process.env.METRICOOL_TOKEN;t.after(()=>{if(original!==undefined)process.env.METRICOOL_TOKEN=original;else delete process.env.METRICOOL_TOKEN;});
  assert.equal((await f.request('/api/sync',{})).status,409);
  process.env.METRICOOL_TOKEN='test-secret';const settings={metricoolUserId:'1',metricoolBlogId:'2'};
  const result=await syncMetricool(f.app.locals.db,settings,{fetchImpl:async url=>({ok:true,json:async()=>({data:[{values:[{dateTime:`${today()}T00:00:00`,value:new URL(url).searchParams.get('metric')==='videoviews'?42:10}]}]})})});
  assert.equal(result.count,1);const row=f.app.locals.db.prepare('SELECT * FROM metrics').get();assert.equal(row.views,42);assert.equal(row.likes,null);assert.equal(row.followers,null);
  await f.request('/api/import',{csv:`date,views\n${today()},99`});const skipped=await syncMetricool(f.app.locals.db,settings,{fetchImpl:async()=>({ok:true,json:async()=>({data:[{values:[{dateTime:today(),value:10}]}]})})});assert.equal(skipped.skipped,1);assert.equal(f.app.locals.db.prepare('SELECT views FROM metrics').get().views,99);
});

test('post reports persist and upsert without polluting daily metrics; missing engagement fields stay null',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'joare-posts-')),dbPath=join(dir,'db.sqlite');
  const f=await fixture(t,{dbPath});
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const csv=`post_id,data,titulo,formato,url,visualizacoes,alcance,curtidas,comentarios,salvamentos,compartilhamentos\npost-1,${today()},MEI na prática,Reels,https://www.instagram.com/reel/Abc123/?utm_source=teste,2000,1000,30,4,5,1`;
  let r=await f.request('/api/import',{csv,type:'posts'});assert.equal(r.status,200);assert.equal(r.data.type,'posts');assert.equal(r.data.count,1);
  r=await f.request('/api/dashboard?days=7');assert.equal(r.data.hasPostData,true);assert.equal(r.data.hasData,false);assert.equal(r.data.stats.views,null);assert.equal(r.data.posts[0].engagement,4);assert.equal(r.data.posts[0].format,'Reel');assert.equal(r.data.posts[0].url,'https://www.instagram.com/reel/Abc123/');assert.ok(r.data.posts[0].importedAt);
  await f.request('/api/import',{csv:`post_id,data,titulo,visualizacoes,alcance,curtidas\npost-1,${today()},MEI atualizado,2500,1200,45`,type:'posts'});
  r=await f.request('/api/dashboard?days=7');assert.equal(r.data.posts.length,1);assert.equal(r.data.posts[0].views,2500);assert.equal(r.data.posts[0].engagement,null);assert.equal(f.app.locals.db.prepare('SELECT count(*) n FROM metrics').get().n,0);
  const reopened=createApp({dbPath,serveStatic:false,auth:{password:'',publicMode:false,allowedOrigin:''}});assert.equal(reopened.locals.db.prepare('SELECT views FROM posts').get().views,2500);reopened.locals.db.close();
});
test('post reports reject unsafe links and duplicates atomically; URL-only stable ID normalizes tracking',async t=>{
  const f=await fixture(t);
  for(const url of ['javascript:alert(1)','https://evil.example/p/ABC/','http://www.instagram.com/p/ABC/','https://www.instagram.com@evil.example/p/ABC/','https://www.instagram.com:4000/p/ABC/']){
    const r=await f.request('/api/import',{type:'posts',csv:`post_id,data,titulo,url,views\n1,${today()},Teste,${url},10`});assert.equal(r.status,400);
  }
  assert.equal(f.app.locals.db.prepare('SELECT count(*) n FROM posts').get().n,0);
  let r=await f.request('/api/import',{type:'posts',csv:`data,titulo,url,views\n${today()},Teste,https://instagram.com/p/ABC/?source=a,10`});assert.equal(r.status,200);
  r=await f.request('/api/import',{type:'posts',csv:`data,titulo,url,views\n${today()},Teste,https://www.instagram.com/p/ABC/?source=b,20`});assert.equal(r.status,200);assert.equal(f.app.locals.db.prepare('SELECT count(*) n FROM posts').get().n,1);
  r=await f.request('/api/import',{type:'posts',csv:`post_id,data,titulo,views\n2,${today()},Teste,10\n2,${today()},Duplicado,20`});assert.equal(r.status,400);assert.equal(f.app.locals.db.prepare('SELECT count(*) n FROM posts').get().n,1);
});
test('growth needs two complete equal periods and engagement needs every field in every day',async t=>{
  const f=await fixture(t),header='data,views,reach,likes,comments,saves,shares,followers';
  const csv=header+'\n'+Array.from({length:14},(_,i)=>`${shiftDate(today(),-i)},${i<7?200:100},100,10,5,3,2,1000`).join('\n');
  await f.request('/api/import',{csv});let r=await f.request('/api/dashboard?days=7');assert.equal(r.data.stats.engagement,20);assert.equal(r.data.summary.find(x=>x.key==='views').change,100);
  await f.request('/api/import',{csv:`date,likes,reach\n${today()},10,100`});r=await f.request('/api/dashboard?days=7');assert.equal(r.data.summary.find(x=>x.key==='views').change,null);assert.equal(r.data.summary.find(x=>x.key==='likes').change,0);assert.equal(r.data.stats.engagement,null);assert.equal(r.data.summary.find(x=>x.key==='views').coverage.currentDays,6);
});
test('CSV profile and Reels API metrics never mix in a single dashboard aggregate',async t=>{
  const f=await fixture(t),db=f.app.locals.db;
  db.prepare('INSERT INTO metrics(date,views,source,imported_at) VALUES (?,?,?,?)').run(shiftDate(today(),-1),900,'metricool-api',new Date().toISOString());
  await f.request('/api/import',{csv:`date,views\n${today()},100`});const r=await f.request('/api/dashboard?days=7');assert.equal(r.data.stats.views,100);assert.equal(r.data.liveSource,'metricool-csv');assert.equal(r.data.daily.find(x=>x.date===shiftDate(today(),-1)).views,null);
});

test('malformed JSON receives a clear 400 response',async t=>{const f=await fixture(t);const r=await fetch(f.url+'/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:'{invalid'});assert.equal(r.status,400);assert.match((await r.json()).error,/JSON inválido/);});
