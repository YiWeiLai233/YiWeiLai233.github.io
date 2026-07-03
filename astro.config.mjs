import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';
import vue from '@astrojs/vue';

export default defineConfig({
  integrations: [
    mdx(),
    tailwind({
      applyBaseStyles: false
    }),
    vue()
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-light'
    }
  }
});
