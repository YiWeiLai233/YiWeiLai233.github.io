/**
 * 把 src/data/interview/ 下的题库 Markdown 解析成 public/data/interview-bank.json。
 *
 * 为什么要有这个脚本：
 * 1. 题库是整份替换更新的（不是逐题编辑），拆成一题一个 md 反而增加维护噪音。
 * 2. 答案里含 110 行表格和 34 个代码围栏，必须在构建期用 Astro 同一套 markdown
 *    管线渲染成 HTML，否则客户端要额外引入 markdown 库，且表格/代码块样式会和正文不一致。
 * 3. 产出放 public/ 而不是被 island import，用户点「开始刷题」时才 fetch，
 *    首页 HTML 与 JS 体积零增长。
 *
 * 关键坑：题库里有 9 行以 `#` 开头的 Shell / PromQL 注释位于代码围栏内部
 * （第 477、480、483、486、1448、1451、1454、1457、1460 行）。
 * 因此切分必须先走「是否在 fence 内」的状态机，绝不能直接用行级正则匹配 `^##`。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'src/data/interview/运维面试八股文-全面版.md');
const OUTPUT = path.join(root, 'public/data/interview-bank.json');

const DIFFICULTIES = [
  { key: 'junior', label: '初', mark: '【初】' },
  { key: 'middle', label: '中', mark: '【中】' },
  { key: 'senior', label: '高', mark: '【高】' }
];

/** 顶层章节里，这两类是查阅型内容，不进刷题池 */
const CHEATSHEET_PREFIX = '十五、';
const APPENDIX_PREFIX = '附：';

/**
 * 把整份文档切成「围栏外」才有语义的行数组。
 * 返回 { text, inFence }，后续切分只看 inFence === false 且 text 以 # 开头的行。
 */
