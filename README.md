# 未来观测站

忆丶未来的个人站：项目档案、开发日志、二次元观测收藏与站点档案。

线上地址：<https://yiweilai233.github.io/>

## 技术栈

- [Astro 5](https://astro.build/) 静态站，`output: static`
- Tailwind CSS 3 + 自定义设计变量（`src/styles/theme.css`）
- Vue 3 岛屿组件（观测板小部件）
- Astro Content Collections 管理日志与项目（`src/content/`）
- GitHub Actions 自动构建并发布到 GitHub Pages

## 本地开发

```powershell
npm install
npm run dev      # http://127.0.0.1:4321/
npm run build    # astro check + 构建到 dist/
npm run preview  # 预览构建产物
```

## 目录速览

```text
src/
├── components/     # layout 布局件、feature 内容件、ui 基础件、islands Vue 岛屿
├── content/        # posts 日志、projects 项目（Markdown）
├── data/           # site.ts 站点信息、observations.ts 观测收藏卡片
├── layouts/        # BaseLayout 全站骨架、ContentLayout 文章页
├── lib/            # content.ts 内容工具、toc.ts 标题锚点、url.ts 绝对地址
├── pages/          # 首页、logs、projects、tags、collections、about、404、rss.xml
└── styles/         # theme.css 变量、global.css 全局样式
```

## 日常维护

新增文章放到 `src/content/posts/`，新增项目放到 `src/content/projects/`，
站点名称、导航、域名统一改 `src/data/site.ts`。详细步骤见
[`docs/content-maintenance-note.md`](docs/content-maintenance-note.md)。

## 部署

推送到 `main` 即触发 `.github/workflows/deploy.yml`：安装依赖 → `npm run build` →
上传 `dist` → 发布到 Pages。若要把站点换到自定义域名，只改 `src/data/site.ts` 的
`url` 与 `public/robots.txt` 的 sitemap 地址，再在仓库 Settings → Pages 里绑定域名。
