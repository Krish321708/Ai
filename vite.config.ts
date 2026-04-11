import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.HF_TOKEN': JSON.stringify(env.HF_TOKEN),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
  };
});
