/** Cozy 低飽和粉彩；使用 Three.js 可直接接收的 hex 數值。 */
export const PALETTE = {
  hand: { base: 0xdcbda9, joint: 0xeac9b7, glow: 0xffe5b5 },
  water: 0xb3d4d1,
  fog: 0xb3d4d1, // 霧與背景同色，讓遠景自然融入水中。
  sand: 0xe5d7bb,
  rocks: [0xa8b5b4, 0xbab4bf],
  coral: [0xdcaeaa, 0xe4c2aa],
  seaweed: [0xa0bca5, 0xb5c7ad],
  fish: [
    { body: 0xe3b8ad, fins: 0xc99794, belly: 0xf0ddd0 },
    { body: 0xb5c1dc, fins: 0x979fbe, belly: 0xdce1ed },
    { body: 0xdfd09f, fins: 0xbeae82, belly: 0xeee5ca },
  ],
  bubbles: 0xe3f1ee,
  debugText: 0xffffff,
  debugBackground: 0x233b3b,
  cursor: 0xf0e2d5,
  lightSky: 0xffecd9,
  lightGround: 0x91bbb7,
  lightSun: 0xffe5c5,
} as const;
