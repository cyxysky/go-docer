import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import mdx from '@mdx-js/rollup';
import ViteMonacoPlugin from 'vite-plugin-monaco-editor'
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    { enforce: 'pre', ...mdx({/* jsxImportSource: …, otherOptions… */ }) },
    react({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }),
    ViteMonacoPlugin({}),
    monacoEditorPlugin({
      languageWorkers: ['json', 'css', 'html', 'typescript'],
      // 打包地址
      customDistPath: () => './node_modules/monaco-editor/min/vs',
      // 路由前缀
      publicPath: 'monaco-editor',
    })],
  server: {
    proxy: {
      '/api/v1/ai/chat/': {
        target: 'http://localhost:3000/',
        changeOrigin: true,
        ws: true, // 支持WebSocket
      },
      '/api/v1/session': 'http://localhost:3000',
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true, // 支持WebSocket
      },
    },
    port: 8001,
    cors: true,
    hmr: {
      overlay: true,
      port: 8001,
    },
    host: 'localhost',
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
})
