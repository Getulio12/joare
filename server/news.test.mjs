import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNews, parseUolDate, readUolResponse, fetchUolNews, safeUolUrl, UOL_FEED } from './uol.mjs';

const sample = '<rss><channel><item><title>Tributação e emissão de nota fiscal</title><link>https://economia.uol.com.br/noticias/2026/10/27/tributacao.htm</link><description>Uma notícia de contabilidade &amp; gestão</description><pubDate>Ter, 27 Out 2026 09:07:51 -0200</pubDate></item></channel></rss>';

test('official UOL Portuguese dates preserve their source timezone', () => {
  assert.equal(parseUolDate('Ter, 27 Out 2026 09:07:51 -0200'), '2026-10-27T11:07:51.000Z');
  assert.equal(parseUolDate('Seg, 23 Fev 2026 08:00:00 -0300'), '2026-02-23T11:00:00.000Z');
  assert.equal(parseUolDate('Sun, 01 Mar 2026 09:00:00 GMT'), '2026-03-01T09:00:00.000Z');
  assert.equal(parseUolDate(null), null);
  assert.equal(parseUolDate('not a date'), null);
});

test('UOL ISO-8859-1 bytes decode correctly with source date and accounting category', async () => {
  const response = new Response(Buffer.from(sample, 'latin1'), { headers: { 'content-type': 'text/xml;charset=ISO-8859-1' } });
  const articles = await readUolResponse(response);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, 'Tributação e emissão de nota fiscal');
  assert.equal(articles[0].description, 'Uma notícia de contabilidade & gestão');
  assert.equal(articles[0].publishedAt, '2026-10-27T11:07:51.000Z');
  assert.equal(articles[0].topic, 'Contabilidade e tributos');
});

test('only HTTPS UOL links survive, links deduplicate, and XML entity declarations reject', () => {
  const item = url => `<item><title>Economia</title><link>${url}</link></item>`;
  const articles = parseNews(`<rss><channel>${item('https://economia.uol.com.br/a')}${item('https://economia.uol.com.br/a')}${item('https://uol.com.br.evil.example/a')}${item('https://evil.example/a')}${item('http://economia.uol.com.br/a')}${item('https://name:pass@economia.uol.com.br/a')}</channel></rss>`);
  assert.equal(articles.length, 1);
  assert.equal(safeUolUrl('https://economia.uol.com.br:1234/a'), false);
  assert.throws(() => parseNews('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>'));
});

test('a successful refresh exposes the exact official feed and rejects a failed or empty response', async () => {
  let called;
  const data = await fetchUolNews({fetchImpl: async url => { called = url; return new Response(Buffer.from(sample, 'latin1'), { headers: {'content-type':'text/xml;charset=ISO-8859-1'} }); }});
  assert.equal(called, UOL_FEED);
  assert.equal(data.stale, false);
  assert.equal(data.error, null);
  assert.equal(data.articles.length, 1);
  assert.ok(Number.isFinite(Date.parse(data.fetchedAt)));
  await assert.rejects(fetchUolNews({fetchImpl: async () => new Response('blocked', {status:403})}), /403/);
  await assert.rejects(readUolResponse(new Response('<rss><channel/></rss>')), /notícias válidas/);
});
