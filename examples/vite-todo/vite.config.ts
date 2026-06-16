import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { markable } from "@f12o/markable/vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/markable/" : "/",
  plugins: [
    vue(),
    markable({
      mode: "auto",
      commentsFile: ".markable/comments.json",
      endpoint: "/__markable/comments",
    }),
  ],
});
