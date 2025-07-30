import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import ViteMonacoPlugin from 'vite-plugin-monaco-editor'
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ViteMonacoPlugin({}), monacoEditorPlugin({
    languageWorkers: ['json', 'css', 'html', 'typescript'],
    // 打包地址
    customDistPath: () => './node_modules/monaco-editor/min/vs',
    // 路由前缀
    publicPath: 'monaco-editor',
  })],
  server: {
    proxy: {
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
