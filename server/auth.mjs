import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const digest=value=>createHash('sha256').update(value,'utf8').digest();
const sessionKey=token=>digest(token).toString('hex');

/** Single-owner authentication. Sessions intentionally expire on server restart. */
export function createAuthentication({
  password=process.env.APP_PASSWORD??'',
  publicMode=process.env.PUBLIC_MODE==='true',
  allowedOrigin=process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL||'',
  now=()=>Date.now(),
  sessionTtlMs=12*60*60*1000,
  failedWindowMs=15*60*1000,
  maxFailedAttempts=8,
  maxSessions=500,
  maxLoginIps=1000,
}={}){
  if(typeof password!=='string')throw new Error('APP_PASSWORD deve ser uma senha de texto.');
  if(publicMode&&(password.length<16||new Set(password).size<6))throw new Error('PUBLIC_MODE=true exige APP_PASSWORD com pelo menos 16 caracteres e boa variedade. Configure uma senha aleatória no serviço de hospedagem.');
  if(allowedOrigin){
    let origin;try{origin=new URL(allowedOrigin);}catch{throw new Error('APP_ORIGIN deve ser a origem completa do site, como https://seu-site.example.');}
    if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||(publicMode&&origin.protocol!=='https:'))throw new Error('APP_ORIGIN deve conter somente protocolo HTTPS e domínio do site publicado.');
    allowedOrigin=origin.origin;
  }
  const required=password.length>0,expectedHash=digest(password);
  const sessions=new Map(),failedLogins=new Map();
  const cookieName=publicMode?'__Host-joare_session':'joare_session';
  const cleanup=()=>{
    const time=now();for(const [key,value]of sessions)if(value.expiresAt<=time)sessions.delete(key);
    for(const [key,value]of failedLogins)if(value.expiresAt<=time)failedLogins.delete(key);
  };
  const tokenFrom=req=>{
    const matches=String(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='));
    if(matches.length!==1)return null;const token=matches[0].slice(cookieName.length+1);
    return /^[A-Za-z0-9_-]{43}$/.test(token)?token:null;
  };
  const authenticated=req=>{
    if(!required)return true;cleanup();const token=tokenFrom(req);return !!(token&&sessions.has(sessionKey(token)));
  };
  const state=req=>({required,authenticated:authenticated(req)});
  const cookie=(value,maxAge)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${publicMode?'; Secure':''}`;
  const applyNoStore=res=>res.setHeader('Cache-Control','no-store');
  function register(app){
    // Do not trust X-Forwarded-For: a client may forge it. The socket address is
    // intentionally used even behind a proxy; its shared bucket is conservative.
    app.set('trust proxy',false);
    app.use('/api',(req,res,next)=>{applyNoStore(res);next();});
    app.get('/api/auth',(req,res)=>res.json(state(req)));
    app.post('/api/auth/login',(req,res)=>{
      cleanup();if(!required)return res.json(state(req));
      const address=req.socket.remoteAddress??'unknown',entry=failedLogins.get(address);
      if(entry&&entry.count>=maxFailedAttempts){res.setHeader('Retry-After',Math.max(1,Math.ceil((entry.expiresAt-now())/1000)));return res.status(429).json({error:'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'});}
      const supplied=req.body?.password,validType=typeof supplied==='string'&&supplied.length<=4096;
      const matches=timingSafeEqual(expectedHash,digest(validType?supplied:''));
      if(!validType||!matches){
        if(!entry&&failedLogins.size>=maxLoginIps)failedLogins.delete(failedLogins.keys().next().value);
        failedLogins.set(address,{count:(entry?.count??0)+1,expiresAt:entry?.expiresAt??now()+failedWindowMs});
        return res.status(401).json({error:'Senha incorreta.'});
      }
      failedLogins.delete(address);
      const old=tokenFrom(req);if(old)sessions.delete(sessionKey(old));
      if(sessions.size>=maxSessions)sessions.delete(sessions.keys().next().value);
      const token=randomBytes(32).toString('base64url');sessions.set(sessionKey(token),{expiresAt:now()+sessionTtlMs});
      res.setHeader('Set-Cookie',cookie(token,Math.floor(sessionTtlMs/1000)));
      res.json({required:true,authenticated:true});
    });
    app.post('/api/auth/logout',(req,res)=>{
      const token=tokenFrom(req);if(token)sessions.delete(sessionKey(token));
      res.setHeader('Set-Cookie',cookie('',0));res.json({required,authenticated:!required});
    });
    app.use('/api',(req,res,next)=>{
      if((req.path==='/health'||req.path==='/health/')&&['GET','HEAD'].includes(req.method))return next();
      if(!authenticated(req))return res.status(401).json({error:'Entre no painel para continuar.',required:true,authenticated:false});
      next();
    });
  }
  return {register,publicMode,allowedOrigin,required};
}
