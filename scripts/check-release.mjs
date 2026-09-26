// Explicit launch gate, not a deployment script. Only variable names are printed.
import { readFile } from 'node:fs/promises';
const app=JSON.parse(await readFile('app.json','utf8')).expo;
const failures=[];
const requireEnv=name=>{if(!process.env[name])failures.push(`Configure ${name}`);};
for(const name of ['EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_ANON_KEY','EXPO_PUBLIC_PRIVACY_POLICY_URL','EXPO_PUBLIC_SUPPORT_EMAIL'])requireEnv(name);
if(process.env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED!=='true')failures.push('Deploy and verify deletion service, then enable EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED');
if(!app.extra?.eas?.projectId)failures.push('Run authenticated eas init for your actual EAS project');
if(app.version!=='1.0.0')failures.push('Public version must remain 1.0.0');
if(!app.android?.versionCode || !app.ios?.buildNumber)failures.push('Set native build identifiers');
if(process.env.PROOFPILOT_LIVE_VERIFICATION_APPROVED!=='yes')failures.push('Complete live auth/RLS/email/deletion/AI tests and set PROOFPILOT_LIVE_VERIFICATION_APPROVED=yes in release CI');
if(process.env.PROOFPILOT_DEVICE_VERIFICATION_APPROVED!=='yes')failures.push('Complete signed real-device testing and set PROOFPILOT_DEVICE_VERIFICATION_APPROVED=yes in release CI');
if(failures.length){console.error('RELEASE BLOCKED:\n'+failures.map(v=>`- ${v}`).join('\n'));process.exitCode=1;}else console.log('Configuration gate passed; this does not replace release review or legal approval.');