function annotateFences(lines) {
  let inFence = false;
  return lines.map((text) => {
    const isFenceMarker = /^\s*```/.test(text);
    const current = { text, inFence: inFence || isFenceMarker, isFenceMarker };
    if (isFenceMarker) inFence = !inFence;
    return current;
  });
}

/** 找顶层 `## ` 标题（围栏外） */
function splitSections(annotated) {
  const sections = [];
  let current = null;

  annotated.forEach((line, index) => {
    const isHeading = !line.inFence && !line.isFenceMarker && /^##\s+/.test(line.text);
    if (isHeading) {
      current = {
        title: line.text.replace(/^##\s+/, '').trim(),
        startIndex: index + 1,
        lines: []
      };
      sections.push(current);
      return;
    }
    if (current) current.lines.push(line);
  });

  // 去掉每个 section 末尾的分隔线与空行
  for (const section of sections) {
    while (section.lines.length) {
      const last = section.lines[section.lines.length - 1];
      if (last.isFenceMarker) break;
      const trimmed = last.text.trim();
      if (trimmed === '' || trimmed === '---') section.lines.pop();
      else break;
    }
  }

  return sections;
}

/** 把 section 的正文按 `### ` 再切一层（围栏外） */
function splitBlocks(section) {
  const blocks = [];
  let current = null;

  section.lines.forEach((line) => {
    const isHeading = !line.inFence && !line.isFenceMarker && /^###\s+/.test(line.text);
    if (isHeading) {
      current = { heading: line.text.replace(/^###\s+/, '').trim(), lines: [] };
      blocks.push(current);
      return;
    }
    if (current) current.lines.push(line);
  });

  if (blocks.length === 0) {
    return [{ heading: section.title, lines: section.lines }];
  }

  for (const block of blocks) {
    while (block.lines.length) {
      const last = block.lines[block.lines.length - 1];
      if (last.isFenceMarker) break;
      const trimmed = last.text.trim();
      if (trimmed === '' || trimmed === '---') block.lines.pop();
      else break;
    }
    // 去掉正文开头的空行
    while (block.lines.length && block.lines[0].text.trim() === '') block.lines.shift();
  }

  return blocks;
}

/** 章节名「一、Linux 系统与内核」→ { order: '一', name: 'Linux 系统与内核' } */
function parseSectionTitle(title) {
  const matched = title.match(/^(\S+?)、\s*(.+)$/);
  if (matched) return { order: matched[1], name: matched[2].trim() };
  return { order: '', name: title.replace(/^附：/, '').trim() };
}

/** 题目标题「Q1. 说说 Linux 的启动流程。【中】」→ { no, difficulty, title } */
function parseQuestionHeading(heading) {
  const matched = heading.match(/^Q(\d+)\.\s*([\s\S]*)$/);
  if (!matched) return null;

  let title = matched[2];
  let difficulty = 'middle';
  for (const item of DIFFICULTIES) {
    if (title.includes(item.mark)) {
      difficulty = item.key;
      title = title.split(item.mark).join('');
    }
  }

  return { no: Number(matched[1]), difficulty, title: title.trim() };
}

async function main() {
  const raw = await readFile(SOURCE, 'utf8');
  const annotated = annotateFences(raw.split(/\r?\n/));
  const sections = splitSections(annotated);

  const processor = await createMarkdownProcessor({
    gfm: true,
    smartypants: true,
    // 题库里有一个 ```promql 围栏，shiki 没有 promql 语法，
    // 用 langAlias 映射到 plaintext，避免运行时打警告。
    shikiConfig: { theme: 'github-light', langAlias: { promql: 'plaintext' } }
  });

  const render = async (markdown) => {
    const rendered = await processor.render(markdown);
    return rendered.code.trim();
  };

  /** 渲染单行行内 markdown（题目本身含行内 code），去掉外层 <p> 交给前端包 */
  const renderInline = async (markdown) => {
    const html = await render(markdown);
    return html.replace(/^<p>/, '').replace(/<\/p>$/, '').trim();
  };

  const slugger = new GithubSlugger();
  const questions = [];
  const sectionMeta = [];
  const cheatsheet = [];
  const appendix = [];

  for (const section of sections) {
    const { name } = parseSectionTitle(section.title);
    if (name === '目录' || section.title === '目录') continue;

    const isCheatsheet = section.title.startsWith(CHEATSHEET_PREFIX);
    const isAppendix = section.title.startsWith(APPENDIX_PREFIX);
    const blocks = splitBlocks(section);

    if (isCheatsheet || isAppendix) {
      for (const block of blocks) {
        const body = block.lines.map((line) => line.text).join('\n');
        if (!body.trim()) continue;
        const entry = {
          slug: slugger.slug(block.heading),
          title: block.heading,
          html: await render(body)
        };
        if (isCheatsheet) cheatsheet.push(entry);
        else appendix.push(entry);
      }
      continue;
    }

    const sectionSlug = slugger.slug(name);
    let count = 0;

    for (const block of blocks) {
      const parsed = parseQuestionHeading(block.heading);
      if (!parsed) continue;

      const body = block.lines.map((line) => line.text).join('\n');
      questions.push({
        id: `q${parsed.no}`,
        no: parsed.no,
        section: name,
        sectionSlug,
        difficulty: parsed.difficulty,
        question: parsed.title,
        questionHtml: await renderInline(parsed.title),
        answerHtml: await render(body),
        hasCode: /^\s*```/m.test(body)
      });
      count += 1;
    }

    if (count > 0) {
      sectionMeta.push({
        slug: sectionSlug,
        name,
        count,
        byDifficulty: {
          junior: questions.filter((q) => q.sectionSlug === sectionSlug && q.difficulty === 'junior').length,
          middle: questions.filter((q) => q.sectionSlug === sectionSlug && q.difficulty === 'middle').length,
          senior: questions.filter((q) => q.sectionSlug === sectionSlug && q.difficulty === 'senior').length
        }
      });
    }
  }

  questions.sort((a, b) => a.no - b.no);

  const bank = {
    source: path.basename(SOURCE),
    total: questions.length,
    difficulties: DIFFICULTIES.map((item) => ({
      key: item.key,
      label: item.label,
      count: questions.filter((q) => q.difficulty === item.key).length
    })),
    sections: sectionMeta,
    questions,
    cheatsheet,
    appendix
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(bank)}\n`, 'utf8');

  const bytes = Buffer.byteLength(JSON.stringify(bank));
  const codeCount = questions.filter((q) => q.hasCode).length;
  console.log(
    `[interview-bank] ${bank.total} 题 / ${bank.sections.length} 章 / 速记 ${bank.cheatsheet.length} 节 / ` +
      `含代码 ${codeCount} 题 → ${path.relative(root, OUTPUT)} (${(bytes / 1024).toFixed(1)} KB)`
  );
}

main().catch((error) => {
  console.error('[interview-bank] 解析失败：', error);
  process.exitCode = 1;
});
