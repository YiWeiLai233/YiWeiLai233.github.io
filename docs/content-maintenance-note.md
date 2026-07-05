# 未来观测站内容维护笔记

项目目录：`F:\anime-developer-blog`

这个站点目前采用静态维护方式，不设置登录后台。日常维护就是修改项目里的内容文件，然后本地预览、构建、发布。

## 常用命令

进入项目目录：

```powershell
cd F:\anime-developer-blog
```

本地预览：

```powershell
npm run dev -- --port 4322
```

构建检查：

```powershell
npm run build
```

修改内容后，建议先本地预览，再运行构建检查。

## 修改站点基础信息

文件：`src/data/site.ts`

这里维护站点名称、站主昵称、导航菜单和首页主介绍。

适合修改：

- 站点名称
- 昵称
- 导航文字
- 首页主标题
- 首页主介绍

## 修改观测收藏卡片

文件：`src/data/observations.ts`

这里维护番剧、游戏、音乐、日常碎片等收藏卡片。首页和观测收藏页共用这份数据。

每张卡片主要字段：

```ts
{
  kind: 'anime',
  title: '番剧观测席',
  subtitle: '记录想补、正在看和值得回味的作品',
  status: '观测中',
  description: '收纳轻松向、日常向和适合休息时观看的作品，并记录角色、片段与观后感。',
  tags: ['番剧', '补番', '观后感'],
  image: '/assets/chibi-wave.png',
  accent: 'pink'
}
```

常用修改方式：

- `title`：卡片标题
- `subtitle`：卡片副标题
- `status`：右上角状态
- `description`：正文介绍
- `tags`：标签
- `image`：卡片上的 Q 版角色图
- `accent`：卡片颜色，可用 `blue`、`pink`、`cyan`、`gold`

## 新增开发日志

目录：`src/content/posts`

新增一篇文章时，在这个目录里新建一个 `.md` 文件。文件名建议使用英文小写和短横线，例如：

```text
my-first-note.md
astro-layout-review.md
```

文章模板：

```md
---
title: "文章标题"
date: 2026-07-05
summary: "文章列表里显示的简介。"
tags: ["Astro", "博客"]
category: "开发日志"
draft: false
---

这里写正文内容。
```

字段说明：

- `title`：文章标题
- `date`：发布日期
- `summary`：文章列表和详情页顶部使用的简介
- `tags`：文章标签
- `category`：文章分类
- `draft`：是否草稿，`false` 会显示，`true` 不显示

## 新增项目档案

目录：`src/content/projects`

新增一个项目时，在这个目录里新建一个 `.md` 文件。

项目模板：

```md
---
title: "项目名称"
summary: "一句话说明这个项目解决什么问题。"
status: "building"
stack: ["Astro", "TypeScript", "Vue"]
featured: true
repo: "https://example.com/repo"
demo: "https://example.com/demo"
---

这里写项目介绍、实现思路、复盘或维护记录。
```

字段说明：

- `title`：项目名称
- `summary`：项目卡片简介
- `status`：项目状态，可用 `planning`、`building`、`released`
- `stack`：技术栈标签
- `featured`：是否优先展示
- `repo`：仓库链接，可不填
- `demo`：演示链接，可不填

## 修改页面固定介绍

这些页面的固定文案在 `src/pages` 目录里：

- 首页：`src/pages/index.astro`
- 项目档案页：`src/pages/projects/index.astro`
- 开发日志页：`src/pages/logs/index.astro`
- 观测收藏页：`src/pages/collections/index.astro`
- 站点档案页：`src/pages/about.astro`

如果只是改页面介绍、侧边说明、栏目标题，通常改这些文件即可。

## 修改图片素材

图片目录：`public/assets`

页面里使用图片时，路径一般写成：

```text
/assets/图片文件名.png
```

例如：

```astro
image="/assets/hero-about.png"
```

替换图片时，建议保持文件名不变，这样不用改代码。想换成新文件名时，再去对应页面或数据文件里改路径。

## 发布前检查

每次改完内容后，建议按这个顺序检查：

1. 本地运行 `npm run dev -- --port 4322`
2. 打开 `http://127.0.0.1:4322/` 看页面效果
3. 运行 `npm run build`
4. 确认没有报错后再发布

## 维护原则

- 文章和项目尽量用 Markdown 维护。
- 收藏卡片统一改 `src/data/observations.ts`。
- 站点基础信息统一改 `src/data/site.ts`。
- 图片统一放在 `public/assets`。
- 修改前先确认要改的是内容、页面文案还是样式。
- 不确定改哪里时，优先搜索页面上出现的那句文字。

