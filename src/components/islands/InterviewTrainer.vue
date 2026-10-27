<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { Difficulty, InterviewBank, InterviewQuestion } from '@/lib/interview';

const STORAGE_KEY = 'anime-blog.interview.v1';

withDefaults(
  defineProps<{
    /** 首页使用紧凑布局：隐藏筛选条，只留一张题卡 + 去刷题页的入口 */
    compact?: boolean;
  }>(),
  { compact: false }
);

type FilterState = {
  sections: string[];
  groups: string[];
  difficulties: Difficulty[];
  answered: number;
};

const bank = ref<InterviewBank | null>(null);
const loading = ref(false);
const loadError = ref('');
const revealed = ref(false);
const failed = ref(false);

/**
 * 出题队列：当前这一轮还没出过的题。
 *
 * 为什么用队列而不是每题现抽 Math.random()：230 题里刷 20 题，
 * 按生日问题算期望有 1–2 次重复，体验很烦。把筛选范围内的题打乱成队列
 * 逐题往后走，一轮之内保证不重复；走完再重洗。
 *
 * 队列里存的是题目对象本身（不是 id），因为 cursor 直接按位置取题，
 * 只存 id 还得再回查一遍 bank，顺序反而容易跟队列对不上。
 */
const queue = shallowRef<InterviewQuestion[]>([]);
const cursor = ref(0);

const activeSections = ref<string[]>([]);
const activeGroups = ref<string[]>([]);
const activeDifficulties = ref<Difficulty[]>(['junior', 'middle', 'senior']);
const answered = ref(0);

const current = computed<InterviewQuestion | null>(() => {
  const list = queue.value;
  if (list.length === 0) return null;
  return list[Math.min(cursor.value, list.length - 1)] ?? null;
});

const progressText = computed(() => {
  if (queue.value.length === 0) return '';
  const position = Math.min(cursor.value + 1, queue.value.length);
  return `${position} / ${queue.value.length}`;
});

const canPrev = computed(() => cursor.value > 0);

const difficultyText: Record<Difficulty, string> = {
  junior: '初',
  middle: '中',
  senior: '高'
};

const sectionCounts = computed(() => bank.value?.sections ?? []);
const difficultyOptions = computed(() => bank.value?.difficulties ?? []);
const groupOptions = computed(() => bank.value?.groups ?? []);

/**
 * 当前显示在筛选条里的章节。
 *
 * 六份题库合起来接近九十个章节，一次全摊开会把筛选区撑成一堵墙，
 * 所以先选题库分组（不选＝全部题库），章节 chip 只显示选中分组里的。
 */
const visibleSections = computed(() => {
  const groups = activeGroups.value;
  if (groups.length === 0) return sectionCounts.value;
  return sectionCounts.value.filter((section) => groups.includes(section.group));
});

function shuffle<T>(items: T[]): T[] {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
}

/**
 * 重建出题队列。
 *
 * 传进来的必须是已打乱的数组（shuffle 过），这里不再自己洗，
 * 因为「筛选后保持原顺序」和「随机出题」是两个决定，混在一起会难查。
 */
function rebuild(questions: InterviewQuestion[]) {
  queue.value = questions;
  cursor.value = 0;
  revealed.value = false;
  failed.value = false;
}

function applyFilters() {
  if (!bank.value) return;
  const sections = activeSections.value;
  const difficulties = activeDifficulties.value;
  const groups = activeGroups.value;

  const picked = bank.value.questions.filter((item) => {
    const groupOk = groups.length === 0 || groups.includes(sectionGroup(item.sectionSlug));
    const sectionOk = sections.length === 0 || sections.includes(item.sectionSlug);
    return groupOk && sectionOk && difficulties.includes(item.difficulty);
  });

  rebuild(shuffle(picked));
}

function sectionGroup(slug: string): string {
  const matched = sectionCounts.value.find((item) => item.slug === slug);
  return matched?.group ?? '';
}

function toggleGroup(name: string) {
  const list = activeGroups.value;
  activeGroups.value = list.includes(name)
    ? list.filter((item) => item !== name)
    : [...list, name];
}

function toggleSection(slug: string) {
  const list = activeSections.value;
  activeSections.value = list.includes(slug)
    ? list.filter((item) => item !== slug)
    : [...list, slug];
}

