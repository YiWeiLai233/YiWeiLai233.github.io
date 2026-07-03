# Anime Developer Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first static Astro version of the anime-inspired developer personal site in `F:\anime-developer-blog`.

**Architecture:** Use Astro as the static site framework, Astro Content Collections for Markdown/MDX posts and projects, shared CSS tokens for a unified anime interface layer, and small Vue islands only for isolated interaction. The site is content-first: pages read from local content files and render static HTML by default.

**Tech Stack:** Astro, TypeScript, Tailwind CSS, MDX, Vue 3 islands, Markdown content collections.

---

## File Structure

Create and maintain these units:

```txt
F:\anime-developer-blog\
  package.json
  astro.config.mjs
  tsconfig.json
  tailwind.config.mjs
  postcss.config.cjs
  src\
    content\
      config.ts
      posts\
      projects\
    data\
      site.ts
    layouts\
      BaseLayout.astro
      ContentLayout.astro
    styles\
      theme.css
      global.css
    components\
      ui\
        Button.astro
        TagPill.astro
        ChapterHeading.astro
        ArchiveFrame.astro
        MascotBubble.astro
      layout\
        SiteHeader.astro
        SiteFooter.astro
        PageShell.astro
      feature\
        HeroSection.astro
        ProjectCard.astro
        PostCard.astro
        SkillPanel.astro
        CollectionCorner.astro
      islands\
        MascotTips.vue
    pages\
      index.astro
      projects\
        index.astro
      logs\
        index.astro
        [slug].astro
      about.astro
  public\
    assets\
      mascot-guide.svg
      desk-pattern.svg
```

## Task 1: Scaffold Astro Project

**Files:**
- Create: `F:\anime-developer-blog\package.json`
- Create: `F:\anime-developer-blog\astro.config.mjs`
- Create: `F:\anime-developer-blog\tsconfig.json`
- Create: `F:\anime-developer-blog\tailwind.config.mjs`
- Create: `F:\anime-developer-blog\postcss.config.cjs`
- Create: `F:\anime-developer-blog\src\env.d.ts`
- Create: `F:\anime-developer-blog\src\styles\global.css`

- [ ] **Step 1: Create `package.json` with scripts**

```json
{
  "name": "anime-developer-blog",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev --host 127.0.0.1",
    "build": "astro check && astro build",
    "preview": "astro preview --host 127.0.0.1",
    "check": "astro check"
  }
}
```

- [ ] **Step 2: Install runtime and build dependencies**

Run from `F:\anime-developer-blog`:

```powershell
npm install astro @astrojs/check @astrojs/mdx @astrojs/vue @astrojs/tailwind tailwindcss @tailwindcss/typography autoprefixer typescript vue
```

Expected: `node_modules` and `package-lock.json` are created.

- [ ] **Step 3: Create `astro.config.mjs`**

```js
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
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

- [ ] **Step 5: Create Tailwind and PostCSS config**

`tailwind.config.mjs`:

```js
import typography from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: [typography]
};
```

`postcss.config.cjs`:

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

- [ ] **Step 6: Create Astro env and global stylesheet**

`src\env.d.ts`:

```ts
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
```

`src\styles\global.css`:

```css
@import './theme.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

html {
  background: var(--color-bg);
  color: var(--color-text);
  scroll-behavior: smooth;
}

