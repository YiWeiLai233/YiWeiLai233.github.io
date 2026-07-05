<script setup lang="ts">
import { computed, ref } from 'vue';

const tips = [
  {
    label: '档案提示',
    text: '初次访问建议从项目档案开始，它比简历更接近真实的开发记录。'
  },
  {
    label: '写作提示',
    text: '新增日志只需要放一个内容文件，标题、日期和标签写在文件顶部。'
  },
  {
    label: '收藏提示',
    text: '观测收藏用于整理番剧、音乐和游戏碎片，让站点保留更鲜明的个人气息。'
  }
];

const activeIndex = ref(0);
const activeTip = computed(() => tips[activeIndex.value]);

function showNextTip() {
  activeIndex.value = (activeIndex.value + 1) % tips.length;
}
</script>

<template>
  <section class="mascot-tips" aria-label="看板娘提示">
    <div class="tip-head">
      <span>{{ activeTip.label }}</span>
      <button type="button" @click="showNextTip">换一句</button>
    </div>
    <p>{{ activeTip.text }}</p>
    <div class="tip-dots" aria-hidden="true">
      <i
        v-for="(_, index) in tips"
        :key="index"
        :class="{ active: index === activeIndex }"
      />
    </div>
  </section>
</template>

<style scoped>
  .mascot-tips {
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 18px;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.84);
    box-shadow: var(--shadow-card);
    backdrop-filter: blur(16px);
  }

  .tip-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    margin-bottom: 0.55rem;
  }

  span {
    color: var(--color-muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  button {
    border: 1px solid var(--color-line);
    border-radius: 999px;
    padding: 0.25rem 0.55rem;
    background: color-mix(in srgb, var(--color-blue) 18%, white);
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 800;
  }

  button:hover {
    background: color-mix(in srgb, var(--color-pink) 28%, white);
  }

  p {
    margin: 0;
    color: var(--color-text);
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.65;
  }

  .tip-dots {
    display: flex;
    gap: 0.35rem;
    margin-top: 0.7rem;
  }

  i {
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-muted) 28%, transparent);
  }

  i.active {
    width: 1.2rem;
    background: linear-gradient(90deg, var(--color-blue), var(--color-pink));
  }
</style>
