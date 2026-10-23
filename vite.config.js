import { defineConfig } from 'vite';

// Relative asset URLs work at both / and /repository-name/ on GitHub Pages.
export default defineConfig({ base: './' });
