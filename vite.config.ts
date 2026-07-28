import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'module';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

const pkg = createRequire(import.meta.url)('./package.json');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // Stamped onto every saved graph so a record always says which build
      // produced it. Single source of truth is package.json.
      __APP_VERSION__: JSON.stringify(pkg.version),
      // Backend endpoint baked into the build, so no user ever types a URL.
      // Override per build with ESS_SERVER_URL (an enterprise deployment, or a
      // staging build). Consumed only by src/lib/config/serverConfig.ts.
      __SYNC_SERVER_URL__: JSON.stringify(
        env.ESS_SERVER_URL || 'https://ess-graph-repository.rotha2002-edu.workers.dev',
      ),
      global: 'window',
    },
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, './src') },
        { find: /^plotly\.js$/, replacement: 'plotly.js/dist/plotly.js' }
      ]
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
