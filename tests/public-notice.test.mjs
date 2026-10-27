import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
test('Pages publishes only a notice and contains no application or account files',()=>{
  execFileSync(process.execPath,['scripts/build-public-notice.mjs']);
  assert.deepEqual(readdirSync('dist-site').sort(),['.nojekyll','index.html','robots.txt']);
  const html=readFileSync('dist-site/index.html','utf8');
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes('não está disponível publicamente'));
  assert.doesNotMatch(html,/<script|camilajoare|7328068|5684647|Metricool|\.json|\/assets\//i);
});
