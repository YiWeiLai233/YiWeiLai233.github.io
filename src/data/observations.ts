export type ObservationKind = 'anime' | 'game' | 'music' | 'daily';
export type ObservationStatus = 'planned' | 'ongoing' | 'finished' | 'dropped';

/** 观测区四个分类：名称、说明、配色、吉祥物。 */
export interface ObservationKindMeta {
  label: string;
  short: string;
  description: string;
  accent: 'blue' | 'pink' | 'cyan' | 'gold';
  image: string;
  /** 状态文案随分类变化：番剧是「在看」，游戏是「在玩」 */
  statusLabels: Record<ObservationStatus, string>;
  /** 完成态用词：番剧用「看完」，游戏用「通关」 */
  finishedLabel: string;
}

export const observationKinds: Record<ObservationKind, ObservationKindMeta> = {
  anime: {
    label: '番剧观测',
    short: '番剧',
    description: '想补的、在看的和值得回味的作品，记录角色、片段与观后感。',
    accent: 'pink',
    image: '/assets/chibi-wave.webp',
    statusLabels: { planned: '想看', ongoing: '在看', finished: '看完', dropped: '搁置' },
    finishedLabel: '看完'
  },
  game: {
    label: '游戏存档',
    short: '游戏',
    description: '正在推进和想重新打开的游戏，记录进度、养成与截图。',
    accent: 'blue',
    image: '/assets/chibi-folder.webp',
    statusLabels: { planned: '想玩', ongoing: '在玩', finished: '通关', dropped: '吃灰' },
    finishedLabel: '通关'
  },
  music: {
    label: '音乐循环',
    short: '音乐',
    description: '写代码和整理站点时循环播放的音乐，保留当下的氛围记忆。',
    accent: 'cyan',
    image: '/assets/chibi-write.webp',
    statusLabels: { planned: '收藏', ongoing: '循环中', finished: '听腻了', dropped: '归档' },
    finishedLabel: '循环中'
  },
  daily: {
    label: '日常碎片',
    short: '日常',
    description: '短句、灵感、截图和生活片段，让零散日常也能沉淀下来。',
    accent: 'gold',
    image: '/assets/mini-guide-sticker.webp',
    statusLabels: { planned: '记下', ongoing: '收集中', finished: '已归档', dropped: '放弃' },
    finishedLabel: '已归档'
  }
};

/** 分类在页面上的固定展示顺序 */
export const observationKindOrder: ObservationKind[] = ['anime', 'game', 'music', 'daily'];

export const theaterLines = [
  '今天巡一下项目档案，还是整理一段观测收藏？',
  '短句也值得归档，持续记录会让站点更像个人档案。',
  '番剧、游戏和音乐同样属于未来观测站的内容版图。'
];

export const stationStatus = [
  { label: '项目观测', value: '持续维护' },
  { label: '日志记录', value: '按期归档' },
  { label: '观测收藏', value: '稳定收纳' }
];
