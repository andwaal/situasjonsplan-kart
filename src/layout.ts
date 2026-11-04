import type { FormatConfig } from './config';

export const PT_PER_MM = 72 / 25.4;
export const SCALE = 500;
export const DPI = 300;
export const MARGIN_MM = 10;
export const TITLE_BLOCK_MM: [number, number] = [150, 50];

const A = 6378137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const LON0_DEG = 15;

export type PageFormatName = 'A4' | 'A3';

function pageFormat(name: PageFormatName, page: [number, number]): FormatConfig {
  const [pageWidth, pageHeight] = page;
  const x = MARGIN_MM;
  const y = MARGIN_MM;
  const width = pageWidth - 2 * MARGIN_MM;
  const height = pageHeight - 2 * MARGIN_MM;
  const [blockWidth, blockHeight] = TITLE_BLOCK_MM;
  const groundWidth = (width * SCALE) / 1000;
  const groundHeight = (height * SCALE) / 1000;
  return {
    name,
    page_mm: page,
    map_frame_mm: { x, y, width, height },
    ground_size_m: [groundWidth, groundHeight],
    title_block_mm: {
      x: pageWidth - MARGIN_MM - blockWidth,
      y,
      width: blockWidth,
      height: blockHeight,
    },
    title_block_ground_size_m: [
      (blockWidth * SCALE) / 1000,
      (blockHeight * SCALE) / 1000,
    ],
    dpi: DPI,
  };
}

export const PAGE_FORMATS: Record<PageFormatName, FormatConfig> = {
  A4: pageFormat('A4', [297, 210]),
  A3: pageFormat('A3', [420, 297]),
};

export function extentForCenter(
  center: [number, number],
  pageFormat: FormatConfig,
): [number, number, number, number] {
  const [width, height] = pageFormat.ground_size_m;
  const [cx, cy] = center;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return [cx - halfWidth, cy - halfHeight, cx + halfWidth, cy + halfHeight];
}

export function wmsSizePx(pageFormat: FormatConfig): [number, number] {
  const { width, height } = pageFormat.map_frame_mm;
  return [
    Math.max(1, Math.round((width / 25.4) * pageFormat.dpi)),
    Math.max(1, Math.round((height / 25.4) * pageFormat.dpi)),
  ];
}

export function buildFilename(
  gnr: number,
  bnr: number,
  fnr: number | null,
  snr: number | null,
): string {
  const parts = [String(gnr), String(bnr)];
  if (fnr !== null || snr !== null) {
    parts.push(String(fnr ?? 0));
  }
  if (snr !== null) {
    parts.push(String(snr));
  }
  return `Situasjonsplan_${parts.join('-')}.pdf`;
}

export function utm33Inverse(x: number, y: number): [number, number] {
  const east = x - 500000;
  const m = y / K0;
  const mu =
    m /
    (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const c1 = EP2 * cosPhi1 ** 2;
  const t1 = tanPhi1 ** 2;
  const n1 = A / Math.sqrt(1 - E2 * sinPhi1 ** 2);
  const r1 = (A * (1 - E2)) / (1 - E2 * sinPhi1 ** 2) ** 1.5;
  const d = east / (n1 * K0);
  const phi =
    phi1 -
    ((n1 * tanPhi1) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * EP2) * d ** 4) / 24 +
        ((61 +
          90 * t1 +
          298 * c1 +
          45 * t1 ** 2 -
          252 * EP2 -
          3 * c1 ** 2) *
          d ** 6) /
          720);
  const lam =
    (LON0_DEG * Math.PI) / 180 +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 -
        2 * c1 +
        28 * t1 -
        3 * c1 ** 2 +
        8 * EP2 +
        24 * t1 ** 2) *
        d ** 5) /
        120) /
      cosPhi1;
  return [(phi * 180) / Math.PI, (lam * 180) / Math.PI];
}

export function meridianConvergenceDeg(x: number, y: number): number {
  const [latDeg, lonDeg] = utm33Inverse(x, y);
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const lon0 = (LON0_DEG * Math.PI) / 180;
  return (Math.atan(Math.tan(lon - lon0) * Math.sin(lat)) * 180) / Math.PI;
}
