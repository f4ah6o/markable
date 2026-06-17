import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { markable } from "@f12o/markable/vite";

export default defineConfig({
  plugins: [markable(), react()],
});
