import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Both tsx source and compiled backend/dist resolve the same persistent paths.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const backendDir = path.basename(moduleDir) === 'dist' ? path.dirname(moduleDir) : moduleDir;
export const projectDir = path.dirname(backendDir);
export function runtimePaths(env: NodeJS.ProcessEnv = process.env) {
  return {
    uploads: path.resolve(backendDir, env.UPLOAD_DIR || 'uploads'),
    frontend: path.resolve(projectDir, env.FRONTEND_DIST_DIR || 'dist'),
  };
}
