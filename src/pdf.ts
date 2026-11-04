import {
  PDFDocument,
  StandardFonts,
  LineCapStyle,
  closePath,
  clip,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';

import type {
  EiendomLabel,
  FormatConfig,
  GeoJsonFeatureCollection,
  PropertyForm,
} from './config';
import {
  buildFilename,
  extentForCenter,
  meridianConvergenceDeg,
  PT_PER_MM,
  SCALE,
} from './layout';

type Point = [number, number];
type Ring = Point[];
type Polygon = Ring[];
type Category = 'ny' | 'eksisterende' | 'rives' | 'avstand' | 'tekst' | 'linje';

const RED = rgb(1, 0, 0);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const YELLOW = rgb(1, 1, 0);
const GRAY = rgb(200 / 255, 200 / 255, 200 / 255);
const PROPERTY_RED = rgb(254 / 255, 1 / 255, 1 / 255);
const HALO = rgb(254 / 255, 254 / 255, 229 / 255);

export class PdfError extends Error {}

const ALIASES: Record<string, Category> = {
  ny: 'ny',
  new: 'ny',
  eksisterende: 'eksisterende',
  existing: 'eksisterende',
  rives: 'rives',
  riv: 'rives',
  demolish: 'rives',
  demolished: 'rives',
  avstand: 'avstand',
  distance: 'avstand',
  tekst: 'tekst',
  text: 'tekst',
  linje: 'linje',
  line: 'linje',
};

function hexToRgb(
  value: string,
  fallback: ReturnType<typeof rgb>,
): ReturnType<typeof rgb> {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    return fallback;
  }
  const hex = match[1];
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function mm(value: number): number {
  return value * PT_PER_MM;
}

function titleCase(value: string): string {
  return value
    .toLocaleLowerCase('nb-NO')
    .replace(
      /(^|[\s-])(\S)/g,
      (_, separator: string, letter: string) =>
        separator + letter.toLocaleUpperCase('nb-NO'),
    );
}

function formatDate(value: string): string {
  const parts = value.split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : value;
}

function asPoint(raw: unknown): Point {
  if (
    !Array.isArray(raw) ||
    raw.length < 2 ||
    !Number.isFinite(Number(raw[0])) ||
    !Number.isFinite(Number(raw[1]))
  ) {
    throw new PdfError(`Ugyldig koordinat: ${JSON.stringify(raw)}`);
  }
  return [Number(raw[0]), Number(raw[1])];
}

function asRing(raw: unknown): Ring {
  if (!Array.isArray(raw) || raw.length < 3) {
    throw new PdfError('Polygonring må ha minst tre punkter');
  }
  const ring = raw.map(asPoint);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }
  return ring;
}

function polygons(geometry: unknown): Polygon[] {
  if (!geometry || typeof geometry !== 'object') {
    throw new PdfError('Geometri må være et GeoJSON-objekt');
  }
  const record = geometry as Record<string, unknown>;
  const type = record.type;
  const coordinates = record.coordinates;
  if (type === 'Polygon') {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      throw new PdfError('Polygon mangler koordinater');
    }
    return [coordinates.map(asRing)];
  }
  if (type === 'MultiPolygon') {
    if (!Array.isArray(coordinates)) {
      throw new PdfError('MultiPolygon mangler koordinater');
    }
    return coordinates
      .filter((polygon): polygon is unknown[] => Array.isArray(polygon) && polygon.length > 0)
      .map((polygon) => polygon.map(asRing));
  }
  throw new PdfError(`Forventet Polygon/MultiPolygon, fikk ${String(type)}`);
}

function lines(geometry: unknown): Point[][] {
  if (!geometry || typeof geometry !== 'object') {
    throw new PdfError('Geometri må være et GeoJSON-objekt');
  }
  const record = geometry as Record<string, unknown>;
  const type = record.type;
  const coordinates = record.coordinates;
  if (type === 'LineString') {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new PdfError('LineString må ha minst to punkter');
    }
    return [coordinates.map(asPoint)];
  }
  if (type === 'MultiLineString') {
    if (!Array.isArray(coordinates)) {
      throw new PdfError('MultiLineString mangler koordinater');
    }
    return coordinates
      .filter((line): line is unknown[] => Array.isArray(line) && line.length >= 2)
      .map((line) => line.map(asPoint));
  }
  throw new PdfError(`Forventet LineString/MultiLineString, fikk ${String(type)}`);
}

