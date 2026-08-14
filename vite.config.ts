import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  base: './', // 适配任意静态托管（Cloudflare Pages / GitHub Pages 子路径）
  build: {
    outDir: 'dist',
    target: 'es2020'
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts'] // 只收集 src 下的 vitest 用例（node 测试见 test/node，用 npm run test:node）
  }
})
