import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { deploymentBase } from './scripts/deployment-base.ts';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: deploymentBase(loadEnv(mode, process.cwd(), 'VITE_BASE_PATH').VITE_BASE_PATH),
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
}));
