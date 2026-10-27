import { getCache, setCache, today, shiftDate, METRICS, validDate } from './data.mjs';
import { AppError, saveMetrics } from './import.mjs';
import { UOL_FEED, UOL_NEWS_ERROR, fetchUolNews } from './uol.mjs';
export { UOL_FEED, parseNews } from './uol.mjs';

export async function getNews(db,{refresh=false,fetchImpl=fetch}={}){
  const cached=getCache(db,'uol-news');
  if(!refresh&&cached&&Date.now()-Date.parse(cached.updatedAt)<30*60_000)return {...cached.value,fetchedAt:cached.updatedAt,stale:false,error:null};
  try{
    const fresh=await fetchUolNews({fetchImpl});
    const value={articles:fresh.articles,feedUrl:UOL_FEED,source:'UOL Economia'};setCache(db,'uol-news',value);
    return {...value,fetchedAt:fresh.fetchedAt,stale:false,error:null};
  }catch{
    return {articles:cached?.value?.articles??[],feedUrl:UOL_FEED,source:'UOL Economia',fetchedAt:cached?.updatedAt??null,stale:true,error:UOL_NEWS_ERROR};
  }
}
export function metricoolConfig(settings){
  return {token:process.env.METRICOOL_TOKEN??'',userId:process.env.METRICOOL_USER_ID||settings.metricoolUserId,blogId:process.env.METRICOOL_BLOG_ID||settings.metricoolBlogId};
}
export function metricoolStatus(settings){const c=metricoolConfig(settings);return {configured:!!(c.token&&c.userId&&c.blogId),hasToken:!!c.token,hasUserId:!!c.userId,hasBlogId:!!c.blogId,scope:'Reels do Instagram',note:'API opcional, sujeita a acesso no seu plano e à compatibilidade da resposta. CSV é o caminho recomendado.'};}
function extractTimeline(payload){
  const list=payload?.data;
  if(!Array.isArray(list)||list.length>1)throw new Error('Formato de resposta não reconhecido.');
  const values=list.flatMap(row=>Array.isArray(row.values)?row.values:[]);
  if(!values.length&&list.length&&list.some(x=>!Array.isArray(x.values)))throw new Error('Formato da série não reconhecido.');
  return values.map(v=>{const date=String(v.dateTime??v.date??'').slice(0,10);const value=Number(v.value);if(!validDate(date)||v.value===null||v.value===''||!Number.isSafeInteger(value)||value<0)throw new Error('Valor inválido na série recebida.');return {date,value};});
}
export async function syncMetricool(db,settings,{fetchImpl=fetch}={}){
  const c=metricoolConfig(settings);if(!c.token||!c.userId||!c.blogId)throw new AppError('Configure METRICOOL_TOKEN, METRICOOL_USER_ID e METRICOOL_BLOG_ID no arquivo .env do servidor, ou importe um CSV do Metricool.',409);
  const end=today(),start=shiftDate(end,-89);
  const fetchSeries=async metric=>{
    const url=new URL('https://app.metricool.com/api/v2/analytics/timelines');
    for(const [k,v] of Object.entries({userId:c.userId,blogId:c.blogId,network:'instagram',subject:'reels',metric,timezone:'America/Fortaleza',from:`${start}T00:00:00`,to:`${end}T23:59:59`}))url.searchParams.set(k,v);
    const response=await fetchImpl(url,{headers:{'X-Mc-Auth':c.token,'Accept':'application/json'},signal:AbortSignal.timeout(20_000)});
    if(!response.ok)throw new Error(response.status===401||response.status===403?'Acesso à API recusado. Confira credenciais, plano e permissão de rede.':`Metricool respondeu HTTP ${response.status}.`);
    return extractTimeline(await response.json());
  };
  let views;try{views=await fetchSeries('videoviews');}catch(e){throw new AppError(`Não foi possível sincronizar: ${e.message} O CSV continua disponível.`,502);}
  if(!views.length)throw new AppError('O Metricool não retornou visualizações de Reels neste período. Confira a marca conectada; nenhum dado foi criado.',422);
  const map=new Map();for(const v of views)if(v.date>=start&&v.date<=end)map.set(v.date,{date:v.date,...Object.fromEntries(METRICS.map(k=>[k,null])),views:v.value});
  if(!map.size)throw new AppError('O Metricool não retornou dados válidos dentro do período solicitado.',422);
  const warnings=[];
  if(db.prepare("SELECT 1 FROM metrics WHERE source='metricool-csv' LIMIT 1").get())warnings.push('O conjunto CSV diário tem prioridade no painel. As métricas da API de Reels não serão somadas ao perfil, pois os escopos são diferentes.');
  for(const [metric,column]of [['reach','reach'],['shares','shares']]){
    try{for(const v of await fetchSeries(metric))if(map.has(v.date))map.get(v.date)[column]=v.value;}catch{warnings.push(`Não foi possível obter ${column==='reach'?'alcance':'compartilhamentos'}; esse campo permanece sem dado.`);}
  }
  // CSV has priority: it may contain the complete profile, while this adapter measures Reels only.
  const rows=[...map.values()].filter(r=>db.prepare('SELECT source FROM metrics WHERE date=?').get(r.date)?.source!=='metricool-csv');
  if(!rows.length)return {count:0,skipped:map.size,warnings:['As datas recebidas já têm dados de CSV. O CSV tem prioridade e foi preservado.'],coverage:'Reels do Instagram'};
  return {...saveMetrics(db,rows,'metricool-api'),skipped:map.size-rows.length,warnings,coverage:'Reels do Instagram'};
}