function categoryFor(feature: Record<string, unknown>): Category {
  const properties =
    feature.properties && typeof feature.properties === 'object'
      ? (feature.properties as Record<string, unknown>)
      : {};
  const raw = String(properties.kategori ?? properties.type ?? 'ny').toLowerCase();
  const category = ALIASES[raw];
  if (!category) {
    throw new PdfError(
      `Ukjent kategori ${raw}; bruk ny, eksisterende, rives, avstand, tekst eller linje`,
    );
  }
  return category;
}

function features(geojson: GeoJsonFeatureCollection): Array<Record<string, unknown>> {
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new PdfError('GeoJSON må være en FeatureCollection');
  }
  return geojson.features as unknown as Array<Record<string, unknown>>;
}

function pointFromGeometry(geometry: unknown): Point | null {
  if (!geometry || typeof geometry !== 'object') {
    return null;
  }
  const record = geometry as Record<string, unknown>;
  if (record.type !== 'Point' || !Array.isArray(record.coordinates)) {
    return null;
  }
  try {
    return asPoint(record.coordinates);
  } catch {
    return null;
  }
}

function polylineLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
    );
  }
  return length;
}

function pointAlong(points: Point[], fraction: number): Point {
  const target = polylineLength(points) * fraction;
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const segment = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (walked + segment >= target && segment > 0) {
      const t = (target - walked) / segment;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    walked += segment;
  }
  return points[points.length - 1];
}

