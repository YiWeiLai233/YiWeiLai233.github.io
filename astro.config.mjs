import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import vue from '@astrojs/vue';

export default defineConfig({
  // 站点最终地址：<username>.github.io 用户站，根路径部署。
  site: 'https://yiweilai233.github.io',
  trailingSlash: 'always',
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.includes('/404')
    }),
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
