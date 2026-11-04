import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages project site: https://andwaal.github.io/situasjonsplan-kart/
  base: command === 'build' ? '/situasjonsplan-kart/' : '/',
  plugins: [react()],
}));
