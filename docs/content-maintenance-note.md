# 未来观测站内容维护笔记

项目目录：`D:\agent\anime-developer-blog`（GitHub 仓库 `YiWeiLai233/YiWeiLai233.github.io`，线上 <https://yiweilai233.github.io/>）

这个站点目前采用静态维护方式，不设置登录后台。日常维护就是修改项目里的内容文件，然后本地预览、构建、发布。

## 常用命令

进入项目目录：

```powershell
cd D:\agent\anime-developer-blog
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

## 新增一条观测收藏

目录：`src/content/observations`

观测收藏分成四类：`anime`（番剧）、`game`（游戏）、`music`（音乐）、`daily`（日常碎片）。一条收藏就是一个 Markdown 文件，会自动生成独立详情页 `/collections/<文件名>/`。

文件模板：

```md
---
title: "作品名"
kind: anime
status: ongoing
rating: 8.6
date: 2026-10-12
finishedDate: 2026-11-02
summary: "一句话说明这是什么、为什么记下来。"
link: "https://bangumi.tv"
linkLabel: "Bangumi"
---

正文写观感、进度或截图说明，Markdown 全部可用。
```

字段说明：

- `title`：条目名称
- `kind`：分类，`anime` / `game` / `music` / `daily`，决定落在哪一段和用什么配色
- `status`：`planned` 想看 / `ongoing` 在看 / `finished` 看完 / `dropped` 搁置
  （游戏类自动显示成「想玩 / 在玩 / 通关 / 吃灰」，音乐类显示成「收藏 / 循环中 / 听腻了 / 归档」）
- `rating`：0–10 的评分，**留空就不显示评分**，歌单这类不必打分
- `date`：开始或记录日期，列表按它排序，**进行中的会浮到最前**
- `finishedDate`：看完/通关日期，进行中可留空
- `summary`：卡片上的一句话摘要，太长会在第 3 行截断
- `link` / `linkLabel`：原站外链，例如 Bangumi、Steam、网易云
- `draft: true`：草稿，不会被构建进站点

分类的名称、说明、配色和状态文案统一在 `src/data/observations.ts` 里维护，改一处全站生效。`src/content/observations/` 下的 `example-*.md` 是四条示例，可以直接替换成真实内容。

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
- 观测收藏条目在 `src/content/observations`，分类元数据改 `src/data/observations.ts`。
- 站点基础信息统一改 `src/data/site.ts`。
- 图片统一放在 `public/assets`。
- 修改前先确认要改的是内容、页面文案还是样式。
- 不确定改哪里时，优先搜索页面上出现的那句文字。

