import { parse } from 'csv-parse/sync';
import { METRICS, validDate, today } from './data.mjs';
export class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[\s_-]+/g,'');
const aliases={date:['data','date','dia'],views:['views','visualizacoes','videoviews','reproducoes'],reach:['reach','alcance'],likes:['likes','curtidas','gostos'],comments:['comments','comentarios'],saves:['saves','salvamentos','saved','guardados'],shares:['shares','compartilhamentos','partilhas'],followers:['followers','seguidores']};
function parseDate(v){const s=String(v).trim();const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:s;}
function number(v,line,key){
  const s=String(v??'').trim();if(!s)return null;
  const normalized=s.includes(',')?s.replace(/\./g,'').replace(',','.'):(/^\d{1,3}(?:\.\d{3})+$/.test(s)?s.replace(/\./g,''):s);
  const n=Number(normalized);if(!Number.isFinite(n)||n<0||!Number.isInteger(n)||n>Number.MAX_SAFE_INTEGER)throw new AppError(`Linha ${line}: ${key} precisa ser um número inteiro não negativo, sem separador de milhares.`);
  return n;
}
export function csvRecords(csv){
  if(typeof csv!=='string'||!csv.trim())throw new AppError('Envie o conteúdo de um arquivo CSV.');
  if(Buffer.byteLength(csv)>2_000_000)throw new AppError('O CSV deve ter no máximo 2 MB.');
  const first=csv.replace(/^\uFEFF/,'').split(/\r?\n/)[0];
  const delimiter=first.includes(';')?';':',';
  let records;try{records=parse(csv,{columns:true,bom:true,skip_empty_lines:true,trim:true,delimiter,relax_column_count:false});}catch{throw new AppError('CSV inválido. Confira o separador e o número de colunas; use o modelo disponível.');}
  if(!records.length||records.length>5000)throw new AppError('O CSV deve conter entre 1 e 5.000 linhas.');
  return records;
}
export function parseMetricCSV(csv){
  const records=csvRecords(csv);
  const header=Object.keys(records[0]),columns={};
  for(const [key,names] of Object.entries(aliases)){const found=header.filter(h=>names.includes(normalize(h)));if(found.length>1)throw new AppError(`Há mais de uma coluna para ${key}. Use apenas uma.`);columns[key]=found[0];}
  if(!columns.date||!METRICS.some(k=>columns[k]))throw new AppError('É necessária a coluna data e pelo menos uma métrica. Baixe o modelo para conferir os nomes aceitos.');
  const seen=new Set();
  return records.map((r,i)=>{
    const date=parseDate(r[columns.date]);if(!validDate(date))throw new AppError(`Linha ${i+2}: data inválida. Use AAAA-MM-DD ou DD/MM/AAAA.`);
    if(date>today())throw new AppError(`Linha ${i+2}: datas futuras não são aceitas.`);
    if(seen.has(date))throw new AppError(`Data duplicada: ${date}. O arquivo deve ter uma linha por dia.`);seen.add(date);
    const values=Object.fromEntries(METRICS.map(k=>[k,columns[k]?number(r[columns[k]],i+2,k):null]));
    if(METRICS.every(k=>values[k]===null))throw new AppError(`Linha ${i+2}: informe pelo menos uma métrica.`);
    return {date,...values};
  });
}
export function saveMetrics(db,rows,source){
  const insert=db.prepare(`INSERT INTO metrics (date,${METRICS.join(',')},source,imported_at) VALUES (${Array(10).fill('?').join(',')}) ON CONFLICT(date) DO UPDATE SET ${METRICS.map(k=>`${k}=excluded.${k}`).join(',')},source=excluded.source,imported_at=excluded.imported_at`);
  const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
  try{for(const row of rows)insert.run(row.date,...METRICS.map(k=>row[k]??null),source,now);db.prepare('INSERT INTO events (type,count,createdAt) VALUES (?,?,?)').run(source,rows.length,now);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return {count:rows.length,from:rows.map(r=>r.date).sort()[0],to:rows.map(r=>r.date).sort().at(-1),importedAt:now};
}
export const CSV_HEADER='data,visualizacoes,alcance,curtidas,comentarios,salvamentos,compartilhamentos,seguidores';

export {normalize, parseDate, number as parseCount};
