/** Edit SVG paint values, preserving paths, symbols, opacity, and aspect ratio. */
const HEX = /^#[0-9a-f]{6}$/i;
const PAINT = ['fill', 'stroke', 'stop-color'] as const;
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'text', 'tspan', 'use']);
let colorContext: CanvasRenderingContext2D | null = null;

function hexColor(value: string): string | null {
  value = value.trim().toLowerCase();
  if (HEX.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) return '#' + [...value.slice(1)].map((letter) => letter + letter).join('');
  if (!value || ['none', 'transparent', 'inherit', 'currentcolor'].includes(value) || value.startsWith('url(')) return null;
  colorContext ??= document.createElement('canvas').getContext('2d');
  if (!colorContext) return null;
  // Two sentinel values distinguish invalid CSS from a valid matching colour.
  colorContext.fillStyle = '#010203'; colorContext.fillStyle = value;
  const first = colorContext.fillStyle;
  colorContext.fillStyle = '#040506'; colorContext.fillStyle = value;
  return first === colorContext.fillStyle && HEX.test(first) ? first.toLowerCase() : null;
}

function parse(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('This flag SVG could not be read.');
  return doc.documentElement as unknown as SVGSVGElement;
}

function paint(element: SVGElement, property: typeof PAINT[number], fallback: string): string {
  const value = element.style.getPropertyValue(property) || element.getAttribute(property);
  return !value || value === 'inherit' ? fallback : value;
}

export function extractFlagPalette(svg: string): string[] {
  const palette = new Set<string>();
  const add = (value: string) => { const color = hexColor(value); if (color) palette.add(color); };
  function visit(element: SVGElement, fill = '#000000', stroke = 'none') {
    fill = paint(element, 'fill', fill); stroke = paint(element, 'stroke', stroke);
    if (SHAPES.has(element.localName)) add(fill);
    if (SHAPES.has(element.localName) || element.localName === 'line') add(stroke);
    if (element.localName === 'stop') add(paint(element, 'stop-color', '#000000'));
    for (const child of element.children) visit(child as SVGElement, fill, stroke);
  }
  visit(parse(svg));
  return [...palette].slice(0, 32);
}

export function recolorFlagSvg(svg: string, overrides: Record<string, string>): string {
  if (!Object.keys(overrides).length) return svg;
  const root = parse(svg);
  const replacement = (value: string): string | null => {
    const color = hexColor(value);
    const target = color ? overrides[color] : undefined;
    return target && HEX.test(target) ? target : null;
  };
  // SVG's implicit fill is black. Making it explicit lets that colour be edited too.
  if (!root.hasAttribute('fill') && !root.style.getPropertyValue('fill')) root.setAttribute('fill', '#000000');
  for (const element of [root, ...root.querySelectorAll<SVGElement>('*')]) {
    for (const property of PAINT) {
      const attribute = element.getAttribute(property);
      if (attribute) { const next = replacement(attribute); if (next) element.setAttribute(property, next); }
      const style = element.style.getPropertyValue(property);
      if (style) { const next = replacement(style); if (next) element.style.setProperty(property, next); }
    }
  }
  return new XMLSerializer().serializeToString(root);
}