function toggleDifficulty(key: Difficulty) {
  const list = activeDifficulties.value;
  // 至少保留一个难度，否则池子会空掉
  if (list.includes(key) && list.length === 1) return;
  activeDifficulties.value = list.includes(key)
    ? list.filter((item) => item !== key)
    : [...list, key];
}

function resetFilters() {
  activeGroups.value = [];
  activeSections.value = [];
  activeDifficulties.value = ['junior', 'middle', 'senior'];
}

function reveal() {
  if (!revealed.value) {
    // 只有首次翻开才算「刷过一题」，反复开关答案不重复计数
    answered.value += 1;
    saveState();
  }
  revealed.value = true;
}

function next() {
  if (queue.value.length === 0) return;
  if (cursor.value + 1 >= queue.value.length) {
    // 一轮走完：重洗同一批题再从头开始，避免「刷到底就停」。
    // 注意重洗的是队列本身，所以第二轮的第一题和第一轮最后一题大概率不同。
    queue.value = shuffle(queue.value);
    cursor.value = 0;
  } else {
    cursor.value += 1;
  }
  revealed.value = false;
  failed.value = false;
  saveState();
}

function prev() {
  if (cursor.value === 0) return;
  cursor.value -= 1;
  revealed.value = false;
  failed.value = false;
  saveState();
}

function markFailed() {
  failed.value = !failed.value;
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    next();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    prev();
  } else if (event.key === ' ' && !revealed.value) {
    event.preventDefault();
    reveal();
  }
}

function saveState() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sections: activeSections.value,
        groups: activeGroups.value,
        difficulties: activeDifficulties.value,
        answered: answered.value
      })
    );
  } catch {
    // localStorage 被禁用时静默降级，不影响刷题
  }
}

/**
 * 只恢复筛选项和「已刷多少题」这种跨会话有意义的状态。
 * 出题位置不恢复：每次进页面队列都会重洗，硬把 cursor 套回去会错位。
 */
function restoreState() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<FilterState> & { answered?: number };
    if (Array.isArray(saved.sections)) activeSections.value = saved.sections;
    if (Array.isArray(saved.groups)) activeGroups.value = saved.groups;
    if (Array.isArray(saved.difficulties) && saved.difficulties.length > 0) {
      activeDifficulties.value = saved.difficulties;
    }
    if (typeof saved.answered === 'number') answered.value = saved.answered;
  } catch {
    // 存档损坏就当没有，不影响刷题
  }
}

