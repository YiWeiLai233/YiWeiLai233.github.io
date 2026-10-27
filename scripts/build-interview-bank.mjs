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
 * 多文件合并：SOURCES 里的文件按顺序读，共用同一个 slugger 和同一份题目队列，
 * 全部读完后再统一重排成 1..N 的全局题号——每个文件自己都是从 Q1 开始的，
 * 不重排就会出现重复的 q1、q2。
 *
 * 关键坑：题库里有 9 行以 `#` 开头的 Shell / PromQL 注释位于代码围栏内部
 * （运维面试八股文-全面版.md 的第 477、480、483、486、1448、1451、1454、1457、1460 行）。
 * 因此切分必须先走「是否在 fence 内」的状态机，绝不能直接用行级正则匹配 `^##`。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 题库源文件，按数组顺序合并进同一份 JSON。
 *
 * 为什么是显式列表而不是扫目录：题目编号是在合并后连续重排的（第二份文件的 Q1
 * 会变成 Q231），扫目录会让文件名排序变化直接改变全站题号。新增题库时必须显式
 * 追加在这里，顺带把「题号为什么变了」变成一个需要 review 的动作。
 *
 * group 是给前端做筛选分组的：六份题库铺开接近 90 个章节，全都摊成一排 chip
 * 没法用，所以先按题库分组收一层，再在组内选章节。
 */
const SOURCES = [
  { file: 'src/data/interview/运维面试八股文-全面版.md', group: '通用运维' },
  { file: 'src/data/interview/linux-ops.md', group: 'Linux 运维' },
  { file: 'src/data/interview/cicd.md', group: 'CI/CD 与发布' },
  { file: 'src/data/interview/kubernetes.md', group: 'Kubernetes' },
  { file: 'src/data/interview/database.md', group: '数据库' },
  { file: 'src/data/interview/desktop-ops.md', group: '桌面运维' }
].map((item) => ({ ...item, path: path.join(root, item.file) }));
const OUTPUT = path.join(root, 'public/data/interview-bank.json');

const DIFFICULTIES = [
  { key: 'junior', label: '初', mark: '【初】' },
  { key: 'middle', label: '中', mark: '【中】' },
  { key: 'senior', label: '高', mark: '【高】' }
];

/**
 * 顶层章节里，这两类是查阅型内容，不进刷题池。
 * 速记卡按「标题里含 速记」判断，不能按章节序号前缀判断：每个题库文件各自编号，
 * 第一份的速记卡是「十五、」，Linux 题库里「十五、」却是正经题目章节。
 */
const isCheatsheetTitle = (title) => title.includes('速记');
const APPENDIX_PREFIX = '附：';

/**
 * 按题库把章节收成一层分组，顺序沿用 SOURCES 的书写顺序而不是章节出现顺序，
 * 这样新加题库时分组顺序就是 SOURCES 的顺序，不用再单独排一次。
 */
function buildGroups(sections) {
  const order = SOURCES.map((source) => source.group);
  const groups = [];
  for (const name of order) {
    const members = sections.filter((section) => section.group === name);
    if (members.length > 0) {
      groups.push({ name, count: members.reduce((sum, item) => sum + item.count, 0), sections: members.length });
    }
  }
  return groups;
}

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

  // 多个源文件共用同一个 slugger：章节 slug 全局唯一，不会因为两个文件都有
  // 「一、」开头的章节而撞车（撞了会自动加 -1 后缀）。
  const slugger = new GithubSlugger();
  const questions = [];
  const sectionMeta = [];
  const cheatsheet = [];
  const appendix = [];

  for (const source of SOURCES) {
    const raw = await readFile(source.path, 'utf8');
    const sections = splitSections(annotateFences(raw.split(/\r?\n/)));

    for (const section of sections) {
      const { name } = parseSectionTitle(section.title);
      if (name === '目录' || section.title === '目录') continue;

      const isCheatsheet = isCheatsheetTitle(section.title);
      const isAppendix = section.title.startsWith(APPENDIX_PREFIX);
      const blocks = splitBlocks(section);

      if (isCheatsheet || isAppendix) {
        for (const block of blocks) {
          const body = block.lines.map((line) => line.text).join('\n');
          if (!body.trim()) continue;
          const entry = {
            slug: slugger.slug(block.heading),
            title: block.heading,
            // 六份题库的速记小节会重名（「必记参数」「一句话速答」各出现两次），
            // 带上题库名前端才分得清这是哪一套的速记。
            group: source.group,
            html: await render(body)
          };
          if (isCheatsheet) cheatsheet.push(entry);
          else appendix.push(entry);
        }
        continue;
      }

      const sectionSlug = slugger.slug(name);
      // 每个文件里的 Q 号都是从 1 重新开始的，所以先只记原号，
      // 等所有文件读完再统一重排成全局连续编号。
      const byDifficulty = { junior: 0, middle: 0, senior: 0 };
      let count = 0;

      for (const block of blocks) {
        const parsed = parseQuestionHeading(block.heading);
        if (!parsed) continue;

        const body = block.lines.map((line) => line.text).join('\n');
        questions.push({
          id: '',
          no: 0,
          sourceNo: parsed.no,
          section: name,
          sectionSlug,
          difficulty: parsed.difficulty,
          question: parsed.title,
          questionHtml: await renderInline(parsed.title),
          answerHtml: await render(body),
          hasCode: /^\s*```/m.test(body)
        });
        byDifficulty[parsed.difficulty] += 1;
        count += 1;
      }

      if (count > 0) {
        sectionMeta.push({ slug: sectionSlug, name, group: source.group, count, byDifficulty });
      }
    }
  }

  // 题目按「文件顺序 → 章节顺序 → 原 Q 号顺序」入队，重排后即全局 1..N 连续编号，
  // 这样 id 唯一、跨文件也不会有 q1 撞车。
  questions.forEach((question, index) => {
    question.no = index + 1;
    question.id = `q${index + 1}`;
    delete question.sourceNo;
  });

  const bank = {
    source: SOURCES.map((source) => path.basename(source.path)).join(' + '),
    total: questions.length,
    groups: buildGroups(sectionMeta),
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
