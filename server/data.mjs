import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const METRICS = ['views', 'reach', 'likes', 'comments', 'saves', 'shares', 'followers'];
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS metrics (date TEXT PRIMARY KEY, views REAL, reach REAL, likes REAL, comments REAL, saves REAL, shares REAL, followers REAL, source TEXT NOT NULL, imported_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, title TEXT, format TEXT, publishedAt TEXT, views REAL, likes REAL, comments REAL, saves REAL, shares REAL, reach REAL, url TEXT, importedAt TEXT, source TEXT NOT NULL DEFAULT 'metricool-csv');
    CREATE TABLE IF NOT EXISTS ideas (id TEXT PRIMARY KEY, title TEXT NOT NULL, format TEXT NOT NULL, pillar TEXT NOT NULL, hook TEXT NOT NULL, caption TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idea', date TEXT, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, type TEXT NOT NULL, count INTEGER NOT NULL, createdAt TEXT NOT NULL);
  `);
  const postColumns=db.prepare('PRAGMA table_info(posts)').all().map(x=>x.name);
  if(!postColumns.includes('importedAt'))db.exec('ALTER TABLE posts ADD COLUMN importedAt TEXT');
  if(!postColumns.includes('source'))db.exec("ALTER TABLE posts ADD COLUMN source TEXT NOT NULL DEFAULT 'metricool-csv'");
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  for (const [key,value] of Object.entries({ name: 'Camila Joare', handle: 'camilajoare', goal: 'Criar conteúdo útil e aumentar as visualizações', metricoolUserId: '', metricoolBlogId: '' })) insert.run(key, value);
  if (!db.prepare('SELECT 1 FROM ideas LIMIT 1').get()) {
    const seed = db.prepare('INSERT INTO ideas (id,title,format,pillar,hook,caption,status,date,createdAt) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const [i, idea] of INITIAL_IDEAS.entries()) seed.run(`idea-${i+1}`, idea.title, idea.format, idea.pillar, idea.hook, idea.caption, 'idea', null, new Date().toISOString());
  }
  return db;
}
export function getSettings(db) { return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(x => [x.key,x.value])); }
export function setSettings(db, data) {
  const set = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [key,value] of Object.entries(data)) set.run(key, value);
  return getSettings(db);
}
export function getCache(db,key) { const r = db.prepare('SELECT * FROM cache WHERE key=?').get(key); return r ? {...r, value:JSON.parse(r.value)} : null; }
export function setCache(db,key,value) { db.prepare('INSERT INTO cache (key,value,updatedAt) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt').run(key,JSON.stringify(value),new Date().toISOString()); }
export function today(now=new Date()) { return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function shiftDate(date,n) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
}
const INITIAL_IDEAS = [
  {title:'Seu MEI está em dia? Confira estes 5 pontos',format:'Carrossel',pillar:'MEI',hook:'Você trabalha por conta própria? Salve esta lista antes de fechar o mês.',caption:'Checklist do MEI: acompanhe pagamentos do DAS, organização das notas fiscais, limite de faturamento aplicável, declaração anual e atividades permitidas. Consulte os valores e regras vigentes no Portal do Empreendedor. Salve para revisar com seu contador. #MEI #Contabilidade #Empreendedorismo'},
  {title:'Misturar contas pessoais e da empresa custa caro',format:'Reel',pillar:'Gestão financeira',hook:'O dinheiro da sua empresa não é a sua carteira. Aqui está o porquê.',caption:'Separar finanças pessoais e empresariais ajuda a enxergar o resultado, planejar o pró-labore e evitar decisões no escuro. Comece com contas separadas e um registro de entradas e saídas. Qual sua maior dificuldade? #GestaoFinanceira #Contabilidade'},
  {title:'3 dúvidas sobre a reforma tributária para levar ao contador',format:'Carrossel',pillar:'Tributação',hook:'A reforma muda tudo de uma vez? Antes de compartilhar, entenda a transição.',caption:'Pergunte ao seu contador como as etapas da reforma tributária afetam o seu setor, quais obrigações precisam de adaptação e onde acompanhar as regras oficiais. Datas e procedimentos devem ser conferidos na Receita Federal e no Ministério da Fazenda. #ReformaTributaria #Contabilidade'},
  {title:'Faturamento alto não é sinônimo de lucro',format:'Reel',pillar:'Gestão financeira',hook:'Você vende muito, mas o dinheiro some? Vamos olhar três números.',caption:'Faturamento, custos e despesas contam histórias diferentes. Acompanhe sua margem e seu fluxo de caixa antes de tomar decisões. Exemplo educativo: confirme a análise com um profissional que conheça sua empresa. #FluxoDeCaixa #Empreender'},
  {title:'Documentos que facilitam sua declaração de IR',format:'Carrossel',pillar:'Imposto de Renda',hook:'Não deixe para procurar esses documentos na última semana.',caption:'Organize informes de rendimentos, comprovantes de despesas permitidas, posição de bens e direitos e documentos de operações do ano. Regras e prazos variam por exercício: confira a Receita Federal. Salve esta organização para o próximo período. #ImpostoDeRenda #OrganizacaoFinanceira'},
  {title:'Bastidores: como organizo o fechamento do mês',format:'Stories',pillar:'Bastidores',hook:'Um minuto nos bastidores da contabilidade: venha organizar o mês comigo.',caption:'Mostre seu processo sem expor dados de clientes: organização de documentos, conciliação e revisão. Use uma enquete: qual etapa você mais adia? #RotinaContabil #Contabilidade'},
  {title:'Preciso emitir nota fiscal em toda venda?',format:'Reel',pillar:'MEI',hook:'A resposta depende da operação. Veja o que conferir antes de emitir.',caption:'As regras de emissão variam conforme atividade, destinatário, estado ou município e enquadramento. Consulte o portal oficial aplicável e seu contador antes de usar uma regra geral. Envie sua dúvida sem compartilhar dados pessoais. #NotaFiscal #MEI'},
  {title:'O que perguntar antes de abrir uma empresa',format:'Carrossel',pillar:'Empreendedorismo',hook:'Antes do CNPJ, responda estas perguntas.',caption:'Qual será a atividade? Quem são os sócios? Qual a projeção de faturamento? Quais custos e obrigações precisam entrar no planejamento? Uma conversa contábil no início evita improvisos. #AbrirEmpresa #Empreender'}
];

export function demoMetrics(end=today()) {
  let cumulative = 4380;
  return Array.from({length:180},(_,i)=> {
    const wave = Math.sin(i*.79)*540 + Math.cos(i*.23)*280;
    const views = Math.round(1050+i*16+wave+(i%7===3?1800:0));
    cumulative += 8 + i%17;
    return {date:shiftDate(end,i-179), views,reach:Math.round(views*.72),likes:Math.round(views*(.042+(i%4)*.002)),comments:8+i%21,saves:22+i%48,shares:18+i%40,followers:cumulative,source:'demo'};
  });
}
export function demoPosts(end=today()) {
  return [
    ['MEI: 5 erros que você pode evitar','Reel',18420,927,67,198,142],
    ['Faturamento não é lucro','Carrossel',11280,612,42,284,96],
    ['Sua empresa e seu dinheiro pessoal','Reel',9740,483,31,116,84],
    ['Checklist do fechamento do mês','Carrossel',8320,397,28,203,65],
    ['Um dia na contabilidade','Stories',4290,184,16,42,28]
  ].map(([title,format,views,likes,comments,saves,shares],i)=>({id:`demo-post-${i}`,title,format,views,likes,comments,saves,shares,publishedAt:shiftDate(end,-i*3-1),reach:Math.round(views*.72),engagement:Math.round((likes+comments+saves+shares)/Math.round(views*.72)*1000)/10,url:null}));
}
