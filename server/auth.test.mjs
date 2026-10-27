import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.mjs';

const TEST_PASSWORD='Only-A-Test!Password-123';
async function fixture(t,auth){
  const app=createApp({dbPath:':memory:',serveStatic:false,auth});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.close();app.locals.db.close();});
  const url=`http://127.0.0.1:${server.address().port}`;
  return {app,url,request:async(path,{method='GET',body,cookie,headers={}}={})=>{
    const response=await fetch(url+path,{method,headers:{...headers,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json(),headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }};
}
test('public mode refuses absent, short and repeated-character passwords before startup',()=>{
  for(const password of ['', 'short', 'aaaaaaaaaaaaaaaaaaaa'])assert.throws(()=>createApp({dbPath:':memory:',auth:{publicMode:true,password}}),/APP_PASSWORD/);
  assert.throws(()=>createApp({dbPath:':memory:',auth:{publicMode:true,password:TEST_PASSWORD,allowedOrigin:'http://public.example'}}),/HTTPS/);
});
test('the public API exposes only auth state and health before login',async t=>{
  const f=await fixture(t,{publicMode:true,password:TEST_PASSWORD,allowedOrigin:''});
  let r=await f.request('/api/auth');assert.deepEqual(r.data,{required:true,authenticated:false});assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal((await f.request('/api/health')).status,200);
  for(const path of ['/api/dashboard?source=demo','/api/settings','/api/status','/api/ideas','/api/news','/api/export','/api/import/template'])assert.equal((await f.request(path)).status,401,path);
  assert.equal((await f.request('/api/import',{method:'POST',body:{csv:'do not import'}})).status,401);
  assert.equal((await f.request('/api/settings',{method:'PUT',body:{name:'Do not mutate'}})).status,401);
});
test('login issues a secure HttpOnly cookie; logout invalidates it and passwords never enter responses',async t=>{
  const f=await fixture(t,{publicMode:true,password:TEST_PASSWORD,allowedOrigin:'https://joare.example'});
  let r=await f.request('/api/auth/login',{method:'POST',body:{password:'wrong'}});assert.equal(r.status,401);
  r=await f.request('/api/auth/login',{method:'POST',body:{password:TEST_PASSWORD},headers:{Origin:'https://joare.example'}});assert.equal(r.status,200);assert.equal(r.data.authenticated,true);assert.ok(!JSON.stringify(r.data).includes(TEST_PASSWORD));
  const fullCookie=r.headers.get('set-cookie');assert.match(fullCookie,/^__Host-joare_session=/);for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(fullCookie.includes(flag));
  const cookie=r.cookie;assert.deepEqual((await f.request('/api/auth',{cookie})).data,{required:true,authenticated:true});assert.equal((await f.request('/api/settings',{cookie})).status,200);
  r=await f.request('/api/auth/logout',{method:'POST',body:{},cookie,headers:{Origin:'https://joare.example'}});assert.equal(r.data.authenticated,false);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await f.request('/api/settings',{cookie})).status,401);
});
test('sessions expire, rotate on login, remain bounded and disappear after server restart',async t=>{
  let time=100000;const auth={publicMode:false,password:TEST_PASSWORD,allowedOrigin:'',now:()=>time,sessionTtlMs:1000,maxSessions:1};
  const f=await fixture(t,auth);
  const one=await f.request('/api/auth/login',{method:'POST',body:{password:TEST_PASSWORD}});assert.equal((await f.request('/api/auth',{cookie:one.cookie})).data.authenticated,true);
  const two=await f.request('/api/auth/login',{method:'POST',body:{password:TEST_PASSWORD},cookie:one.cookie});assert.notEqual(one.cookie,two.cookie);assert.equal((await f.request('/api/auth',{cookie:one.cookie})).data.authenticated,false);
  const three=await f.request('/api/auth/login',{method:'POST',body:{password:TEST_PASSWORD}});assert.equal((await f.request('/api/auth',{cookie:two.cookie})).data.authenticated,false);assert.equal((await f.request('/api/auth',{cookie:three.cookie})).data.authenticated,true);
  const restarted=await fixture(t,auth);assert.equal((await restarted.request('/api/auth',{cookie:three.cookie})).data.authenticated,false);
  time+=1001;assert.equal((await f.request('/api/auth',{cookie:three.cookie})).data.authenticated,false);
});
test('failed logins are rate-limited despite forged forwarded IP headers and recover after the window',async t=>{
  let time=100000;const f=await fixture(t,{publicMode:false,password:TEST_PASSWORD,allowedOrigin:'',now:()=>time,failedWindowMs:1000,maxFailedAttempts:3});
  for(let i=0;i<3;i++)assert.equal((await f.request('/api/auth/login',{method:'POST',body:{password:'incorrect'},headers:{'X-Forwarded-For':`203.0.113.${i}`}})).status,401);
  let r=await f.request('/api/auth/login',{method:'POST',body:{password:TEST_PASSWORD},headers:{'X-Forwarded-For':'198.51.100.99'}});assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'1');assert.equal(f.app.get('trust proxy'),false);
  time+=1001;r=await f.request('/api/auth/login',{method:'POST',body:{password:TEST_PASSWORD}});assert.equal(r.status,200);
});
test('untrusted origins and cross-site mutations are refused even with a valid session',async t=>{
  const f=await fixture(t,{publicMode:true,password:TEST_PASSWORD,allowedOrigin:'https://joare.example'});
  const login=await f.request('/api/auth/login',{method:'POST',body:{password:TEST_PASSWORD}});
  for(const headers of [{Origin:'https://evil.example'},{Origin:'https://joare.example.evil'},{Origin:'http://localhost:5173'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await f.request('/api/settings',{method:'PUT',body:{name:'Changed'},cookie:login.cookie,headers})).status,403);
  assert.equal((await f.request('/api/settings',{cookie:login.cookie})).data.name,'Camila Joare');
});
test('local default remains password-free and compatible',async t=>{
  const f=await fixture(t,{publicMode:false,password:'',allowedOrigin:''});assert.deepEqual((await f.request('/api/auth')).data,{required:false,authenticated:true});assert.equal((await f.request('/api/dashboard?source=demo')).status,200);assert.equal((await f.request('/api/auth/logout',{method:'POST',body:{}})).data.authenticated,true);
});
