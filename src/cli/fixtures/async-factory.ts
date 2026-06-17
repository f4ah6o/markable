import { defineConfig } from "vite";

export default defineConfig(async () => {
  const plugins = await loadPlugins();
  return {
    plugins,
  };
});

async function loadPlugins() {
  return [];
}
