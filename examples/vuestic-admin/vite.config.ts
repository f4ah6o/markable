import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'url'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { vuestic } from '@vuestic/compiler/vite'
import { markable } from '@f12o/markable/vite'

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages hosts the demos side by side under /markable/<example-id>/.
  base: process.env.GITHUB_ACTIONS ? '/markable/vuestic-admin/' : '/',
  build: {
    sourcemap: true,
  },
  plugins: [
    vuestic(),
    vue(),
    VueI18nPlugin({
      include: resolve(dirname(fileURLToPath(import.meta.url)), './src/i18n/locales/**'),
    }),
    markable({
      mode: 'auto',
      commentsFile: '.markable/comments.json',
      endpoint: '/__markable/comments',
      issueRepo: 'f4ah6o/markable',
    }),
  ],
})
