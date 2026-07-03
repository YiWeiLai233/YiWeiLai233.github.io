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
