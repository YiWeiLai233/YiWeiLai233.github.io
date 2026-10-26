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

export function getObservationHref(item: Pick<CollectionEntry<'observations'>, 'id'>) {
  return `/collections/${getEntrySlug(item.id)}/`;
}

export function getKindHref(kind: string) {
  return `/collections/#${kind}`;
}

export function getTagHref(tag: string) {
  return `/tags/${encodeURIComponent(tag)}/`;
}

export function sortPostsByDateDesc<T extends { data: { date: Date } }>(items: T[]) {
  return [...items].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** 观测收藏排序：进行中的优先，其次按日期倒序，让「最近在看的」浮到前面。 */
export function sortObservationsByDateDesc<
  T extends { data: { date: Date; status?: string } }
>(items: T[]) {
  return [...items].sort((a, b) => {
    const aActive = a.data.status === 'ongoing' ? 0 : 1;
    const bActive = b.data.status === 'ongoing' ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;

    return b.data.date.getTime() - a.data.date.getTime();
  });
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

/** 评分显示：整数原样，小数保留一位（8.5、9、7.8）。 */
export function formatRating(rating?: number) {
  if (rating === undefined) return '';
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
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
