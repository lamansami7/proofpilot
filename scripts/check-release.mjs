import { readFile } from 'node:fs/promises';
import { loadLocalEnv } from './load-local-env.mjs';
import { releaseFailures } from './release-config.mjs';
loadLocalEnv();
const app = JSON.parse(await readFile('app.json','utf8')).expo;
const failures = releaseFailures(app, process.env);
if (failures.length) {
  console.error('RELEASE BLOCKED:\n' + failures.map(value => `- ${value}`).join('\n'));
  process.exitCode = 1;
} else console.log('Configuration syntax gate passed; ownership, deployment and recorded approvals still require review.');
