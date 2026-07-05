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
