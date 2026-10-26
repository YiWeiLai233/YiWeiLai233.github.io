import type { CollectionEntry } from 'astro:content';

export function getEntrySlug(id: string) {
  return id.replace(/\.(md|mdx)$/i, '');
}

export function getPostHref(post: Pick<CollectionEntry<'posts'>, 'id'>) {
  return `/logs/${getEntrySlug(post.id)}/`;
}

export function getProjectHref(project: Pick<CollectionEntry<'projects'>, 'id'>) {
  return `/projects/${getEntrySlug(project.id)}/`;
}

export function getTagHref(tag: string) {
  return `/tags/${encodeURIComponent(tag)}/`;
}

export function sortPostsByDateDesc<T extends { data: { date: Date } }>(items: T[]) {
  return [...items].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function sortProjectsByPriority<T extends { data: { featured?: boolean; title: string } }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.data.featured !== b.data.featured) {
      return Number(b.data.featured) - Number(a.data.featured);
    }

    return a.data.title.localeCompare(b.data.title, 'zh-CN');
  });
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

export function formatDateLong(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(date);
}

/** 估算阅读时长：中文按 350 字/分钟，英文按 200 词/分钟。 */
export function getReadingTime(body = '') {
  const cjkCount = (body.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latinWords = (body.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9_'-]+/g) ?? []).length;
  const minutes = Math.max(1, Math.round(cjkCount / 350 + latinWords / 200));

  return { minutes, cjkCount, latinWords };
}

/** 统计标签出现的篇数，按篇数降序。 */
export function collectTags<T extends { data: { tags: string[] } }>(items: T[]) {
  const counter = new Map<string, number>();

  for (const item of items) {
    for (const tag of item.data.tags) {
      counter.set(tag, (counter.get(tag) ?? 0) + 1);
    }
  }

  return [...counter.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
}
