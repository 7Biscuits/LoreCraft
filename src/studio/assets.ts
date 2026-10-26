/** Original procedural assets. Shared by preview and offline exports; no downloads. */
export const assetLibrary = {
  palettes: {
    forest: { bg: '#102a26', floor: '#1e4034', grid: '#294a3a', wall: '#315947', accent: '#a9efd0', gem: '#b89fff', enemy: '#f5a391', sky: '#162e2c' },
    space: { bg: '#0e152d', floor: '#16213d', grid: '#23304d', wall: '#394563', accent: '#86dcff', gem: '#dfb4ff', enemy: '#ff8f9d', sky: '#0a1020' },
    dungeon: { bg: '#1c1728', floor: '#302a3a', grid: '#3b3446', wall: '#595064', accent: '#d6b5ff', gem: '#f3cc78', enemy: '#ff9e90', sky: '#15121f' },
    ocean: { bg: '#102c3a', floor: '#174555', grid: '#245160', wall: '#36767a', accent: '#9aeee2', gem: '#ffe7b0', enemy: '#f5a8c6', sky: '#102733' },
    neon: { bg: '#17152d', floor: '#27213c', grid: '#382c50', wall: '#514164', accent: '#e4b3ff', gem: '#8ff4dc', enemy: '#ff8cb1', sky: '#111020' },
  },
  sprites: { gem: ['..1..', '.121.', '12221', '.121.', '..1..'] },
  animations: { gem: { rate: 3, amplitude: 3 }, walk: { rate: 10, amplitude: 2 } },
  tiles: { worldUnit: 40, width: 24, height: 14 },
  backgrounds: { decorationCount: 55, tileVariation: 19 },
  sounds: { collect: { frequency: 620, endRatio: 1.5, duration: .12 }, damage: { frequency: 160, endRatio: .7, duration: .12 } },
} as const;
export type AssetLibrary = typeof assetLibrary;
