/** 初始魚群與 Boids 參數；距離為 world 單位，速度為 world 單位／秒。 */
export const FISH_PARAMS = {
  count: 60,
  minSpeed: 0.6,
  maxSpeed: 1.8,
  perceptionRadius: 2.0,
  separationRadius: 1.6,
  boundaryAvoidanceRadius: 1.5,
  maxSteeringForce: 2.5, // 以單位質量計，world 單位／秒²。
  maxPitch: 25 * Math.PI / 180, // 以水平面為基準的俯仰上限。
  maxNeighbors: 7, // 對齊／聚合只看最近鄰；分離仍看全部近鄰。
  maxTurnAngle: Math.PI / 6, // 每幀最多 30 度，以弧度表示。
  separationWeight: 5,
  alignmentWeight: 0.9,
  cohesionWeight: 0.06,
  wanderWeight: 1,
  boundaryWeight: 4,
  cursorAvoidanceWeight: 8,
  wanderStrength: 0.65, // world 單位／秒²。
  wanderFrequency: 0.3, // 雜訊時間取樣頻率。
  wanderSeed: 42, // 固定雜訊場；個體差異由帶種子的 phase 決定。
  orientationResponse: 8, // 朝向指數平滑速率，單位 1／秒。
  minScale: 0.6,
  maxScale: 1.4,
} as const;

/** 游標迴避半徑採螢幕正規化座標（0..1）。 */
export const CURSOR_PARAMS = {
  avoidanceRadius: 0.12,
  radius: 0.25,
  opacity: 0.55,
  pressedScale: 1.4,
  transitionDuration: 0.1, // 秒。
  idleEmissive: 0.08,
  pressedEmissive: 0.65,
  rotationSpeed: 0.3, // 弧度／秒。

} as const;

/** 主迴圈的時間步長上限，單位為秒。 */
export const SIMULATION_PARAMS = {
  maxDeltaTime: 1 / 30,
} as const;

/** D5 相機與魚缸範圍；FOV 為度數，位置為 world 單位。 */
export const TANK_PARAMS = {
  cameraFov: 45,
  cameraPosition: { x: 0, y: 0, z: 14 },
  minZ: -8,
  maxZ: 1.5,
  visibleAreaRatio: 0.9,
  // 留白占套用 visibleAreaRatio 後的完整可視高度比例。
  topMarginRatio: 0.05, // 頂部水面。
  bottomMarginRatio: 0.1, // 底部沙地。
} as const;

/** 渲染品質與相機裁切距離。 */
export const RENDER_PARAMS = {
  maxPixelRatio: 2,
  near: 0.1,
  far: 100,
  lookAt: { x: 0, y: 0, z: 0 },
} as const;

export const LIGHTING_PARAMS = {
  hemisphereIntensity: 2,
  directionalIntensity: 2.5,
  directionalPosition: { x: -3, y: 8, z: 5 },
  fogNear: 12,
  fogFar: 40,
} as const;

/** 沙地距離／高度以 world 單位表示。 */
export const SAND_PARAMS = {
  bottomOffset: 0.35,
  heightAmplitude: 0.22,
  noiseFrequency: 0.35,
  widthSegments: 64,
  depthSegments: 48,
  farExtension: 18,
  nearExtension: 5,
  widthPadding: 1.15,
} as const;

export const DECOR_PARAMS = {
  rocks: 12, coral: 10, seaweed: 18,
  sideMin: 0.48, sideMax: 0.9,
  frontMinZ: 0.2, frontMaxZ: 2,
  backMinZ: -8, backMaxZ: -4.5,
  rockMinScale: 0.35, rockMaxScale: 0.8, rockJitter: 0.18,
  coralHeight: 1.1, coralRadius: 0.09, coralSegments: 5,
  coralBranches: 4, coralSpread: 0.5,
  weedMinHeight: 1.1, weedMaxHeight: 2.1, weedWidth: 0.13,
  weedDepth: 0.06, weedSegments: 8, weedAmplitude: 0.18, weedFrequency: 1.1,
} as const;
export const BUBBLE_PARAMS = {
  count: 32, radius: 0.065, minSpeed: 0.35, maxSpeed: 0.7,
  sway: 0.12, frequency: 1.2, surfaceOffset: 0.15, opacity: 0.45,
} as const;
export const CAUSTICS_PARAMS = { intensity: 0.22, scale: 2.8, speed: 0.25, sharpness: 8 } as const;
export const DEBUG_PARAMS = { fpsInterval: 0.5, inset: 8, fontSize: 12 } as const;

