import { loadEnvFile } from 'node:process';

/** Load ignored local operator configuration without evaluating it as shell code. */
export function loadLocalEnv(filePath = '.env.local') {
  try {
    loadEnvFile(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}
