import GithubSlugger from 'github-slugger';

export interface TocItem {
  depth: number;
  text: string;
  slug: string;
}

/**
 * 从 Markdown/MDX 原文里提取 h2/h3 标题，生成与 Astro 渲染结果一致的锚点。
 * 代码块（``` 或 ~~~）内的 # 会被忽略。
 */
export function extractToc(body = '', minDepth = 2, maxDepth = 3): TocItem[] {
  const slugger = new GithubSlugger();
  const lines = body.split(/\r?\n/);
  const items: TocItem[] = [];
  let fence: string | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (fence === null) {
        fence = fenceMatch[1][0];
      } else if (fenceMatch[1][0] === fence) {
        fence = null;
      }
      continue;
    }

    if (fence !== null) {
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (!heading) {
      continue;
    }

    const depth = heading[1].length;
    // 始终让 slugger 走一遍，保证与全量标题的锚点编号一致
    const text = heading[2].replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
    const slug = slugger.slug(text);

    if (depth >= minDepth && depth <= maxDepth) {
      items.push({ depth, text, slug });
    }
  }

  return items;
}