export const FISH_RENDER_PARAMS = {
  rings: [ // x、垂直半徑、側向半徑。
    [-0.27, 0.055, 0.035], [-0.16, 0.14, 0.065], [-0.02, 0.19, 0.08],
    [0.13, 0.18, 0.075], [0.27, 0.13, 0.06], [0.39, 0.075, 0.035],
  ],
  ringVertices: 6, headX: 0.5, tailX: -0.32, bodyLength: 1,
  finThickness: 0.012,
  tailFin: [[-0.31, 0, 0], [-0.5, -0.2, 0], [-0.5, 0.2, 0]],
  dorsalFin: [[-0.13, 0.12, 0], [0.03, 0.3, 0], [0.2, 0.15, 0]],
  pectoralFin: [[0.16, -0.02, 0.055], [-0.05, -0.13, 0.2], [-0.1, -0.06, 0.06]],
  baseAmp: 0.075, waveK: 8, minFreq: 3, maxFreq: 7,
  defaultPhase: 0, defaultAmp: 1,
  jitterAmp: 0.06, jitterFreq: 22, jitterSeed: 71,
  wobbleAngle: 0.3, wobbleFreq: 24, panicFreqGain: 3, panicAmpGain: 2,
  poleThreshold: 0.05, yawRate: 6,
} as const;

export const HAND_TRACKER_PARAMS = {
  wasmPath: '/mediapipe/wasm',
  modelPath: '/mediapipe/hand_landmarker.task',
  numHands: 1, width: 640, height: 480, maxHz: 30,
  intervalTolerance: 0.75, // 容忍約 30fps 來源的影格時間抖動。
  statsWindowMs: 1000,
} as const;

export const HAND_PARAMS = {
  pinchEnter: 0.25, pinchExit: 0.40,
  // 30Hz、±0.003 均勻雜訊：標準差約 23%；0.1→0.9/300ms 停住133ms誤差約0.00091。
  minCutoff: 0.5, beta: 5, dCutoff: 1,
  worldScale: 14, // 約0.18m手長映射到2.5 world單位，約視窗高度25%。
  activeArea: 0.7, graceMs: 300, fadeSeconds: 0.3,
  replayJitter: 0.003, replaySeed: 42, replayHz: 30,
} as const;

export const GRAB_PARAMS = {
  grabRadius: 0.08, // 畫面寬度比例；距離 hypot(dx, dy / aspect)。
  holdZ: 2.5, followTimeXY: 0.1, followTimeZ: 0.2,
  fleeSpeedMultiplier: 2, fleeDuration: 2,
  panicRise: 0.1, // 秒，線性到達 1。
} as const;

export const HAND_RENDER_PARAMS = {
  jointScale: 1.12, tipScale: 1.04, wristScale: 1.2,
  boneRadiusRatio: 0.32, thumbRadiusRatio: 0.35, palmThickness: 0.22, renderOrder: 10,
  glowIntensity: 0.8, bubbleCount: 8, bubbleLife: 0.8,
  bubbleRadius: 0.055, bubbleSpeed: 0.8, bubbleSpread: 0.4, bubbleSeed: 83,
} as const;

export const ONBOARDING_PARAMS = {
  noticeSeconds: 5,
  noticeInset: 16, // px，右側與底部邊距；窄螢幕左右各保留同等空間。
  noticePadding: 12,
  noticeRadius: 12,
} as const;
