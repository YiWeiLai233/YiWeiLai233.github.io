export const site = {
  name: '未来观测站',
  owner: '忆丶未来',
  // 站点根地址（末尾不带斜杠）。GitHub Pages 用户站：
  // https://yiweilai233.github.io —— 若要换成自定义域名，只改这一处。
  url: 'https://yiweilai233.github.io',
  lang: 'zh-CN',
  description: '忆丶未来的个人站：开发项目、技术日志、二次元观测收藏与站点档案。',
  // 分享卡片（社交平台预览图），放在 public 下
  ogImage: '/assets/hero-logs.webp',
  github: 'https://github.com/YiWeiLai233',
  nav: [
    { href: '/', label: '首页' },
    { href: '/projects/', label: '项目档案' },
    { href: '/logs/', label: '开发日志' },
    { href: '/tags/', label: '标签' },
    { href: '/collections/', label: '观测收藏' },
    { href: '/interview/', label: '面试刷题' },
    { href: '/about/', label: '站点档案' }
  ],
  hero: {
    title: '未来观测站',
    subtitle: '忆丶未来的个人博客，记录开发项目、技术笔记、二次元收藏与日常思考。'
  }
} as const;
