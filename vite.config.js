import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        rollupOptions: {
            output: {
                // Preserve asset file structure
                assetFileNames: 'assets/[name][extname]'
            }
        }
    },
    publicDir: 'public',
    server: {
        port: 5173
    }
})