function fitText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) {
    return normalized;
  }
  let shortened = normalized;
  while (
    shortened &&
    font.widthOfTextAtSize(`${shortened}...`, size) > maxWidth
  ) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}...`;
}

function drawTextCentered(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = RED,
  halo = WHITE,
): void {
  const width = font.widthOfTextAtSize(text, size);
  for (const [dx, dy] of [
    [-0.8, 0],
    [0.8, 0],
    [0, -0.8],
    [0, 0.8],
  ]) {
    page.drawText(text, {
      x: x - width / 2 + dx,
      y: y + dy,
      size,
      font,
      color: halo,
    });
  }
  page.drawText(text, {
    x: x - width / 2,
    y,
    size,
    font,
    color,
  });
}

function rotated(point: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos];
}

interface RenderOptions {
  format: FormatConfig;
  center: [number, number];
  property: PropertyForm;
  geojson: GeoJsonFeatureCollection;
  labels: EiendomLabel[];
  mapPng: Uint8Array;
}

export interface RenderedPdf {
  bytes: Uint8Array;
  filename: string;
}

export async function renderSituasjonsplan({
  format,
  center,
  property,
  geojson,
  labels,
  mapPng,
}: RenderOptions): Promise<RenderedPdf> {
  const gnr = Number(property.gnr);
  const bnr = Number(property.bnr);
  if (!Number.isInteger(gnr) || !Number.isInteger(bnr)) {
    throw new PdfError('Gårdsnummer og bruksnummer må være heltall.');
  }
  const fnr = property.fnr.trim() ? Number(property.fnr) : null;
  const snr = property.snr.trim() ? Number(property.snr) : null;
  if (
    (fnr !== null && !Number.isInteger(fnr)) ||
    (snr !== null && !Number.isInteger(snr))
  ) {
    throw new PdfError('Feste- og seksjonsnummer må være heltall.');
  }

  const extent = extentForCenter(center, format);

  const document = await PDFDocument.create();
  document.setTitle(`Situasjonsplan ${gnr}-${bnr}`);
  document.setAuthor(property.applicant || '—');
  document.setCreator('Situasjonskart');
  const municipality = titleCase(property.municipality || '');
  document.setSubject(
    `Situasjonsplan for byggesøknad${
      municipality ? `, ${municipality} kommune` : ''
    }`,
  );

  const pageWidth = mm(format.page_mm[0]);
  const pageHeight = mm(format.page_mm[1]);
  const page = document.addPage([pageWidth, pageHeight]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const image = await document.embedPng(mapPng);

  const { x: mapXmm, y: mapYmm, width: mapWidthMm, height: mapHeightMm } =
    format.map_frame_mm;
  const mapX = mm(mapXmm);
  const mapY = mm(mapYmm);
  const mapWidth = mm(mapWidthMm);
  const mapHeight = mm(mapHeightMm);
  const [minX, minY, maxX] = extent;
  const scale = mapWidth / (maxX - minX);
  const toPage = (point: Point): Point => [
    mapX + (point[0] - minX) * scale,
    mapY + (point[1] - minY) * scale,
  ];

  page.drawImage(image, {
    x: mapX,
    y: mapY,
    width: mapWidth,
    height: mapHeight,
  });

  page.pushOperators(
    pushGraphicsState(),
    moveTo(mapX, mapY),
    lineTo(mapX + mapWidth, mapY),
    lineTo(mapX + mapWidth, mapY + mapHeight),
    lineTo(mapX, mapY + mapHeight),
    closePath(),
    clip(),
    endPath(),
  );

  const drawPath = (path: string, options: Parameters<PDFPage['drawSvgPath']>[1]) => {
    page.drawSvgPath(path, { x: 0, y: pageHeight, ...options });
  };

  const polygonPath = (polygon: Polygon): string => {
    let path = '';
    for (const ring of polygon) {
      const points = ring.map(toPage);
      if (points.length === 0) continue;
      path += `M ${points[0][0]} ${pageHeight - points[0][1]} `;
      for (const point of points.slice(1)) {
        path += `L ${point[0]} ${pageHeight - point[1]} `;
      }
      path += 'Z ';
    }
    return path;
  };

  const drawPolygon = (polygon: Polygon, category: Category) => {
    const path = polygonPath(polygon);
    if (category === 'ny') {
      drawPath(path, {
        borderWidth: 2,
        borderColor: RED,
        color: RED,
        opacity: 0.3,
      });
    } else if (category === 'eksisterende') {
      drawPath(path, {
        borderWidth: 1,
        borderColor: BLACK,
        color: GRAY,
        opacity: 0.5,
      });
    } else {
      drawPath(path, {
        borderWidth: 2,
        borderColor: YELLOW,
        borderDashArray: [5, 3],
      });
    }
  };

  const fillTriangle = (points: Point[], color = RED) => {
    const path = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${pageHeight - point[1]}`)
      .join(' ');
    drawPath(`${path} Z`, {
      borderWidth: 0.6,
      borderColor: color,
      color,
    });
  };

  const drawArrow = (
    tip: Point,
    ux: number,
    uy: number,
    length: number,
    halfWidth: number,
    color = RED,
  ) => {
    const baseX = tip[0] - ux * length;
    const baseY = tip[1] - uy * length;
    const perpX = -uy * halfWidth;
    const perpY = ux * halfWidth;
    fillTriangle(
      [
        tip,
        [baseX + perpX, baseY + perpY],
        [baseX - perpX, baseY - perpY],
      ],
      color,
    );
  };

  const drawLine = (points: Point[], label: string) => {
    const pagePoints = points.map(toPage);
    for (let index = 1; index < pagePoints.length; index += 1) {
      page.drawLine({
        start: { x: pagePoints[index - 1][0], y: pagePoints[index - 1][1] },
        end: { x: pagePoints[index][0], y: pagePoints[index][1] },
        thickness: 1.3,
        color: RED,
        lineCap: LineCapStyle.Round,
      });
    }
    const start = pagePoints[0];
    const end = pagePoints[pagePoints.length - 1];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    let ux = 1;
    let uy = 0;
    if (length > 1) {
      ux = (end[0] - start[0]) / length;
      uy = (end[1] - start[1]) / length;
      const arrowLength = Math.min(6, length * 0.35);
      const halfWidth = arrowLength * 0.45;
      drawArrow(start, -ux, -uy, arrowLength, halfWidth);
      drawArrow(end, ux, uy, arrowLength, halfWidth);
    }

    const midpoint = toPage(pointAlong(points, 0.5));
    let normalX = -uy;
    let normalY = ux;
    if (normalY < 0) {
      normalX = -normalX;
      normalY = -normalY;
    }
    drawTextCentered(
      page,
      label,
      midpoint[0] + normalX * 8,
      midpoint[1] + normalY * 8,
      bold,
      7.5,
    );
  };

  const drawPointerLine = (
    points: Point[],
    style: string,
    arrowStart: boolean,
    arrowEnd: boolean,
    color: ReturnType<typeof rgb>,
    width: number,
  ) => {
    const pagePoints = points.map(toPage);
    for (let index = 1; index < pagePoints.length; index += 1) {
      page.drawLine({
        start: { x: pagePoints[index - 1][0], y: pagePoints[index - 1][1] },
        end: { x: pagePoints[index][0], y: pagePoints[index][1] },
        thickness: width,
        color,
        dashArray: style === 'dashed' ? [5, 3] : [],
        lineCap: LineCapStyle.Round,
      });
    }
    const start = pagePoints[0];
    const end = pagePoints[pagePoints.length - 1];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length <= 1) {
      return;
    }
    const ux = (end[0] - start[0]) / length;
    const uy = (end[1] - start[1]) / length;
    const arrowLength = Math.min(
      Math.max(4, width * 2.5),
      length * 0.4,
    );
    const halfWidth = arrowLength * 0.45;
    if (arrowStart) {
      drawArrow(start, -ux, -uy, arrowLength, halfWidth, color);
    }
    if (arrowEnd) {
      drawArrow(end, ux, uy, arrowLength, halfWidth, color);
    }
  };

  for (const feature of features(geojson)) {
    const category = categoryFor(feature);
    const geometry = feature.geometry;
    if (category === 'tekst') {
      const point = pointFromGeometry(geometry);
      const properties =
        feature.properties && typeof feature.properties === 'object'
          ? (feature.properties as Record<string, unknown>)
          : {};
      const text = String(properties.tekst ?? '').trim();
      if (point && text) {
        const [x, y] = toPage(point);
        const fontSize = Math.max(
          6,
          Math.min(72, Number(properties.fontSize) || 14),
        );
        const textColor = hexToRgb(
          String(properties.textColor ?? ''),
          BLACK,
        );
        drawTextCentered(page, text, x, y, bold, fontSize, textColor);
      }
    } else if (category === 'avstand') {
      for (const line of lines(geometry)) {
        drawLine(line, `${polylineLength(line).toFixed(1).replace('.', ',')} m`);
      }
    } else if (category === 'linje') {
      const properties =
        feature.properties && typeof feature.properties === 'object'
          ? (feature.properties as Record<string, unknown>)
          : {};
      const lineColor = hexToRgb(
        String(properties.lineColor ?? ''),
        BLACK,
      );
      const lineWidth = Math.max(
        1,
        Math.min(8, Number(properties.lineWidth) || 2),
      );
      for (const line of lines(geometry)) {
        drawPointerLine(
          line,
          String(properties.lineStyle ?? 'solid'),
          properties.arrowStart === true,
          properties.arrowEnd !== false,
          lineColor,
          lineWidth,
        );
      }
    } else {
      for (const polygon of polygons(geometry)) {
        drawPolygon(polygon, category);
      }
    }
  }

  for (const label of labels) {
    const [x, y] = toPage(label.punkt);
    drawTextCentered(page, label.tekst, x, y, bold, 8, PROPERTY_RED, HALO);
  }

  page.pushOperators(popGraphicsState());

  page.drawRectangle({
    x: mapX,
    y: mapY,
    width: mapWidth,
    height: mapHeight,
    borderWidth: 0.8,
    borderColor: rgb(0.2, 0.2, 0.2),
  });

  drawNorthArrow(page, format, center, mapX, mapY, mapWidth, mapHeight, bold);
  drawTitleBlock(page, format, property, font, bold);

  return {
    bytes: await document.save(),
    filename: buildFilename(gnr, bnr, fnr, snr),
  };
}