async function load() {
  if (bank.value || loading.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const response = await fetch('/data/interview-bank.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bank.value = (await response.json()) as InterviewBank;
    applyFilters();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '题库加载失败';
  } finally {
    loading.value = false;
  }
}

watch([activeSections, activeGroups, activeDifficulties], () => {
  if (!bank.value) return;
  applyFilters();
  saveState();
}, { deep: true });

onMounted(() => {
  restoreState();
  load();
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <section :class="['interview-trainer', { 'is-compact': compact }]">
    <header class="trainer-head">
      <div class="head-text">
        <p class="eyebrow">面试刷题</p>
        <h3>运维 / SRE 八股</h3>
        <p v-if="bank" class="sub">
          共 {{ bank.total }} 题 · 已刷 {{ answered }} 题
        </p>
        <p v-else class="sub">随机出题 · 点开看答案 · 洗完一轮再重来</p>
      </div>
      <a v-if="compact" class="to-page" href="/interview/">去刷题页 →</a>
      <span v-else-if="progressText" class="progress">{{ progressText }}</span>
    </header>

    <p v-if="loading" class="state">题库加载中…</p>
    <p v-else-if="loadError" class="state is-error">
      题库加载失败：{{ loadError }}。请刷新页面重试。
    </p>

    <template v-else-if="bank">
      <div v-if="!compact" class="filters">
        <div class="filter-row">
          <span class="filter-label">难度</span>
          <button
            v-for="item in difficultyOptions"
            :key="item.key"
            type="button"
            :class="['chip', { 'is-on': activeDifficulties.includes(item.key) }]"
            @click="toggleDifficulty(item.key)"
          >
            {{ item.label }}<span>{{ item.count }}</span>
          </button>
        </div>
        <div class="filter-row">
          <span class="filter-label">题库</span>
          <button
            v-for="group in groupOptions"
            :key="group.name"
            type="button"
            :class="['chip', { 'is-on': activeGroups.includes(group.name) }]"
            @click="toggleGroup(group.name)"
          >
            {{ group.name }}<span>{{ group.count }}</span>
          </button>
          <button type="button" class="chip is-reset" @click="resetFilters">全部题库</button>
        </div>
        <div class="filter-row">
          <span class="filter-label">章节</span>
          <button
            v-for="section in visibleSections"
            :key="section.slug"
            type="button"
            :class="['chip', { 'is-on': activeSections.includes(section.slug) }]"
            @click="toggleSection(section.slug)"
          >
            {{ section.name }}<span>{{ section.count }}</span>
          </button>
          <button type="button" class="chip is-reset" @click="activeSections = []">全部章节</button>
        </div>
      </div>

      <p v-if="!current" class="state">当前筛选条件下没有题目，换个难度或章节试试。</p>

      <article v-else class="card">
        <div class="card-meta">
          <span class="no">Q{{ current.no }}</span>
          <span class="section">{{ current.section }}</span>
          <span :class="['level', `level-${current.difficulty}`]">
            {{ difficultyText[current.difficulty] }}
          </span>
        </div>

        <h4 class="question" v-html="current.questionHtml" />

        <button v-if="!revealed" type="button" class="answer-toggle" @click="reveal">
          看答案 <kbd>空格</kbd>
        </button>

        <div v-else class="answer">
          <div class="answer-body" v-html="current.answerHtml" />
          <button
            type="button"
            :class="['mark-failed', { 'is-on': failed }]"
            @click="markFailed"
          >
            {{ failed ? '已记为不会，记得回看' : '这题不会，记一下' }}
          </button>
        </div>

        <footer class="card-actions">
          <button type="button" class="ghost" :disabled="!canPrev" @click="prev">
            上一题
          </button>
          <button type="button" class="primary" @click="next">
            下一题 <kbd>→</kbd>
          </button>
        </footer>
      </article>
    </template>
  </section>
</template>

<style scoped>
.interview-trainer {
  display: grid;
  gap: 0.9rem;
}

.trainer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.eyebrow {
  margin: 0;
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.head-text h3 {
  margin: 0.2rem 0 0.25rem;
  color: var(--color-text);
  font-size: 1.15rem;
}

.sub {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.82rem;
}

.progress,
.to-page {
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--color-blue) 42%, var(--color-line));
  border-radius: 999px;
  padding: 0.28rem 0.66rem;
  background: color-mix(in srgb, var(--color-blue) 10%, white);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
}

.filters {
  display: grid;
  gap: 0.55rem;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  padding: 0.7rem 0.8rem;
  background: color-mix(in srgb, var(--color-bg) 60%, white);
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.filter-label {
  min-width: 2.6rem;
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  padding: 0.24rem 0.6rem;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.chip span {
  color: color-mix(in srgb, var(--color-muted) 70%, white);
  font-family: var(--font-mono);
  font-size: 0.68rem;
}

.chip:hover {
  border-color: color-mix(in srgb, var(--color-blue) 55%, var(--color-line));
}

.chip.is-on {
  border-color: color-mix(in srgb, var(--color-blue) 62%, var(--color-line));
  background: color-mix(in srgb, var(--color-blue) 16%, white);
  color: var(--color-text);
}

.chip.is-reset {
  border-style: dashed;
}

.card {
  display: grid;
  gap: 0.75rem;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  padding: 0.95rem 1rem 0.85rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 253, 255, 0.92)),
    var(--color-paper);
  box-shadow: var(--shadow-card);
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.no {
  color: var(--color-ink);
}

.section {
  color: var(--color-muted);
}

.level {
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--color-line);
}

.level-junior {
  border-color: color-mix(in srgb, var(--color-gold) 60%, var(--color-line));
  background: color-mix(in srgb, var(--color-gold) 16%, white);
}

.level-middle {
  border-color: color-mix(in srgb, var(--color-blue) 60%, var(--color-line));
  background: color-mix(in srgb, var(--color-blue) 16%, white);
}

.level-senior {
  border-color: color-mix(in srgb, var(--color-pink) 62%, var(--color-line));
  background: color-mix(in srgb, var(--color-pink) 16%, white);
}

.question {
  margin: 0;
  color: var(--color-text);
  font-size: 1.05rem;
  line-height: 1.7;
}

.question :deep(code) {
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-blue) 12%, white);
  padding: 0.08rem 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.answer-toggle,
.primary,
.ghost,
.mark-failed {
  border-radius: 999px;
  border: 1px solid var(--color-line);
  padding: 0.44rem 0.9rem;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
  transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
}

.answer-toggle {
  justify-self: start;
  border-color: color-mix(in srgb, var(--color-blue) 55%, var(--color-line));
  background: color-mix(in srgb, var(--color-blue) 14%, white);
  color: var(--color-text);
}

.answer-toggle:hover,
.primary:hover {
  transform: translateY(-1px);
}

.answer {
  display: grid;
  gap: 0.7rem;
  border-top: 1px dashed var(--color-line);
  padding-top: 0.75rem;
}

/* 答案是构建期渲染好的 HTML，样式需要穿透 scoped */
.answer-body {
  color: var(--color-text);
  font-size: 0.96rem;
  line-height: 1.85;
}

.answer-body :deep(p) {
  margin: 0 0 0.7rem;
}

.answer-body :deep(p:last-child) {
  margin-bottom: 0;
}

.answer-body :deep(ul),
.answer-body :deep(ol) {
  margin: 0 0 0.7rem;
  padding-left: 1.25rem;
}

.answer-body :deep(li) {
  margin-bottom: 0.28rem;
}

.answer-body :deep(li::marker) {
  color: color-mix(in srgb, var(--color-blue) 70%, var(--color-muted));
}

.answer-body :deep(code) {
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-blue) 12%, white);
  padding: 0.1rem 0.32rem;
  font-family: var(--font-mono);
  font-size: 0.88em;
}

