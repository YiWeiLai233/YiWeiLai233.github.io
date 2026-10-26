<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const STORAGE_KEY = 'anime-blog.quest-widget-position.v3';
const open = ref(false);
const ready = ref(false);
const dragging = ref(false);
const suppressClick = ref(false);
const position = ref({ x: 0, y: 0 });

let startPoint = { x: 0, y: 0 };
let pointerOffset = { x: 0, y: 0 };
let activePointerId: number | null = null;

const tips = [
  '项目档案记录真实的开发过程和维护状态。',
  '新增日志时，将文章放入内容目录即可生成页面。',
  '观测收藏用于整理番剧、音乐和游戏碎片。'
];

const widgetStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`
}));

function isMobileViewport() {
  return window.matchMedia('(max-width: 760px)').matches;
}

function clampPosition(next = position.value) {
  const margin = 16;
  const width = open.value ? 340 : 168;
  const height = open.value ? 380 : 64;

  return {
    x: Math.min(Math.max(next.x, margin), window.innerWidth - width - margin),
    y: Math.min(Math.max(next.y, margin), window.innerHeight - height - margin)
  };
}

function savePosition() {
  if (!isMobileViewport()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position.value));
  }
}

function togglePanel() {
  if (suppressClick.value) {
    suppressClick.value = false;
    return;
  }

  open.value = !open.value;
  position.value = clampPosition();
  savePosition();
}

function startDrag(event: PointerEvent) {
  if (isMobileViewport()) {
    return;
  }

  activePointerId = event.pointerId;
  dragging.value = true;
  startPoint = { x: event.clientX, y: event.clientY };
  pointerOffset = {
    x: event.clientX - position.value.x,
    y: event.clientY - position.value.y
  };

  window.addEventListener('pointermove', onDrag);
  window.addEventListener('pointerup', stopDrag);
}

function onDrag(event: PointerEvent) {
  if (!dragging.value || event.pointerId !== activePointerId) {
    return;
  }

  const distance = Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y);
  if (distance > 4) {
    suppressClick.value = true;
  }

  position.value = clampPosition({
    x: event.clientX - pointerOffset.x,
    y: event.clientY - pointerOffset.y
  });
}

function stopDrag(event: PointerEvent) {
  if (event.pointerId !== activePointerId) {
    return;
  }

  dragging.value = false;
  activePointerId = null;
  savePosition();
  window.removeEventListener('pointermove', onDrag);
  window.removeEventListener('pointerup', stopDrag);
}

function onResize() {
  position.value = clampPosition();
  savePosition();
}

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      position.value = clampPosition(JSON.parse(saved));
    } catch {
      position.value = clampPosition({
        x: 24,
        y: 104
      });
    }
  } else {
    position.value = clampPosition({
      x: 24,
      y: 104
    });
  }

  ready.value = true;
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('pointermove', onDrag);
  window.removeEventListener('pointerup', stopDrag);
});
</script>

<template>
  <section
    v-if="ready"
    class="quest-widget"
    :class="{ 'is-open': open, 'is-dragging': dragging }"
    :style="widgetStyle"
    aria-label="观测板小组件"
  >
    <button
      class="quest-tab"
      type="button"
      aria-label="观测板，点击展开，可拖动"
      :aria-expanded="open"
      @pointerdown="startDrag"
      @click="togglePanel"
    >
      <span class="tab-avatar">
        <img src="/assets/mini-guide-sticker.webp" alt="" />
      </span>
      <span class="tab-copy">
        <strong>观测板</strong>
        <small>{{ open ? '收起面板' : '拖动 / 点击' }}</small>
      </span>
    </button>

    <div v-if="open" class="quest-panel">
      <header @pointerdown="startDrag">
        <div class="panel-title">
          <img src="/assets/mini-guide-sticker.webp" alt="" />
          <div>
            <span>今日观测</span>
            <strong>未来观测站</strong>
          </div>
        </div>
        <button type="button" @pointerdown.stop @click="togglePanel">收起</button>
      </header>
      <div class="panel-guide">
        <div>
          <span>观测状态</span>
          <strong>清爽二次元静态站</strong>
          <p>项目、日志和观测收藏保持持续归档。</p>
        </div>
      </div>
      <ul>
        <li v-for="tip in tips" :key="tip">{{ tip }}</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
  .quest-widget {
    position: fixed;
    z-index: 50;
    width: 10.5rem;
    touch-action: none;
  }

  .quest-widget.is-open {
    width: 21.25rem;
  }

  .quest-tab,
  .quest-panel {
    border: 1px solid rgba(255, 255, 255, 0.78);
    background:
      radial-gradient(circle at 18% 12%, rgba(255, 255, 255, 0.96), transparent 32%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(236, 250, 255, 0.78)),
      rgba(255, 255, 255, 0.84);
    box-shadow: var(--shadow-card);
    backdrop-filter: blur(18px);
  }

  .quest-tab {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 3.85rem;
    gap: 0.6rem;
    border-radius: 999px;
    padding: 0.42rem 0.8rem 0.42rem 0.42rem;
    border-color: color-mix(in srgb, var(--color-blue) 36%, white);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(229, 249, 255, 0.78)),
      rgba(255, 255, 255, 0.86);
    color: var(--color-text);
    cursor: grab;
    font: inherit;
    text-align: left;
    transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }

  .quest-tab:hover {
    border-color: color-mix(in srgb, var(--color-blue) 56%, white);
    box-shadow: 0 18px 42px rgba(61, 103, 136, 0.14);
    transform: translateY(-1px);
  }

  .is-dragging .quest-tab,
  .quest-panel header {
    cursor: grabbing;
  }

  .tab-avatar,
  .panel-title img {
    display: grid;
    flex: 0 0 auto;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.86);
    border-radius: 999px;
    background:
      radial-gradient(circle at 45% 20%, rgba(255, 255, 255, 0.98), transparent 36%),
      color-mix(in srgb, var(--color-blue) 12%, white);
    box-shadow: 0 9px 20px rgba(61, 103, 136, 0.12);
  }

  .tab-avatar {
    width: 3rem;
    height: 3rem;
  }

  .tab-avatar img,
  .panel-title img {
    width: 116%;
    height: 116%;
    object-fit: cover;
    object-position: center 42%;
  }

  .tab-copy {
    display: grid;
    gap: 0.08rem;
    min-width: 0;
  }

  .quest-panel header span {
    color: var(--color-muted);
    font-family: var(--font-mono);
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  .tab-copy strong,
  .panel-guide strong {
    color: var(--color-text);
    font-size: 0.86rem;
    font-weight: 900;
  }

  .tab-copy small,
  .panel-guide p {
    color: var(--color-muted);
    font-size: 0.72rem;
    font-weight: 800;
  }

  .tab-copy small {
    white-space: nowrap;
  }

  .quest-panel {
    position: relative;
    display: grid;
    gap: 0.75rem;
    border-radius: 22px;
    margin-top: 0.65rem;
    padding: 0.9rem;
    overflow: hidden;
  }

  .quest-panel::before,
  .quest-panel::after {
    position: absolute;
    width: 1.05rem;
    height: 1.05rem;
    content: '';
    border-color: color-mix(in srgb, var(--color-blue) 58%, white);
  }

  .quest-panel::before {
    top: 0.65rem;
    left: 0.65rem;
    border-top: 2px solid;
    border-left: 2px solid;
  }

  .quest-panel::after {
    right: 0.65rem;
    bottom: 0.65rem;
    border-right: 2px solid;
    border-bottom: 2px solid;
  }

  .quest-panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding-left: 0.2rem;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .panel-title img {
    width: 3.15rem;
    height: 3.15rem;
  }

  .panel-title div {
    display: grid;
    gap: 0.08rem;
  }

  .panel-title strong {
    color: var(--color-text);
    font-size: 0.92rem;
    font-weight: 900;
  }

  .quest-panel header button {
    border: 1px solid var(--color-line);
    border-radius: 999px;
    padding: 0.25rem 0.6rem;
    background: rgba(255, 255, 255, 0.76);
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .panel-guide {
    border: 1px solid rgba(255, 255, 255, 0.74);
    border-radius: 16px;
    padding: 0.75rem 0.85rem;
    background:
      radial-gradient(circle at right top, color-mix(in srgb, var(--color-pink) 18%, transparent), transparent 9rem),
      rgba(255, 255, 255, 0.52);
  }

  .panel-guide p {
    margin: 0;
    font-family: var(--font-mono);
    line-height: 1.5;
  }

  .panel-guide span {
    display: block;
    margin-bottom: 0.22rem;
    color: var(--color-muted);
    font-size: 0.72rem;
    font-weight: 850;
  }

  .quest-panel ul {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .quest-panel li {
    border-left: 3px solid color-mix(in srgb, var(--color-blue) 70%, white);
    border-radius: 12px;
    padding: 0.48rem 0.58rem;
    background: rgba(255, 255, 255, 0.58);
    color: var(--color-muted);
    font-size: 0.82rem;
    font-weight: 750;
    line-height: 1.55;
  }

  @media (max-width: 760px) {
    .quest-widget {
      left: auto !important;
      right: 1rem;
      top: auto !important;
      bottom: 1rem;
      width: min(10.5rem, calc(100vw - 2rem));
      touch-action: auto;
    }

    .quest-widget.is-open {
      left: 1rem !important;
      right: 1rem;
      width: auto;
    }

    .quest-tab {
      cursor: pointer;
      justify-content: center;
      min-height: 3.35rem;
      padding: 0.36rem 0.68rem 0.36rem 0.36rem;
    }

    .tab-avatar {
      width: 2.55rem;
      height: 2.55rem;
    }

    .tab-copy strong {
      font-size: 0.8rem;
    }

    .tab-copy small {
      display: none;
    }

    .quest-panel {
      max-height: min(70vh, 24rem);
      overflow: auto;
    }
  }
</style>
