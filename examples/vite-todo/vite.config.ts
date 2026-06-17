/// <reference types="vitest" />

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import jsx from '@vitejs/plugin-vue-jsx'
import { markable } from '@f12o/markable/vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/markable/vue-todo/' : '/',
  plugins: [
    vue(),
    jsx(),
    markable({
      mode: 'auto',
      commentsFile: '.markable/comments.json',
      endpoint: '/__markable/comments',
      issueRepo: 'f4ah6o/markable',
    }),
  ],
  test: {
    globals: true,
    environment: 'happy-dom',
  },
})
