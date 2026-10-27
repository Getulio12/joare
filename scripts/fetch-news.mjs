// Build-time RSS mirror. Public news only: this script never reads Metricool credentials.
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { fetchUolNews, safeUolUrl, UOL_NEWS_ERROR } from '../server/uol.mjs';

const destination = fileURLToPath(new URL('../public/news.json', import.meta.url));
let news;
try {
  news = await fetchUolNews();
  console.log(`UOL: ${news.articles.length} notícias públicas atualizadas em ${news.fetchedAt}.`);
} catch (error) {
  let cached;
  try { cached = JSON.parse(await readFile(destination, 'utf-8')); } catch { /* No successful feed retained. */ }
  if (!cached || !Array.isArray(cached.articles) || !cached.articles.length || !cached.articles.every(article => safeUolUrl(article.url)) || !Number.isFinite(Date.parse(cached.fetchedAt))) {
    console.error('Não foi possível obter o feed do UOL e não existe uma cópia anterior válida.');
    process.exitCode = 1;
  } else {
    // Keep the original fetch time: a failed refresh must never make old news look new.
    news = { ...cached, stale: true, error: UOL_NEWS_ERROR, refreshAttemptedAt: new Date().toISOString() };
    console.warn(`UOL indisponível; mantendo cópia pública de ${cached.fetchedAt}, sinalizada como desatualizada.`);
  }
}
if (news) {
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination + '.tmp', JSON.stringify(news, null, 2) + '\n', 'utf-8');
  await rename(destination + '.tmp', destination);
}
