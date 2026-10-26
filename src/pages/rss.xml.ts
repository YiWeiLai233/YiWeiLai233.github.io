import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { site } from '@/data/site';
import { getPostHref, sortPostsByDateDesc } from '@/lib/content';

export async function GET(context: APIContext) {
  const posts = sortPostsByDateDesc(await getCollection('posts', ({ data }) => !data.draft));

  return rss({
    title: `${site.name} · 开发日志`,
    description: '技术选择、问题排查、实现记录与阶段复盘。',
    site: context.site ?? site.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      pubDate: post.data.date,
      link: getPostHref(post),
      categories: [post.data.category, ...post.data.tags]
    })),
    customData: `<language>zh-CN</language>`,
    trailingSlash: true
  });
}
