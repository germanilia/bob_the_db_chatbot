import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    base: '/',
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: true,
        open: false,
        watch: {
            usePolling: true
        },
        proxy: {
            '/api': {
                target: 'http://backend:8000',
                changeOrigin: true
            }
        }
    },
    build: {
        sourcemap: true,
        outDir: 'dist',
        emptyOutDir: true
    }
})