function drawNorthArrow(
  page: PDFPage,
  format: FormatConfig,
  center: [number, number],
  mapX: number,
  mapY: number,
  mapWidth: number,
  mapHeight: number,
  font: PDFFont,
): void {
  const cx = mapX + mapWidth - mm(18);
  const cy = mapY + mapHeight - mm(24);
  const pageHeight = format.page_mm[1] * PT_PER_MM;
  const rotation = meridianConvergenceDeg(center[0], center[1]);
  page.drawCircle({
    x: cx,
    y: cy,
    size: mm(10),
    color: WHITE,
    opacity: 0.85,
    borderColor: BLACK,
    borderWidth: 0.8,
  });

  const points: Point[] = [
    [0, mm(7.5)],
    [-mm(3.7), -mm(6.2)],
    [0, -mm(3.2)],
    [mm(3.7), -mm(6.2)],
  ].map(([x, y]) => {
    const [rx, ry] = rotated([x, y], rotation);
    return [cx + rx, cy + ry];
  });
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point[0]} ${pageHeight - point[1]}`,
    )
    .join(' ');
  page.drawSvgPath(`${path} Z`, {
    x: 0,
    y: format.page_mm[1] * PT_PER_MM,
    borderWidth: 0.7,
    borderColor: BLACK,
    color: BLACK,
  });
  const [nx, ny] = rotated([0, mm(9.4)], rotation);
  page.drawText('N', {
    x: cx + nx - font.widthOfTextAtSize('N', 9) / 2,
    y: cy + ny - 4.5,
    size: 9,
    font,
    color: BLACK,
  });
}

function drawTitleBlock(
  page: PDFPage,
  format: FormatConfig,
  property: PropertyForm,
  font: PDFFont,
  bold: PDFFont,
): void {
  const { x: xmm, y: ymm, width: widthMm, height: heightMm } =
    format.title_block_mm;
  const x = mm(xmm);
  const y = mm(ymm);
  const width = mm(widthMm);
  const height = mm(heightMm);
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: WHITE,
    borderColor: BLACK,
    borderWidth: 0.4,
  });

  const pad = mm(4);
  const right = x + width - pad;
  const top = y + height - pad;
  const municipality = property.municipality
    ? titleCase(property.municipality)
    : '—';

  page.drawText('SITUASJONSPLAN', {
    x: x + pad,
    y: top - mm(9.5),
    size: 12.5,
    font: bold,
    color: BLACK,
  });
  page.drawText(`MÅLESTOKK 1:${SCALE}`, {
    x: right - bold.widthOfTextAtSize(`MÅLESTOKK 1:${SCALE}`, 11),
    y: top - mm(9.5),
    size: 11,
    font: bold,
    color: BLACK,
  });
  page.drawText(
    municipality === '—' ? municipality : `${municipality} kommune`,
    {
      x: x + pad,
      y: top - mm(15),
      size: 8,
      font,
      color: BLACK,
    },
  );
  const formatLabel = `${format.name}-format`;
  page.drawText(formatLabel, {
    x: right - font.widthOfTextAtSize(formatLabel, 8),
    y: top - mm(15),
    size: 8,
    font,
    color: BLACK,
  });
  page.drawLine({
    start: { x: x + pad, y: top - mm(18) },
    end: { x: right, y: top - mm(18) },
    thickness: 0.6,
    color: BLACK,
  });

  const labelX = x + pad;
  const valueX = labelX + mm(16);
  const valueMax = right - valueX;
  const drawField = (
    label: string,
    value: string,
    baseline: number,
    fieldLabelX = labelX,
    fieldValueX = valueX,
    maxWidth = valueMax,
  ) => {
    page.drawText(label, {
      x: fieldLabelX,
      y: baseline,
      size: 7.2,
      font,
      color: rgb(68 / 255, 68 / 255, 68 / 255),
    });
    page.drawText(fitText(value, bold, 8.2, maxWidth), {
      x: fieldValueX,
      y: baseline,
      size: 8.2,
      font: bold,
      color: BLACK,
    });
  };

  drawField('EIENDOM', property.address, y + mm(25));
  drawField('GNR./BNR.', `${property.gnr} / ${property.bnr}`, y + mm(19));
  const fnr = property.fnr.trim();
  const snr = property.snr.trim();
  if (fnr || snr) {
    const rightLabelX = x + width / 2 + mm(2);
    const rightValueX = rightLabelX + mm(17);
    drawField(
      'FNR./SNR.',
      snr ? `${fnr || '0'} / ${snr}` : fnr || '0',
      y + mm(19),
      rightLabelX,
      rightValueX,
      right - rightValueX,
    );
  }
  drawField('SØKER', property.applicant || '—', y + mm(13));
  drawField('DATO', formatDate(property.date), y + mm(7));

  page.drawText(
    'Koordinatsystem: ETRS89 / UTM sone 33N (EPSG:25833). ' +
      `Målestokk 1:${SCALE} i projeksjonsplanet.`,
    {
      x: x + pad,
      y: y + mm(2.6),
      size: 5.6,
      font,
      color: rgb(85 / 255, 85 / 255, 85 / 255),
    },
  );
}
