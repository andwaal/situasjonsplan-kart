import type { EiendomLabel } from './config';

const WFS_URL =
  'https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig';
const MAX_LABELS = 500;

export class MatrikkelError extends Error {}

function childText(element: Element, name: string): string | null {
  for (const child of Array.from(element.children)) {
    if (child.localName === name) {
      const value = (child.textContent ?? '').trim();
      if (value) {
        return value;
      }
    }
  }
  return null;
}

function pointFrom(element: Element): [number, number] | null {
  for (const descendant of Array.from(
    element.querySelectorAll('pos, coordinates'),
  )) {
    const parts = (descendant.textContent ?? '').replace(/,/g, ' ').split(/\s+/);
    if (parts.length >= 2) {
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return [x, y];
      }
    }
  }
  return null;
}

export function parseTeigLabels(
  xml: string,
  bbox?: [number, number, number, number],
  filterByPoint = true,
): EiendomLabel[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  for (const element of Array.from(document.getElementsByTagName('*'))) {
    if (element.localName === 'parsererror') {
      throw new MatrikkelError('Ugyldig GML fra Matrikkel WFS');
    }
    if (
      element.localName === 'ExceptionReport' ||
      element.localName === 'ServiceException'
    ) {
      const detail = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
      throw new MatrikkelError(
        `Matrikkel WFS-feil: ${detail || 'ukjent feil'}`,
      );
    }
  }

  const labels: EiendomLabel[] = [];
  const seen = new Set<string>();
  for (const teig of Array.from(document.getElementsByTagName('*'))) {
    if (teig.localName !== 'Teig') {
      continue;
    }
    let text = childText(teig, 'matrikkelnummerTekst');
    if (!text) {
      const gnr = childText(teig, 'gardsnummer');
      const bnr = childText(teig, 'bruksnummer');
      if (gnr && bnr) {
        text = `${gnr}/${bnr}`;
      }
    }
    if (!text) {
      continue;
    }
    let point: [number, number] | null = null;
    for (const child of Array.from(teig.children)) {
      if (child.localName === 'representasjonspunkt') {
        point = pointFrom(child);
        break;
      }
    }
    if (!point) {
      continue;
    }
    const [x, y] = point;
    if (bbox && filterByPoint) {
      const [minx, miny, maxx, maxy] = bbox;
      if (x < minx || x > maxx || y < miny || y > maxy) {
        continue;
      }
    }
    const key = `${text}:${Math.round(x * 100)}:${Math.round(y * 100)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push({ tekst: text, punkt: point });
    if (labels.length >= MAX_LABELS) {
      break;
    }
  }
  return labels;
}

export async function fetchTeigLabels(
  bbox: [number, number, number, number],
  signal?: AbortSignal,
  filterByPoint = true,
): Promise<EiendomLabel[]> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'app:Teig',
    bbox: `${bbox.map((value) => value.toFixed(3)).join(',')},EPSG:25833`,
    srsName: 'EPSG:25833',
    count: String(MAX_LABELS),
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${WFS_URL}?${params}`, { signal });
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok || !contentType.includes('xml')) {
        const detail = (await response.text().catch(() => '')).slice(0, 300);
        throw new MatrikkelError(
          `Matrikkel WFS svarte ${response.status} (${contentType}): ${detail}`,
        );
      }
      return parseTeigLabels(await response.text(), bbox, filterByPoint);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        throw cause;
      }
      lastError = cause;
    }
  }
  throw new MatrikkelError(
    `Kunne ikke kontakte Matrikkel WFS: ${String(lastError)}`,
  );
}
