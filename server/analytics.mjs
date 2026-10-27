import { METRICS, demoMetrics, demoPosts, today, shiftDate } from './data.mjs';
const sum = (rows,key) => { const values=rows.map(r=>r[key]).filter(v=>v!==null&&v!==undefined);return values.length ? values.reduce((a,b)=>a+b,0) : null; };
const last = (rows,key)=>[...rows].reverse().find(r=>r[key]!==null&&r[key]!==undefined)?.[key]??null;
const ENGAGEMENT_FIELDS=['reach','likes','comments','saves','shares'];
const fieldsFor=key=>key==='engagement'?ENGAGEMENT_FIELDS:[key];
const complete=(rows,fields,days)=>rows.length===days&&rows.every(r=>fields.every(k=>r[k]!==null&&r[k]!==undefined));
function summaryValues(rows,days) {
  const reach=sum(rows,'reach'), interactions=['likes','comments','saves','shares'].map(k=>sum(rows,k));
  return {views:sum(rows,'views'),reach,likes:sum(rows,'likes'),engagement:reach>0&&complete(rows,ENGAGEMENT_FIELDS,days)?Math.round(interactions.reduce((a,b)=>a+b,0)/reach*10000)/100:null,followers:last(rows,'followers')};
}
export function dashboard(db,profile,{source,days}) {
  const end=today(), start=shiftDate(end,1-days), previousStart=shiftDate(start,-days);
  // A daily CSV can describe the whole profile; the API adapter describes Reels.
  // Never add those different scopes together. A CSV dataset has global priority.
  const hasCsv=!!db.prepare("SELECT 1 FROM metrics WHERE source='metricool-csv' LIMIT 1").get();
  const hasApi=!!db.prepare("SELECT 1 FROM metrics WHERE source='metricool-api' LIMIT 1").get();
  const liveSource=hasCsv||!hasApi?'metricool-csv':'metricool-api';
  const rows=source==='demo'?demoMetrics(end):db.prepare('SELECT * FROM metrics WHERE date>=? AND date<=? AND source=? ORDER BY date').all(previousStart,end,liveSource);
  const current=rows.filter(r=>r.date>=start&&r.date<=end), previous=rows.filter(r=>r.date>=previousStart&&r.date<start);
  const values=summaryValues(current,days),before=summaryValues(previous,days);
  const labels={views:'Visualizações',reach:'Alcance acumulado',likes:'Curtidas',engagement:'Engajamento',followers:'Seguidores'};
  const summary=Object.entries(values).map(([key,value])=>{
    const fields=fieldsFor(key),currentComplete=complete(current,fields,days),previousComplete=complete(previous,fields,days);
    return {key,label:labels[key],value,previous:previousComplete?before[key]:null,change:currentComplete&&previousComplete&&value!==null&&before[key]>0?Math.round((value-before[key])/before[key]*1000)/10:null,unit:key==='engagement'?'%':'number',coverage:{currentDays:current.filter(r=>fields.every(k=>r[k]!==null&&r[k]!==undefined)).length,previousDays:previous.filter(r=>fields.every(k=>r[k]!==null&&r[k]!==undefined)).length,expectedDays:days},comparisonComplete:currentComplete&&previousComplete};
  });
  const daily=Array.from({length:days},(_,i)=>{const date=shiftDate(start,i),r=current.find(r=>r.date===date);return r??Object.fromEntries([['date',date],...METRICS.map(k=>[k,null])]);});
  const posts=source==='demo'?demoPosts(end).filter(p=>p.publishedAt>=start):db.prepare('SELECT * FROM posts WHERE publishedAt>=? AND publishedAt<=? ORDER BY views DESC LIMIT 20').all(start,end).map(p=>({...p,engagement:p.reach>0&&ENGAGEMENT_FIELDS.every(k=>p[k]!==null&&p[k]!==undefined)?Math.round((p.likes+p.comments+p.saves+p.shares)/p.reach*1000)/10:null}));
  const lastEvent=db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 1').get();
  return {source,demo:source==='demo',profile,period:{days,start,end,previousStart,previousEnd:shiftDate(start,-1)},summary,stats:values,daily,posts,insights:insights(current,summary,posts,source,days),lastSync:source==='demo'?null:lastEvent?.createdAt??null,hasData:current.length>0,hasPostData:posts.length>0,dataDays:current.length,liveSource:source==='demo'?null:liveSource,coverage:source==='demo'?'Dados ilustrativos; não representam o perfil real':liveSource==='metricool-api'?'Reels do Instagram (API Metricool)':'Métricas diárias importadas do CSV',definitions:{reach:'Soma do alcance diário. A mesma pessoa pode ser contada em dias diferentes; não representa pessoas únicas no período.',engagement:'(curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance acumulado × 100. Só calculado com todos os campos preenchidos em todos os dias do período.',followers:'Último total de seguidores informado no período.',change:'Variação em relação ao período anterior de igual duração, calculada somente quando a métrica existe em todos os dias de ambos os períodos.',posts:'Totais acumulados por publicação no momento da importação, filtrados pela data em que o post foi publicado. Não são visualizações ocorridas apenas no período selecionado.',scope:'O CSV diário tem prioridade como conjunto de dados; métricas da API de Reels ficam fora da análise quando há CSV diário, pois os escopos são diferentes.'}};
}
function insights(rows,summary,posts,source,days) {
  if(!rows.length&&!posts.length)return [{id:'start',title:'Seu próximo passo: trazer os dados',description:'Importe um CSV do Metricool para receber análises do seu perfil. Nenhuma métrica real foi carregada.',priority:'action'}];
  const list=[];
  const view=summary.find(x=>x.key==='views');
  if(view.change!==null)list.push({id:'views',title:view.change>=0?`Visualizações cresceram ${view.change.toLocaleString('pt-BR')}%`:`Visualizações caíram ${Math.abs(view.change).toLocaleString('pt-BR')}%`,description:view.change>=0?'Compare os conteúdos com mais visualizações e teste novos ganchos no mesmo tema. O resultado do período não garante crescimento futuro.':'Revise os primeiros segundos dos Reels e compare frequência de publicação e temas com o período anterior.',priority:view.change>=0?'positive':'attention'});
  const reach=sum(rows,'reach'), saves=sum(rows,'saves');
  if(reach>0&&complete(rows,['reach','saves'],days))list.push({id:'saves',title:`${(saves/reach*100).toLocaleString('pt-BR',{maximumFractionDigits:1})} salvamentos a cada 100 contas alcançadas`,description:'Teste um checklist de obrigações ou um carrossel explicativo e convide a audiência a salvar. Compare o indicador na próxima semana.',priority:'action'});
  const best=posts.find(p=>p.views!==null&&p.views!==undefined);
  if(best)list.push({id:'best',title:`Dê uma continuação a “${best.title.slice(0,65)}”`,description:'Esse conteúdo lidera as visualizações acumuladas entre os posts disponíveis, publicados neste período. Experimente uma parte 2 e acompanhe retenção e compartilhamentos.',priority:'action'});
  list.push({id:'experiment',title:'Um teste simples para esta semana',description:'Publique um Reel respondendo uma dúvida comum de MEI. Use uma pergunta nos primeiros 3 segundos e compare as visualizações após 24 horas. Não há garantia de viralização.',priority:'action'});
  if(source==='demo')list.forEach(x=>x.description+=' Análise de dados demonstrativos.');
  return list.slice(0,4);
}
