import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

/**
 * Custom Vite plugin: Injects VITE_* env vars into the Firebase service worker.
 * Service workers are plain files in /public and cannot use import.meta.env,
 * so we replace __VITE_XXX__ placeholders with real values at dev/build time.
 */
function firebaseSwEnvPlugin(env: Record<string, string>) {
  const swSrcPath = path.resolve(__dirname, 'public/firebase-messaging-sw.js');
  const swOutPath = path.resolve(__dirname, 'public/firebase-messaging-sw.js');

  const injectEnv = () => {
    let content = fs.readFileSync(swSrcPath, 'utf-8');
    content = content.replace(/__VITE_(\w+)__/g, (_, key) => {
      return env[`VITE_${key}`] || '';
    });
    fs.writeFileSync(swOutPath, content, 'utf-8');
  };

  return {
    name: 'firebase-sw-env',
    buildStart() { injectEnv(); },
    configureServer(server: any) {
      injectEnv();
      server.watcher.on('change', (file: string) => {
        if (file.endsWith('.env')) injectEnv();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.VITE_PORT) || 5173;

  return {
    plugins: [react(), firebaseSwEnvPlugin(env)],
    server: {
      port: port,
      strictPort: false,
      host: true,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: port,
      strictPort: false,
      host: true,
    },
  };
});
