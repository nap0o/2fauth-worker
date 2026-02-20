import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0', // 兼容 Docker DevContainer
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787', // 你的 Hono 后端地址
        changeOrigin: true
      }
    }
  }
})