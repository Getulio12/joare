import express from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { openDatabase, getSettings, setSettings, validDate, today, shiftDate } from './data.mjs';
import { dashboard } from './analytics.mjs';
import { AppError, parseMetricCSV, saveMetrics, CSV_HEADER } from './import.mjs';
import { getNews, metricoolStatus, syncMetricool } from './integrations.mjs';
import { parsePostsCSV, savePosts, POSTS_CSV_HEADER } from './posts-import.mjs';
import { createAuthentication } from './auth.mjs';

export function createApp({dbPath=resolve('data/joare.sqlite'),fetchImpl=fetch,serveStatic=true,auth}={}){
  const authentication=createAuthentication(auth);
  const app=express(),db=openDatabase(dbPath);
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'Origem não autorizada.'});
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin){
      try{
        const u=new URL(req.headers.origin);
        const local=!authentication.publicMode&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);
        const explicit=authentication.allowedOrigin&&u.origin===authentication.allowedOrigin;
        const samePublicOrigin=authentication.publicMode&&!authentication.allowedOrigin&&u.protocol==='https:'&&u.host===req.headers.host;
        if(!local&&!explicit&&!samePublicOrigin)return res.status(403).json({error:'Origem não autorizada.'});
      }catch{return res.status(403).json({error:'Origem inválida.'});}
    }next();
  });
  app.use(express.json({limit:'4mb'}));
  authentication.register(app);
  app.get('/api/health',(req,res)=>res.json({ok:true,database:!!db.prepare('SELECT 1').get()}));
  app.get('/api/status',(req,res)=>res.json({profile:getSettings(db),integrations:{metricool:metricoolStatus(getSettings(db)),uol:{configured:true,feedUrl:'https://rss.uol.com.br/feed/economia.xml',requiresNetwork:true}},database:{engine:'SQLite',persistent:dbPath!==':memory:',metrics:db.prepare('SELECT count(*) AS n FROM metrics').get().n},lastImport:db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 1').get()??null}));
  const range=req=>{const days=Number(req.query.days??30);if(![7,30,90].includes(days))throw new AppError('Período inválido. Use 7, 30 ou 90 dias.');const source=req.query.source??'live';if(!['demo','live'].includes(source))throw new AppError('Fonte inválida.');return {days,source};};
  app.get('/api/dashboard',(req,res)=>res.json(dashboard(db,getSettings(db),range(req))));
  app.get('/api/settings',(req,res)=>res.json({...getSettings(db),metricool:metricoolStatus(getSettings(db))}));
  app.put('/api/settings',(req,res)=>{
    const body=req.body??{},allowed=['name','handle','goal','metricoolUserId','metricoolBlogId'],updates={};
    for(const key of Object.keys(body)){if(!allowed.includes(key))throw new AppError(`Campo não aceito: ${key}. Credenciais devem ser configuradas no .env.`);const value=String(body[key]??'').trim();if(value.length>500)throw new AppError('Valor longo demais.');updates[key]=value;}
    if('name'in updates&&!updates.name)throw new AppError('Informe o nome do perfil.');
    if(updates.handle){updates.handle=updates.handle.replace(/^@/,'');if(!/^[A-Za-z0-9._]{1,30}$/.test(updates.handle))throw new AppError('O @ deve conter até 30 letras, números, pontos ou sublinhados.');}
    for(const key of ['metricoolUserId','metricoolBlogId'])if(updates[key]&&!/^\d{1,30}$/.test(updates[key]))throw new AppError('Os IDs do Metricool devem ser numéricos.');
    res.json(setSettings(db,updates));
  });
  app.post('/api/import',(req,res)=>{
    const type=req.body?.type??'daily';
    if(!['daily','posts'].includes(type))throw new AppError('Tipo de importação inválido. Use daily ou posts.');
    if(type==='posts')return res.json({...savePosts(db,parsePostsCSV(req.body?.csv)),message:'Publicações importadas. Os valores são totais acumulados por post no momento do relatório; não foram somados às métricas diárias.'});
    const rows=parseMetricCSV(req.body?.csv);res.json({type:'daily',...saveMetrics(db,rows,'metricool-csv'),message:'Métricas importadas. Campos ausentes ficam sem dados; datas iguais são substituídas.'});
  });
  app.get('/api/import/template',(req,res)=>{const type=req.query.type??'daily';if(!['daily','posts'].includes(type))throw new AppError('Tipo de modelo inválido.');res.type('text/csv; charset=utf-8');res.attachment(`modelo-metricool-${type}-joare.csv`);res.send('\uFEFF'+(type==='posts'?POSTS_CSV_HEADER:CSV_HEADER)+'\n');});
  let syncing=false;
  app.post('/api/sync',async(req,res,next)=>{if(syncing)return next(new AppError('Uma sincronização já está em andamento.',409));syncing=true;try{res.json(await syncMetricool(db,getSettings(db),{fetchImpl}));}catch(e){next(e);}finally{syncing=false;}});
  app.get('/api/export',(req,res)=>{
    const result=dashboard(db,getSettings(db),range(req));
    const csv=CSV_HEADER+'\n'+result.daily.map(r=>[r.date,...['views','reach','likes','comments','saves','shares','followers'].map(k=>r[k]??'')].join(',')).join('\n');
    res.type('text/csv; charset=utf-8');res.attachment(`joare-${result.source}-${result.period.start}.csv`);res.send('\uFEFF'+csv);
  });
  app.get('/api/ideas',(req,res)=>res.json({ideas:db.prepare('SELECT * FROM ideas ORDER BY createdAt DESC,id').all()}));
  const validateIdea=(body,partial=false)=>{
    const out={};for(const key of Object.keys(body)){if(!['title','format','pillar','hook','caption','status','date'].includes(key))throw new AppError('Campo de ideia inválido.');const value=body[key]===null?null:String(body[key]).trim();if(value&&value.length>5000)throw new AppError('Texto longo demais.');out[key]=value;}
    if(!partial)for(const key of ['title','format','pillar','hook','caption'])if(!out[key])throw new AppError(`Preencha ${key}.`);
    for(const key of ['title','format','pillar','hook','caption','status'])if(key in out&&!out[key])throw new AppError(`O campo ${key} não pode estar vazio.`);
    if(out.status&&!['idea','planned','published'].includes(out.status))throw new AppError('Status inválido.');
    if(out.format&&!['Reel','Carrossel','Stories','Post'].includes(out.format))throw new AppError('Formato inválido.');
    if(out.date&&!validDate(out.date))throw new AppError('Data inválida.');
    return out;
  };
  app.post('/api/ideas',(req,res)=>{const b=validateIdea(req.body??{}),id=randomUUID();db.prepare('INSERT INTO ideas (id,title,format,pillar,hook,caption,status,date,createdAt) VALUES (?,?,?,?,?,?,?,?,?)').run(id,b.title,b.format,b.pillar,b.hook,b.caption,b.status??'idea',b.date??null,new Date().toISOString());res.status(201).json(db.prepare('SELECT * FROM ideas WHERE id=?').get(id));});
  app.patch('/api/ideas/:id',(req,res)=>{if(!db.prepare('SELECT 1 FROM ideas WHERE id=?').get(req.params.id))throw new AppError('Ideia não encontrada.',404);const b=validateIdea(req.body??{},true);if(!Object.keys(b).length)throw new AppError('Informe os campos para atualizar.');db.prepare(`UPDATE ideas SET ${Object.keys(b).map(k=>`${k}=?`).join(',')} WHERE id=?`).run(...Object.values(b),req.params.id);res.json(db.prepare('SELECT * FROM ideas WHERE id=?').get(req.params.id));});
  app.delete('/api/ideas/:id',(req,res)=>{if(!db.prepare('DELETE FROM ideas WHERE id=?').run(req.params.id).changes)throw new AppError('Ideia não encontrada.',404);res.status(204).end();});
  app.get('/api/news',async(req,res,next)=>{try{res.json(await getNews(db,{refresh:req.query.refresh==='1',fetchImpl}));}catch(e){next(e);}});
  app.use('/api',(req,res)=>res.status(404).json({error:'Rota não encontrada.'}));
  if(serveStatic&&existsSync(resolve('dist/index.html'))){app.use(express.static(resolve('dist')));app.get('/{*splat}',(req,res)=>res.sendFile(resolve('dist/index.html')));}
  app.use((err,req,res,next)=>{if(res.headersSent)return next(err);const status=err.status??(err.type==='entity.too.large'?413:500);res.status(status).json({error:err.type==='entity.parse.failed'?'JSON inválido. Confira o formato da solicitação.':status<500||err instanceof AppError?err.message:'Não foi possível concluir a operação. Verifique o servidor e tente novamente.'});});
  app.locals.db=db;
  app.locals.syncDaily=async()=>{if(syncing||!metricoolStatus(getSettings(db)).configured)return;const last=db.prepare("SELECT createdAt FROM events WHERE type='metricool-api' ORDER BY id DESC LIMIT 1").get();if(last?.createdAt&&today(new Date(last.createdAt))===today())return;syncing=true;try{await syncMetricool(db,getSettings(db),{fetchImpl});console.log('Sincronização diária do Metricool concluída.');}catch(e){console.warn('Sincronização diária indisponível:',e.message);}finally{syncing=false;}};
  return app;
}
