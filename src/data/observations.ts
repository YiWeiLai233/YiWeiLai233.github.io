export type ObservationKind = 'anime' | 'game' | 'music' | 'daily';

export interface ObservationItem {
  kind: ObservationKind;
  title: string;
  subtitle: string;
  status: string;
  description: string;
  tags: string[];
  image: string;
  accent: 'blue' | 'pink' | 'cyan' | 'gold';
}

export const observationKinds: Record<ObservationKind, string> = {
  anime: '番剧观测',
  game: '游戏存档',
  music: '音乐循环',
  daily: '日常碎片'
};

export const observations: ObservationItem[] = [
  {
    kind: 'anime',
    title: '番剧观测席',
    subtitle: '记录想补、正在看和值得回味的作品',
    status: '观测中',
    description: '收纳轻松向、日常向和适合休息时观看的作品，并记录角色、片段与观后感。',
    tags: ['番剧', '补番', '观后感'],
    image: '/assets/chibi-wave.png',
    accent: 'pink'
  },
  {
    kind: 'game',
    title: '游戏存档点',
    subtitle: '记录正在推进和想重新打开的游戏',
    status: '存档中',
    description: '记录通关进度、角色养成、截图和游玩感想，形成一份持续更新的游戏档案。',
    tags: ['游戏', '存档', '截图'],
    image: '/assets/chibi-folder.png',
    accent: 'blue'
  },
  {
    kind: 'music',
    title: '夜间循环歌单',
    subtitle: '记录写代码和整理站点时的背景音乐',
    status: '循环中',
    description: '收纳适合写代码、发呆和夜间整理内容时循环播放的音乐，保留当下的氛围记忆。',
    tags: ['音乐', '歌单', '氛围'],
    image: '/assets/chibi-write.png',
    accent: 'cyan'
  },
  {
    kind: 'daily',
    title: '日常碎片匣',
    subtitle: '收纳短句、灵感和生活片段',
    status: '收集中',
    description: '记录短句、灵感、截图和生活片段，让零散日常也能沉淀成可回看的内容。',
    tags: ['日常', '碎片', '随笔'],
    image: '/assets/mini-guide-sticker.png',
    accent: 'gold'
  }
];

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
