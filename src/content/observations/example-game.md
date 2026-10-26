---
title: "示例条目 · 一个在玩的游戏"
kind: game
status: ongoing
rating: 9.2
date: 2026-10-05
summary: "游戏类观测的示例记录，演示「在玩 / 通关 / 吃灰」这组状态文案和 Steam 外链的展示效果。"
link: "https://store.steampowered.com"
linkLabel: "Steam"
---

游戏类的状态文案和番剧不同：`ongoing` 显示「在玩」，`finished` 显示「通关」，`dropped` 显示「吃灰」。这组文案集中在 `src/data/observations.ts` 里维护，改一处全站生效。

## 可以记什么

- 进度：打到第几章、多少小时；
- 养成或配队思路；
- 值得截图的那一段；
- 会不会想重开一遍。

## 这条的意义

主要是把「同一套组件能承载不同分类」这件事验证掉。卡片顶部的分类名、状态徽章的颜色、评分的位置，都是从 `kind` 推导出来的，不需要为每个分类单独写模板。

真实内容替换掉之后，这段就可以删。
