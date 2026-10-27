import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * 面试题库存取。
 *
 * 题库由 scripts/build-interview-bank.mjs 在 dev/build 前生成到 public/data/ 下。
 * 这里只在构建期读取（页面在 SSG 阶段解析），运行时由 island 自己 fetch，
 * 所以首页 HTML 不会因为 165 KB 的题库而膨胀。
 */
export type Difficulty = 'junior' | 'middle' | 'senior';

export interface InterviewQuestion {
  id: string;
  no: number;
  section: string;
  sectionSlug: string;
  difficulty: Difficulty;
  question: string;
  questionHtml: string;
  answerHtml: string;
  hasCode: boolean;
}

export interface InterviewSection {
  slug: string;
  name: string;
  count: number;
  byDifficulty: Record<Difficulty, number>;
}

export interface InterviewEntry {
  slug: string;
  title: string;
  html: string;
}

export interface InterviewBank {
  source: string;
  total: number;
  difficulties: { key: Difficulty; label: string; count: number }[];
  sections: InterviewSection[];
  questions: InterviewQuestion[];
  cheatsheet: InterviewEntry[];
  appendix: InterviewEntry[];
}

export const difficultyLabel: Record<Difficulty, string> = {
  junior: '初',
  middle: '中',
  senior: '高'
};

/**
 * 题库构建期文件路径。
 *
 * 注意这里是 public/data 而不是 src/：题库 165 KB 只应该在运行时按需 fetch，
 * 不能让 Astro 把它当模块打包，也不能让首页 HTML 内联一份。
 */
export const interviewBankFile = path.join(process.cwd(), 'public', 'data', 'interview-bank.json');

export const interviewBankUrl = '/data/interview-bank.json';

/** 读整份题库。只在构建期（页面渲染）用。 */
export async function loadInterviewBank(): Promise<InterviewBank> {
  let raw: string;
  try {
    raw = await readFile(interviewBankFile, 'utf8');
  } catch {
    throw new Error(
      `读不到题库文件 ${interviewBankFile}。请先执行 npm run bank 生成（dev 与 build 已通过 pre 钩子自动执行）。`
    );
  }

  return JSON.parse(raw) as InterviewBank;
}

/** 题干摘要：列表/侧栏用，避免把长题干撑爆版式 */
export function questionPlainText(question: InterviewQuestion): string {
  return question.question.replace(/\s+/g, ' ').trim();
}
