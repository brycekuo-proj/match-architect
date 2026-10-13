// 完整版 (full / App edition) content: jobs 11 and up, their reference builds and landmark models.
// The web, itch.io and jam builds resolve this file to levels_web.js instead (see build.mjs), so none of this ships
// there; the web edition only shows these jobs as locked cards.
export const WEB_EDITION = false;
export const FULL_KEYS = ['skytree', 'burj', 'sagrada'];   // landmark models only the full edition carries
export const TEASERS = [];
export const fullLevels = ({ range, row }) => [
  {
    id: 11, key: 'skytree', en: {"name": "Tokyo Skytree", "place": "Tokyo, Japan", "real": "634 m tall", "desc": "The world's tallest broadcasting tower: long and slim.", "hint": "Spread the bottom with many layers of triangles and narrow it as you go up."}, name: '東京晴空塔', place: '日本 · 東京', real: '高 634 公尺', shindo: '6強', par: 64,
    desc: '世界最高的電波塔，又細又長。',
    hint: '底部用很多層三角形撐開，越往上越窄。',
    anchors: range(0, 7), stars: [[3.5, row(9)]],
    sil: [[.1, 0], [.9, 0], [.6, .35], [.57, .6], [.64, .63], [.64, .67], [.56, .7], [.54, .82], [.58, .84], [.54, .86], [.51, 1], [.49, 1], [.46, .86], [.42, .84], [.46, .82], [.44, .7], [.36, .67], [.36, .63], [.43, .6], [.4, .35]],
  },
  {
    id: 12, key: 'burj', en: {"name": "Burj Khalifa", "place": "Dubai, UAE", "real": "about 828 m, the world's tallest", "desc": "The world's tallest building, stepping in level by level like a staircase. Your first level 7 quake!", "hint": "A tall tower needs a very wide, tall base to stay standing."}, name: '杜拜塔', place: '阿聯 · 杜拜', real: '高約 828 公尺，世界最高', shindo: '7', par: 80, biome: 'sand',
    desc: '世界最高的大樓，像階梯一樣一層層往上收。第一次遇到震度 7！',
    hint: '高塔要有很寬很高的底座，地震時才站得穩。',
    anchors: range(0, 8), stars: [[4, row(10)]],
    sil: [[.1, 0], [.9, 0], [.72, .12], [.66, .13], [.64, .3], [.6, .31], [.58, .5], [.55, .51], [.54, .7], [.52, .71], [.505, 1], [.495, 1], [.48, .71], [.46, .7], [.45, .51], [.42, .5], [.4, .31], [.36, .3], [.34, .13], [.28, .12]],
  },
  {
    id: 13, key: 'sagrada', en: {"name": "Sagrada Família", "place": "Barcelona, Spain", "real": "the Tower of Jesus Christ is about 172.5 m", "desc": "The final job! Gaudí's Sagrada Família has a whole row of spires. Keep all five stars up through a level 7 quake.", "hint": "Build the widest base first, then grow the spires out of it one by one."}, name: '聖家堂', place: '西班牙 · 巴塞隆納', real: '最高的耶穌基督塔約 172.5 公尺', shindo: '7', par: 108,
    desc: '最後一關！高第的聖家堂有一整排尖塔。五顆星星都要撐住，撐過震度 7。',
    hint: '先蓋最寬的底座，再從上面長出一根一根尖塔。',
    anchors: range(0, 10), stars: [[5, row(10)], [3.5, row(7)], [6.5, row(7)], [2.5, row(5)], [7.5, row(5)]],
    spires: true,
  },
];
export const fullDesigns = LatticeBuilder => ({
  11: d => { const b = new LatticeBuilder(d); b.pyramid(0, 7, 6); b.column([3, 6], [4, 6], 3.5, 9); },
  12: d => { const b = new LatticeBuilder(d); b.pyramid(0, 8, 7); b.column([3.5, 7], [4.5, 7], 4, 10); },
  13: d => {
    const b = new LatticeBuilder(d); b.pyramid(0, 10, 6);
    b.node(3.5, 7, [3, 6], [4, 6]); b.node(6.5, 7, [6, 6], [7, 6]);
    b.column([4, 6], [5, 6], 5, 10);
  },
});
