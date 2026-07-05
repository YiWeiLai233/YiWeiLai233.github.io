---
title: "DreamArchive HttpOnly Cookie 与 CSRF 测试记录"
date: 2026-06-03
summary: "记录 DreamArchive 从 localStorage Token 迁移到 Cookie 思路时，如何处理 CSRF Header、跨域和烟测验证。"
tags: ["DreamArchive", "认证", "CSRF"]
category: "技术笔记"
draft: false
---

前后端分离项目里，把 Token 放在 localStorage 开发方便，但一旦页面存在 XSS 风险，Token 就可能被脚本读走。DreamArchive 后续规划把登录 Token 迁移到 HttpOnly Cookie，并用 CSRF Token 保护敏感写操作。

## 为什么迁移

HttpOnly Cookie 不能被前端 JavaScript 直接读取，可以降低 Token 被脚本窃取的风险。前端请求时通过 `withCredentials` 自动携带 Cookie，用户体验仍然接近原来的登录态。

但 Cookie 会自动随请求发送，所以写操作必须额外防 CSRF。

## CSRF Header

后端下发一个非 HttpOnly 的 `XSRF-TOKEN`，前端在写操作里把它放进 `X-XSRF-TOKEN` Header。后端校验 Cookie 和 Header 是否匹配，匹配后才继续进入认证和业务处理。

跨域部署时，CORS 允许头里也要包含 `X-XSRF-TOKEN`，否则预检请求会失败。

## 烟测逻辑

测试时可以分两步验证：

- 带认证 Cookie 但不带 CSRF Header 的 POST 应该返回 403。
- 带匹配 CSRF Header 后，才进入认证阶段；如果 Token 本身是假的，再返回 401。

这说明 CSRF 校验确实挡在写操作前面，而不是形同虚设。

## 复盘

认证迁移最容易低估细节。Cookie、CORS、CSRF、前端 Axios、后端过滤器和部署域名要一起考虑。单独改一个点很容易出现“本地能用，跨域就坏”的问题。
