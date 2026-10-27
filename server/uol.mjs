import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';

export const UOL_FEED = 'https://rss.uol.com.br/feed/economia.xml';
export const UOL_NEWS_ERROR = 'Não foi possível atualizar o feed do UOL. As notícias já obtidas mantêm sua data original; os links do UOL continuam disponíveis.';
const ACCOUNTING_TERMS = /contab|tribut|imposto|receita federal|\bmei\b|reforma tribut|fiscal|simples nacional|\bcnpj\b|\bcbs\b|\bibs\b|\birpf\b/i;
const MONTHS = { jan:'Jan', fev:'Feb', mar:'Mar', abr:'Apr', mai:'May', jun:'Jun', jul:'Jul', ago:'Aug', set:'Sep', out:'Oct', nov:'Nov', dez:'Dec' };
const cleanText = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);

export function parseUolDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  // UOL uses Portuguese RFC-822 day/month names, which Date.parse does not accept.
  const normalized = value.trim().replace(/^[A-Za-zÀ-ÿ]{3,},\s*/, '').replace(/\b(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\b/gi, month => MONTHS[month.toLowerCase()]);
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function safeUolUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (url.hostname === 'uol.com.br' || url.hostname.endsWith('.uol.com.br'));
  } catch { return false; }
}

export function parseNews(xml) {
  if (typeof xml !== 'string' || xml.length > 5_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Formato de feed não suportado.');
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: true, trimValues: true }).parse(xml);
  let items = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  if (!Array.isArray(items)) items = [items];
  const seen = new Set();
  return items.map(item => {
    const url = typeof item.link === 'string' ? item.link : item.link?.['@_href'];
    const title = cleanText(item.title), description = cleanText(item.description ?? item.summary ?? '');
    return {
      id: createHash('sha256').update(String(url ?? '')).digest('hex').slice(0, 24),
      title, description, url,
      publishedAt: parseUolDate(item.pubDate ?? item.published ?? item.updated),
      source: 'UOL Economia',
      topic: ACCOUNTING_TERMS.test(title + ' ' + description) ? 'Contabilidade e tributos' : 'Contexto econômico',
    };
  }).filter(article => {
    if (!article.title || !safeUolUrl(article.url) || seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  }).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).slice(0, 30);
}

export async function readUolResponse(response) {
  if (!response.ok) throw new Error(`UOL respondeu HTTP ${response.status}`);
  // Response.text() assumes UTF-8, but the official feed declares ISO-8859-1.
  const contentType = response.headers?.get?.('content-type') ?? '';
  const charset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] ?? 'utf-8';
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 5_000_000) throw new Error('Feed excedeu o tamanho permitido.');
  const xml = new TextDecoder(charset).decode(bytes);
  const articles = parseNews(xml);
  if (!articles.length) throw new Error('O feed do UOL não forneceu notícias válidas.');
  return articles;
}

export async function fetchUolNews({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl(UOL_FEED, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'JoareStudio/1.0 (+public RSS reader)', Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  return {
    articles: await readUolResponse(response),
    fetchedAt: new Date().toISOString(),
    stale: false,
    error: null,
    source: 'UOL Economia',
    feedUrl: UOL_FEED,
  };
}
