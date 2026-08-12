import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var port = Number(env.VITE_PORT) || 5173;
    return {
        plugins: [react()],
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