body {
  min-height: 100vh;
  margin: 0;
  font-family: var(--font-sans);
  background:
    radial-gradient(circle at top left, rgba(126, 191, 255, 0.18), transparent 34rem),
    radial-gradient(circle at top right, rgba(255, 177, 201, 0.18), transparent 30rem),
    var(--color-bg);
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 7: Run type check**

Run:

```powershell
npm run check
```

Expected: Astro check completes without TypeScript errors after dependencies install.

## Task 2: Add Design Tokens And Base Assets

**Files:**
- Create: `F:\anime-developer-blog\src\styles\theme.css`
- Create: `F:\anime-developer-blog\src\data\site.ts`
- Create: `F:\anime-developer-blog\public\assets\mascot-guide.svg`
- Create: `F:\anime-developer-blog\public\assets\desk-pattern.svg`

- [ ] **Step 1: Create `theme.css`**

```css
:root {
  --color-bg: #fff8f0;
  --color-surface: #ffffff;
  --color-paper: #fffdf8;
  --color-text: #25314a;
  --color-muted: #68738f;
  --color-line: #eadfce;
  --color-blue: #7ebfff;
  --color-pink: #ffb1c9;
  --color-gold: #e7b75f;
  --color-cyan: #77d7dd;
  --shadow-soft: 0 18px 45px rgba(64, 57, 45, 0.12);
  --shadow-card: 0 12px 28px rgba(64, 57, 45, 0.09);
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 22px;
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
}

.anime-frame {
  border: 1px solid var(--color-line);
  background: color-mix(in srgb, var(--color-paper) 92%, white);
  box-shadow: var(--shadow-card);
}
```

- [ ] **Step 2: Create site data**

`src\data\site.ts`:

```ts
export const site = {
  name: '开发书桌',
  nav: [
    { href: '/', label: '首页' },
    { href: '/projects/', label: '项目档案' },
    { href: '/logs/', label: '开发日志' },
    { href: '/about/', label: '站点档案' }
  ],
  hero: {
    title: '欢迎回来，今天要查看项目档案还是开发日志？',
    subtitle: '这里整理着我的开发项目、技术笔记、日常记录和一点二次元收藏。'
  }
} as const;
```

- [ ] **Step 3: Add simple SVG assets**

`public\assets\mascot-guide.svg` should be a lightweight original vector stand-in: a soft circular portrait frame, simple anime-style hair silhouette, and speech marker. Use SVG only as the first site-native asset until a final raster mascot is generated.

`public\assets\desk-pattern.svg` should be a subtle repeating pattern with notebook lines, small stars, and corner brackets.

- [ ] **Step 4: Verify asset paths**

Run:

```powershell
Test-Path .\public\assets\mascot-guide.svg
Test-Path .\public\assets\desk-pattern.svg
```

Expected: both commands output `True`.

## Task 3: Configure Content Collections

**Files:**
- Create: `F:\anime-developer-blog\src\content\config.ts`
- Create: `F:\anime-developer-blog\src\content\posts\first-log.md`
- Create: `F:\anime-developer-blog\src\content\posts\astro-static-site.md`
- Create: `F:\anime-developer-blog\src\content\projects\anime-blog.md`
- Create: `F:\anime-developer-blog\src\content\projects\dev-toolkit.md`

- [ ] **Step 1: Create collection schemas**

```ts
import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    category: z.string().default('开发日志'),
    draft: z.boolean().default(false)
  })
});

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    status: z.enum(['planning', 'building', 'released']),
    stack: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    repo: z.string().url().optional(),
    demo: z.string().url().optional()
  })
});

export const collections = { posts, projects };
```

- [ ] **Step 2: Add sample post files**

Create `first-log.md` with valid frontmatter:

```md
---
title: "第一条开发日志"
date: 2026-07-03
summary: "记录这个二次元开发者博客的起点，以及第一版想解决的问题。"
tags: ["Blog", "Astro", "Design"]
category: "开发日志"
draft: false
---

今天开始整理自己的个人站。第一版先做静态内容，把项目档案、开发日志和站点档案串起来。
```

Create `astro-static-site.md` with valid frontmatter:

```md
---
title: "为什么第一版选择 Astro 静态站"
date: 2026-07-03
summary: "用 Astro 和 Markdown/MDX 先把内容工作流跑通，再考虑后台。"
tags: ["Astro", "Markdown", "Static Site"]
category: "技术笔记"
draft: false
---

静态站的好处是简单、快、容易部署。内容先放在仓库里，用 Markdown 或 MDX 维护。
```

- [ ] **Step 3: Add sample project files**

Create `anime-blog.md` and `dev-toolkit.md` with status, stack, summary, and featured fields.

- [ ] **Step 4: Run content validation**

Run:

```powershell
npm run check
```

Expected: Content collection schemas pass and no frontmatter errors are reported.

## Task 4: Build Shared UI Components

**Files:**
- Create: `F:\anime-developer-blog\src\components\ui\Button.astro`
- Create: `F:\anime-developer-blog\src\components\ui\TagPill.astro`
- Create: `F:\anime-developer-blog\src\components\ui\ChapterHeading.astro`
- Create: `F:\anime-developer-blog\src\components\ui\ArchiveFrame.astro`
- Create: `F:\anime-developer-blog\src\components\ui\MascotBubble.astro`

- [ ] **Step 1: Implement `Button.astro`**

```astro
---
interface Props {
  href: string;
  variant?: 'primary' | 'secondary';
}

const { href, variant = 'primary' } = Astro.props;
---

<a class:list={['button', `button-${variant}`]} href={href}>
  <slot />
</a>

<style>
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 0.78rem 1.15rem;
    font-weight: 700;
    text-decoration: none;
    transition: transform 160ms ease, box-shadow 160ms ease;
  }
  .button:hover {
    transform: translateY(-2px);
  }
  .button-primary {
    background: var(--color-text);
    color: white;
    box-shadow: var(--shadow-card);
  }
  .button-secondary {
    border: 1px solid var(--color-line);
    background: var(--color-paper);
    color: var(--color-text);
  }
</style>
```

- [ ] **Step 2: Implement `TagPill.astro`**

```astro
---
interface Props {
  label: string;
}

const { label } = Astro.props;
---

<span class="tag-pill">{label}</span>

<style>
  .tag-pill {
    display: inline-flex;
    border: 1px solid color-mix(in srgb, var(--color-blue) 55%, var(--color-line));
    border-radius: 999px;
    padding: 0.25rem 0.55rem;
    background: color-mix(in srgb, var(--color-blue) 13%, white);
    color: var(--color-muted);
    font-size: 0.78rem;
    font-weight: 700;
  }
</style>
```

- [ ] **Step 3: Implement `ChapterHeading.astro`**

```astro
---
interface Props {
  chapter: string;
  title: string;
  subtitle?: string;
}

const { chapter, title, subtitle } = Astro.props;
---

<header class="chapter-heading">
  <span>{chapter}</span>
  <h2>{title}</h2>
  {subtitle && <p>{subtitle}</p>}
</header>

<style>
  .chapter-heading {
    display: grid;
    gap: 0.35rem;
    margin-bottom: 1.25rem;
  }
  .chapter-heading span {
    width: fit-content;
    border: 1px solid var(--color-line);
    border-radius: 999px;
    padding: 0.2rem 0.55rem;
    background: color-mix(in srgb, var(--color-pink) 16%, white);
    color: var(--color-muted);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .chapter-heading h2 {
    margin: 0;
    color: var(--color-text);
    font-size: clamp(1.7rem, 3vw, 2.35rem);
    line-height: 1.08;
  }
  .chapter-heading p {
    max-width: 42rem;
    margin: 0;
    color: var(--color-muted);
  }
</style>
```

- [ ] **Step 4: Implement `ArchiveFrame.astro`**

```astro
---
interface Props {
  label?: string;
}

const { label } = Astro.props;
---

<section class="archive-frame anime-frame">
  {label && <span class="archive-label">{label}</span>}
  <slot />
</section>

<style>
  .archive-frame {
    position: relative;
    border-radius: var(--radius-lg);
    padding: 1.2rem;
  }
  .archive-frame::before,
  .archive-frame::after {
    position: absolute;
    width: 1.1rem;
    height: 1.1rem;
    content: '';
    border-color: var(--color-blue);
  }
  .archive-frame::before {
    top: 0.65rem;
    left: 0.65rem;
    border-top: 2px solid;
    border-left: 2px solid;
  }
  .archive-frame::after {
    right: 0.65rem;
    bottom: 0.65rem;
    border-right: 2px solid;
    border-bottom: 2px solid;
  }
  .archive-label {
    display: inline-flex;
    margin-bottom: 0.8rem;
    color: var(--color-muted);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
  }
</style>
```

- [ ] **Step 5: Implement `MascotBubble.astro`**

```astro
---
interface Props {
  tone?: 'soft' | 'info';
}

const { tone = 'soft' } = Astro.props;
---

<aside class:list={['mascot-bubble', `mascot-bubble-${tone}`]}>
  <slot />
</aside>

<style>
  .mascot-bubble {
    position: relative;
    border: 1px solid var(--color-line);
    border-radius: 18px 18px 18px 6px;
    padding: 0.9rem 1rem;
    color: var(--color-text);
    font-weight: 600;
    box-shadow: var(--shadow-card);
  }
  .mascot-bubble-soft {
    background: color-mix(in srgb, var(--color-pink) 14%, white);
  }
  .mascot-bubble-info {
    background: color-mix(in srgb, var(--color-blue) 14%, white);
  }
</style>
```

- [ ] **Step 6: Run check**

Run:

```powershell
npm run check
```

Expected: Astro components compile without prop or syntax errors.

## Task 5: Build Layout Components

**Files:**
- Create: `F:\anime-developer-blog\src\layouts\BaseLayout.astro`
- Create: `F:\anime-developer-blog\src\layouts\ContentLayout.astro`
- Create: `F:\anime-developer-blog\src\components\layout\SiteHeader.astro`
- Create: `F:\anime-developer-blog\src\components\layout\SiteFooter.astro`
- Create: `F:\anime-developer-blog\src\components\layout\PageShell.astro`

- [ ] **Step 1: Implement `BaseLayout.astro`**

```astro
---
import '@/styles/global.css';
import SiteHeader from '@/components/layout/SiteHeader.astro';
import SiteFooter from '@/components/layout/SiteFooter.astro';

interface Props {
  title?: string;
  description?: string;
}

const {
  title = '开发书桌',
  description = '项目档案、开发日志和一点二次元收藏。'
} = Astro.props;
---

<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <title>{title}</title>
  </head>
  <body>
    <SiteHeader />
    <main>
      <slot />
    </main>
    <SiteFooter />
  </body>
</html>
```

- [ ] **Step 2: Implement `SiteHeader.astro`**

```astro
---
import { site } from '@/data/site';

const pathname = Astro.url.pathname;
---

<header class="site-header">
  <a class="brand" href="/">
    <span class="brand-dot"></span>
    <span>{site.name}</span>
  </a>
  <nav aria-label="主导航">
    {site.nav.map((item) => (
      <a class:list={{ active: pathname === item.href }} href={item.href}>
        {item.label}
      </a>
    ))}
  </nav>
</header>

<style>
  .site-header {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: min(1120px, calc(100% - 2rem));
    margin: 1rem auto;
    border: 1px solid var(--color-line);
    border-radius: 999px;
    padding: 0.7rem 0.85rem;
    background: color-mix(in srgb, var(--color-paper) 92%, white);
    box-shadow: var(--shadow-card);
  }
  .brand,
  nav a {
    color: var(--color-text);
    font-weight: 800;
    text-decoration: none;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .brand-dot {
    width: 0.72rem;
    height: 0.72rem;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--color-pink), var(--color-blue));
  }
  nav {
    display: flex;
    gap: 0.25rem;
  }
  nav a {
    border-radius: 999px;
    padding: 0.45rem 0.75rem;
    color: var(--color-muted);
  }
  nav a.active,
  nav a:hover {
    background: color-mix(in srgb, var(--color-blue) 16%, white);
    color: var(--color-text);
  }
</style>
```

- [ ] **Step 3: Implement `ContentLayout.astro`**

`ContentLayout` wraps article pages with a narrower reading width and calmer decoration.

- [ ] **Step 4: Verify base route**

Create `src/pages/index.astro` that uses `BaseLayout` and prints the hero title from `site.hero`.

Run:

```powershell
npm run build
```

Expected: Astro builds a static site into `dist`.

## Task 6: Build Feature Components

**Files:**
- Create: `F:\anime-developer-blog\src\components\feature\HeroSection.astro`
- Create: `F:\anime-developer-blog\src\components\feature\ProjectCard.astro`
- Create: `F:\anime-developer-blog\src\components\feature\PostCard.astro`
- Create: `F:\anime-developer-blog\src\components\feature\SkillPanel.astro`
- Create: `F:\anime-developer-blog\src\components\feature\CollectionCorner.astro`

- [ ] **Step 1: Build `HeroSection.astro`**

```astro
---
import Button from '@/components/ui/Button.astro';
import MascotBubble from '@/components/ui/MascotBubble.astro';
import { site } from '@/data/site';
---

<section class="hero">
  <div class="hero-copy">
    <p class="hero-label">Guide Menu / Developer Desk</p>
    <h1>{site.hero.title}</h1>
    <p class="subtitle">{site.hero.subtitle}</p>
    <div class="actions">
      <Button href="/projects/">项目档案</Button>
      <Button href="/logs/" variant="secondary">开发日志</Button>
    </div>
    <MascotBubble>我把最近的项目和日志都整理好了，先从这里开始吧。</MascotBubble>
  </div>
  <div class="hero-visual">
    <img src="/assets/mascot-guide.svg" alt="站点看板娘" />
  </div>
</section>

<style>
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(18rem, 0.95fr);
    align-items: center;
    gap: 2rem;
    width: min(1120px, calc(100% - 2rem));
    min-height: 70vh;
    margin: 0 auto;
    padding: 3rem 0 4rem;
  }
  .hero-label {
    width: fit-content;
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
    background: color-mix(in srgb, var(--color-pink) 18%, white);
    color: var(--color-muted);
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 800;
  }
  h1 {
    max-width: 46rem;
    margin: 1rem 0;
    color: var(--color-text);
    font-size: clamp(2.35rem, 6vw, 5rem);
    line-height: 1.02;
  }
  .subtitle {
    max-width: 39rem;
    color: var(--color-muted);
    font-size: 1.08rem;
    line-height: 1.8;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin: 1.5rem 0;
  }
  .hero-visual {
    border-radius: var(--radius-lg);
    background: linear-gradient(145deg, color-mix(in srgb, var(--color-blue) 16%, white), color-mix(in srgb, var(--color-pink) 18%, white));
    padding: 1rem;
    box-shadow: var(--shadow-soft);
  }
  .hero-visual img {
    display: block;
    width: 100%;
  }
  @media (max-width: 820px) {
    .hero {
      grid-template-columns: 1fr;
    }
  }
</style>
```

- [ ] **Step 2: Build `ProjectCard.astro`**

```astro
---
import TagPill from '@/components/ui/TagPill.astro';

interface Props {
  title: string;
  summary: string;
  status: 'planning' | 'building' | 'released';
  stack: string[];
  href: string;
}

const { title, summary, status, stack, href } = Astro.props;
const statusLabel = {
  planning: '构想中',
  building: '构建中',
  released: '已发布'
}[status];
---

<article class="project-card anime-frame">
  <div class="status">{statusLabel}</div>
  <h3><a href={href}>{title}</a></h3>
  <p>{summary}</p>
  <div class="stack">
    {stack.map((item) => <TagPill label={item} />)}
  </div>
</article>
```

- [ ] **Step 3: Build `PostCard.astro`**

```astro
---
import TagPill from '@/components/ui/TagPill.astro';

interface Props {
  title: string;
  summary: string;
  date: Date;
  tags: string[];
  href: string;
}

const { title, summary, date, tags, href } = Astro.props;
const dateText = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
---

<article class="post-card anime-frame">
  <time datetime={date.toISOString()}>{dateText}</time>
  <h3><a href={href}>{title}</a></h3>
  <p>{summary}</p>
  <div class="tags">
    {tags.map((tag) => <TagPill label={tag} />)}
  </div>
</article>
```

- [ ] **Step 4: Build secondary panels**

`SkillPanel.astro`:

```astro
<aside class="skill-panel anime-frame">
  <span>Ability Panel</span>
  <h3>当前能力面板</h3>
  <ul>
    <li>Astro / Static Site</li>
    <li>TypeScript / Frontend</li>
    <li>Markdown Writing</li>
  </ul>
</aside>
```

`CollectionCorner.astro`:

```astro
<aside class="collection-corner anime-frame">
  <span>Small Collection</span>
  <h3>小小收藏室</h3>
  <p>这里会放一些番剧、音乐、游戏和日常碎片，先作为站点里的轻量角落。</p>
</aside>
```

- [ ] **Step 5: Run component check**

Run:

```powershell
npm run check
```

Expected: all feature components type-check.

## Task 7: Build Pages

**Files:**
- Modify: `F:\anime-developer-blog\src\pages\index.astro`
- Create: `F:\anime-developer-blog\src\pages\projects\index.astro`
- Create: `F:\anime-developer-blog\src\pages\logs\index.astro`
- Create: `F:\anime-developer-blog\src\pages\logs\[slug].astro`
- Create: `F:\anime-developer-blog\src\pages\about.astro`

- [ ] **Step 1: Build home page**

Fetch featured projects and latest posts with `getCollection`. Render `HeroSection`, featured project cards, latest log cards, ability panel, and collection corner.

- [ ] **Step 2: Build projects page**

Fetch all projects, sort featured projects first, and render archive cards with stack tags and status badges.

- [ ] **Step 3: Build log list page**

Fetch non-draft posts, sort by date descending, and render log-entry cards.

- [ ] **Step 4: Build log detail route**

Use `getStaticPaths` for posts and render each Markdown/MDX body inside `ContentLayout`.

- [ ] **Step 5: Build about page**

Render profile summary, skills, contact links, mascot explanation, and small collection note.

- [ ] **Step 6: Build**

Run:

```powershell
npm run build
```

Expected: build succeeds and routes exist for `/`, `/projects/`, `/logs/`, `/logs/first-log/`, `/logs/astro-static-site/`, and `/about/`.

## Task 8: Add Small Vue Island

**Files:**
- Create: `F:\anime-developer-blog\src\components\islands\MascotTips.vue`
- Modify: `F:\anime-developer-blog\src\components\feature\HeroSection.astro`

- [ ] **Step 1: Create `MascotTips.vue`**

The component cycles through three short guide tips:

```ts
const tips = [
  '先看看项目档案，那里记录着正在构建的东西。',
  '开发日志里会放技术笔记和折腾记录。',
  '站点档案里能看到这个小站的设定和技术栈。'
];
```

- [ ] **Step 2: Mount as an Astro island**

In `HeroSection.astro`, render:

```astro
<MascotTips client:load />
```

- [ ] **Step 3: Build**

Run:

```powershell
npm run build
```

Expected: Vue integration bundles only the small island and static pages still build.

## Task 9: Visual QA And Cleanup

**Files:**
- Modify only files required to fix visible issues found during QA.

- [ ] **Step 1: Start dev server**

Run:

```powershell
npm run dev
```

Expected: local Astro dev server starts on `http://127.0.0.1:4321/` or the next available port.

- [ ] **Step 2: Browser verification**

Open home, projects, logs, one log detail, and about pages. Check desktop and mobile widths.

- [ ] **Step 3: Build verification**

Run:

```powershell
npm run build
```

Expected: `astro check` and `astro build` both pass.

- [ ] **Step 4: Final project review**

Confirm:

- anime interface layer is visible on the home, projects, logs, and about pages
- article detail page is calmer and readable
- content can be maintained by Markdown/MDX files
- no login, database, or backend code was introduced
- no copyrighted anime characters or real brand assets are used
