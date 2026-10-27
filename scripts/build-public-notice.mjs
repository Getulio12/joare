import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Fail closed: the Pages artifact contains no dashboard, JavaScript or account data.
const out=resolve('dist-site');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Acesso indisponível</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:28px;background:#0d100c;color:#e9e6dc;font:15px/1.8 system-ui,sans-serif}main{max-width:480px;padding:38px;border:1px solid #50472e;border-radius:12px;background:#171a13}span{font-size:12px;letter-spacing:2px;color:#d9bd7d}h1{font-size:28px;font-weight:500;letter-spacing:-1px;margin:16px 0}p{color:#a8af9d;margin:0}</style></head><body><main><span>ACESSO INDISPONÍVEL</span><h1>Este painel não está disponível publicamente.</h1><p>O acesso público foi retirado. Nenhum relatório ou dado privado está disponível nesta página.</p></main></body></html>`;
writeFileSync(resolve(out,'index.html'),html);
writeFileSync(resolve(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
writeFileSync(resolve(out,'.nojekyll'),'');
console.log('Página pública sem painel, código de aplicação ou dados de conta gerada.');
