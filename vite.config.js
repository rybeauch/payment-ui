import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest) => {
            proxyRequest.removeHeader('origin')
          })
        },
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
        configure(proxy) {
          proxy.on('proxyReqWs', (proxyRequest) => {
            proxyRequest.removeHeader('origin')
          })
        },
      },
    },
  },
})
