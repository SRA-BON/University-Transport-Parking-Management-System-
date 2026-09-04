import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
/**
 * Custom Vite plugin: Injects VITE_* env vars into the Firebase service worker.
 * Service workers are plain files in /public and cannot use import.meta.env,
 * so we replace __VITE_XXX__ placeholders with real values at dev/build time.
 */
function firebaseSwEnvPlugin(env) {
    var swSrcPath = path.resolve(__dirname, 'public/firebase-messaging-sw.js');
    var swOutPath = path.resolve(__dirname, 'public/firebase-messaging-sw.js');
    var injectEnv = function () {
        var content = fs.readFileSync(swSrcPath, 'utf-8');
        content = content.replace(/__VITE_(\w+)__/g, function (_, key) {
            return env["VITE_".concat(key)] || '';
        });
        fs.writeFileSync(swOutPath, content, 'utf-8');
    };
    return {
        name: 'firebase-sw-env',
        buildStart: function () { injectEnv(); },
        configureServer: function (server) {
            injectEnv();
            server.watcher.on('change', function (file) {
                if (file.endsWith('.env'))
                    injectEnv();
            });
        },
    };
}
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var port = Number(env.VITE_PORT) || 5173;
    var isProd = mode === 'production';
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
        build: {
            target: 'es2020',
            sourcemap: !isProd,
            cssCodeSplit: true,
            minify: isProd ? 'esbuild' : false,
            rollupOptions: {
                output: {
                    entryFileNames: isProd ? 'assets/[name]-[hash].js' : undefined,
                    chunkFileNames: isProd ? 'assets/[name]-[hash].js' : undefined,
                    assetFileNames: isProd ? 'assets/[name]-[hash][extname]' : undefined,
                },
            },
        },
    };
});
