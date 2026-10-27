import { createHash } from 'node:crypto';
import { validDate, today } from './data.mjs';
import { AppError, csvRecords, normalize, parseDate, parseCount } from './import.mjs';

export const POSTS_CSV_HEADER='post_id,data,titulo,formato,url,visualizacoes,alcance,curtidas,comentarios,salvamentos,compartilhamentos';
const COUNTS=['views','reach','likes','comments','saves','shares'];
const ALIASES={
  id:['postid','id','publicationid','reelid'],date:['data','date','dia','publishedat','publicationdate'],title:['titulo','title','conteudo','content','texto','text','caption','legenda'],format:['formato','format','type','tipo'],url:['url','link','permalink','posturl'],
  views:['views','visualizacoes','videoviews','reproducoes'],reach:['reach','alcance'],likes:['likes','curtidas','gostos'],comments:['comments','comentarios'],saves:['saves','salvamentos','saved','guardados'],shares:['shares','compartilhamentos','partilhas']
};
const FORMATS={reel:'Reel',reels:'Reel',video:'Reel',carrossel:'Carrossel',carousel:'Carrossel',carouselalbum:'Carrossel',stories:'Stories',story:'Stories',post:'Post',image:'Post',imagem:'Post',foto:'Post',photo:'Post'};
function instagramUrl(value,line){
  const text=String(value??'').trim();if(!text)return null;
  let url;try{url=new URL(text);}catch{throw new AppError(`Linha ${line}: URL de publicação inválida.`);}
  if(url.protocol!=='https:'||!['instagram.com','www.instagram.com','m.instagram.com'].includes(url.hostname)||url.username||url.password||url.port||!/^\/(p|reel|reels|stories)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?\/?$/.test(url.pathname))throw new AppError(`Linha ${line}: use um link HTTPS de publicação do Instagram, como https://www.instagram.com/p/CODIGO/.`);
  url.hostname='www.instagram.com';url.search='';url.hash='';url.pathname=url.pathname.replace(/\/?$/,'/');return url.toString();
}
export function parsePostsCSV(csv){
  const records=csvRecords(csv),header=Object.keys(records[0]),columns={};
  for(const[key,names]of Object.entries(ALIASES)){const found=header.filter(h=>names.includes(normalize(h)));if(found.length>1)throw new AppError(`Há mais de uma coluna para ${key}. Use apenas uma.`);columns[key]=found[0];}
  if(!columns.date||!columns.title||(!columns.id&&!columns.url)||!COUNTS.some(k=>columns[k]))throw new AppError('O CSV de publicações precisa de data, titulo, post_id (ou url) e pelo menos uma métrica. Baixe o modelo de publicações.');
  const seen=new Set();
  return records.map((r,i)=>{
    const line=i+2,rawDate=String(r[columns.date]??'').trim();
    const publishedAt=parseDate(rawDate);
    if(!validDate(publishedAt)||publishedAt>today())throw new AppError(`Linha ${line}: data inválida ou futura. Use AAAA-MM-DD ou DD/MM/AAAA.`);
    const title=String(r[columns.title]??'').trim();if(!title||title.length>1000)throw new AppError(`Linha ${line}: informe um título com até 1.000 caracteres.`);
    const postId=columns.id?String(r[columns.id]??'').trim():'';
    if(postId&&!/^[A-Za-z0-9._:-]{1,160}$/.test(postId))throw new AppError(`Linha ${line}: post_id inválido; use letras, números, ponto, hífen, sublinhado ou dois-pontos.`);
    const url=instagramUrl(columns.url?r[columns.url]:null,line);
    if(!postId&&!url)throw new AppError(`Linha ${line}: informe post_id ou um link do Instagram para identificar a publicação.`);
    const id=postId?`csv:${postId}`:`url:${createHash('sha256').update(url).digest('hex').slice(0,32)}`;
    if(seen.has(id))throw new AppError(`Linha ${line}: publicação duplicada no mesmo arquivo.`);seen.add(id);
    const inputFormat=String(columns.format?r[columns.format]:'').trim();
    const format=inputFormat?FORMATS[normalize(inputFormat)]:'Post';if(!format)throw new AppError(`Linha ${line}: formato inválido. Use Reel, Carrossel, Stories ou Post.`);
    const values=Object.fromEntries(COUNTS.map(k=>[k,columns[k]?parseCount(r[columns[k]],line,k):null]));
    if(COUNTS.every(k=>values[k]===null))throw new AppError(`Linha ${line}: informe pelo menos uma métrica.`);
    return {id,publishedAt,title,format,url,...values};
  });
}
export function savePosts(db,rows){
  const fields=['id','title','format','publishedAt',...COUNTS,'url','importedAt','source'];
  const insert=db.prepare(`INSERT INTO posts (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${fields.slice(1).map(k=>`${k}=excluded.${k}`).join(',')}`);
  const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
  try{for(const row of rows)insert.run(...fields.map(k=>k==='importedAt'?now:k==='source'?'metricool-csv':row[k]??null));db.prepare('INSERT INTO events (type,count,createdAt) VALUES (?,?,?)').run('metricool-posts-csv',rows.length,now);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return {type:'posts',count:rows.length,from:rows.map(r=>r.publishedAt).sort()[0],to:rows.map(r=>r.publishedAt).sort().at(-1),importedAt:now};
}
