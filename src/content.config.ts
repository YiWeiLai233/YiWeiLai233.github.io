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

/**
 * 观测收藏：番剧、游戏、音乐、日常碎片的具体条目。
 * 与项目档案、开发日志同级，一条收藏对应一个详情页。
 */
const observations = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    kind: z.enum(['anime', 'game', 'music', 'daily']),
    /** 观看/游玩状态，具体文案由 kind 决定（见 src/data/observations.ts） */
    status: z.enum(['planned', 'ongoing', 'finished', 'dropped']).default('ongoing'),
    /** 评分 0-10，可留空表示不打分 */
    rating: z.number().min(0).max(10).optional(),
    /** 开始（或标记）日期，用于排序 */
    date: z.coerce.date(),
    /** 看完/通关日期，进行中可留空 */
    finishedDate: z.coerce.date().optional(),
    summary: z.string(),
    /** 外链：Bangumi / Steam / 网易云等 */
    link: z.string().url().optional(),
    /** 外链显示名，默认「查看原站」 */
    linkLabel: z.string().default('查看原站'),
    draft: z.boolean().default(false)
  })
});

export const collections = { posts, projects, observations };