.answer-body :deep(pre) {
  overflow-x: auto;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  padding: 0.7rem 0.8rem;
  font-size: 0.84rem;
  line-height: 1.65;
}

.answer-body :deep(pre code) {
  background: none;
  padding: 0;
}

.answer-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 0.8rem;
  font-size: 0.86rem;
}

.answer-body :deep(th),
.answer-body :deep(td) {
  border: 1px solid var(--color-line);
  padding: 0.35rem 0.5rem;
  text-align: left;
  vertical-align: top;
}

.answer-body :deep(th) {
  background: color-mix(in srgb, var(--color-blue) 10%, white);
  font-weight: 800;
}

.answer-body :deep(strong) {
  color: var(--color-ink);
}

.answer-body :deep(blockquote) {
  margin: 0 0 0.7rem;
  border-left: 3px solid color-mix(in srgb, var(--color-blue) 55%, var(--color-line));
  padding-left: 0.75rem;
  color: var(--color-muted);
}

.mark-failed {
  justify-self: start;
  background: var(--color-surface);
  color: var(--color-muted);
}

.mark-failed.is-on {
  border-color: color-mix(in srgb, var(--color-pink) 60%, var(--color-line));
  background: color-mix(in srgb, var(--color-pink) 16%, white);
  color: var(--color-text);
}

.card-actions {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  border-top: 1px solid var(--color-line);
  padding-top: 0.72rem;
}

.ghost {
  background: transparent;
  color: var(--color-muted);
}

.ghost:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.primary {
  margin-left: auto;
  border-color: color-mix(in srgb, var(--color-pink) 58%, var(--color-line));
  background: color-mix(in srgb, var(--color-pink) 18%, white);
  color: var(--color-text);
}

kbd {
  border: 1px solid var(--color-line);
  border-radius: 5px;
  padding: 0.04rem 0.28rem;
  background: rgba(255, 255, 255, 0.7);
  font-family: var(--font-mono);
  font-size: 0.68rem;
}

.state {
  margin: 0;
  border: 1px dashed var(--color-line);
  border-radius: var(--radius-md);
  padding: 0.9rem;
  color: var(--color-muted);
  font-size: 0.88rem;
  text-align: center;
}

.state.is-error {
  border-color: color-mix(in srgb, var(--color-pink) 60%, var(--color-line));
  color: color-mix(in srgb, var(--color-pink) 40%, var(--color-text));
}

.is-compact .card {
  padding: 0.85rem 0.9rem 0.75rem;
}

.is-compact .question {
  font-size: 1rem;
}
</style>
