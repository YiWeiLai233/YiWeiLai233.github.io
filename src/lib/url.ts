import { site } from '@/data/site';

export function absoluteUrl(pathname = '/') {
  return new URL(pathname, site.url).href;
}

/** 把当前请求路径规整成「带尾斜杠」的站内路径，用于 canonical / OG。 */
export function normalizePath(pathname: string) {
  if (pathname === '/' || pathname.endsWith('/')) {
    return pathname;
  }

  // 404.html 之类的页面不加尾斜杠
  if (/\.[a-z0-9]+$/i.test(pathname)) {
    return pathname;
  }

  return `${pathname}/`;
}
