---
title: "DreamArchive CI 修复：Windows 不报错，Linux 会失败"
date: 2026-06-06
summary: "记录 DreamArchive 在 GitHub Actions 中遇到的 Java 文件名大小写问题，以及为什么要清理重复 Workflow。"
tags: ["DreamArchive", "CI", "GitHub Actions"]
category: "开发日志"
draft: false
---

本地 Windows 构建能过，不代表 CI 一定能过。DreamArchive 在 CI 中遇到过 Java 文件名大小写问题：Windows 文件系统大小写不敏感，本地不报错；Linux CI 大小写敏感，编译直接失败。

## 文件名大小写

Java 源文件名必须和 public class 名一致。Windows 上有时因为大小写不敏感，问题被隐藏；到了 Linux 环境，文件名大小写不一致就会被编译器指出。

这类问题适合交给 CI 尽早发现，而不是等部署时才发现。

## Workflow 清理

项目里曾经有重复的 workflow，导致每次推送触发过多检查。后面清理重复配置，只保留后端构建、前端构建和 Docker 构建等必要流程，并增加 pull request 触发，让合入前也能验证。

## Docker 构建

Docker 构建检查能提前发现 Dockerfile、依赖安装、构建命令和镜像上下文问题。对于需要公开部署的项目，Docker 构建不应该等到服务器上再第一次尝试。

## 复盘

CI 的意义不只是“自动跑命令”，而是提供一个更接近生产的验证环境。Windows 本地开发很方便，但 Linux 部署和容器环境会暴露另一类问题。越早让 CI 参与，越少在发布时补锅。
