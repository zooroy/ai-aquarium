import { PALETTE } from '../config/palette';
import { hexColor } from '../drawing/canvas-mapping';

export type MouseButtonMark = 'none' | 'left' | 'right';

const SVG = 'http://www.w3.org/2000/svg';
export const MOUSE_ICON_LABELS: Record<MouseButtonMark, string> = {
  none: '滑鼠，沒有按鍵',
  left: '滑鼠，標示左鍵',
  right: '滑鼠，標示右鍵',
};

/** 64×96 的滑鼠圖示；標示的按鍵填色、外框加粗並加一個圓點，不只靠顏色區分。 */
export function createMouseIcon(mark: MouseButtonMark, doc: Document = document): SVGSVGElement {
  const ink = hexColor(PALETTE.debugBackground);
  const element = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] => {
    const node = doc.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  };
  const svg = element('svg', { viewBox: '0 0 64 96', width: 64, height: 96, role: 'img', 'aria-label': MOUSE_ICON_LABELS[mark] });
  const button = (side: 'left' | 'right') => {
    const marked = mark === side;
    // 左右鍵各占上半部一半，外側圓角跟著滑鼠本體。
    const d = side === 'left' ? 'M32 4 H26 A22 22 0 0 0 4 26 V42 H32 Z' : 'M32 4 H38 A22 22 0 0 1 60 26 V42 H32 Z';
    const path = element('path', { d, fill: marked ? hexColor(PALETTE.guideHighlight) : 'none', stroke: ink, 'stroke-width': marked ? 3 : 1.5, 'stroke-linejoin': 'round', 'data-button': side, 'data-marked': String(marked) });
    svg.append(path);
    if (marked) svg.append(element('circle', { cx: side === 'left' ? 18 : 46, cy: 24, r: 4, fill: ink }));
  };
  svg.append(element('rect', { x: 4, y: 4, width: 56, height: 88, rx: 26, fill: hexColor(PALETTE.sand), stroke: ink, 'stroke-width': 1.5 }));
  button('left'); button('right');
  svg.append(element('rect', { x: 29, y: 14, width: 6, height: 14, rx: 3, fill: ink }));
  return svg;
}
