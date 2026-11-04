import { KOMMUNER, type Kommune } from './kommuner';

const KOMMUNEINFO_URL = 'https://ws.geonorge.no/kommuneinfo/v1/kommuner';
const LOCAL_URL = `${import.meta.env.BASE_URL}kommune.json`;
const WEBSITES = new Map(
  KOMMUNER.map((kommune) => [kommune.nummer, kommune.nettside]),
);

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function parseRows(
  payload: unknown,
  websites: ReadonlyMap<string, string>,
): Kommune[] {
  if (!Array.isArray(payload)) {
    throw new Error('Ugyldig kommuneliste');
  }

  const rows = payload.flatMap((entry): Kommune[] => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const nummer = (text(record.kommunenummer) || text(record.nummer)).padStart(
      4,
      '0',
    );
    const navn =
      text(record.kommunenavn) ||
      text(record.kommunenavnNorsk) ||
      text(record.navn);
    if (!/^\d{4}$/.test(nummer) || !navn) {
      return [];
    }
    const nettside = text(record.nettside) || websites.get(nummer) || '';
    return [{ nummer, navn, nettside }];
  });

  if (rows.length === 0) {
    throw new Error('Tom kommuneliste');
  }
  return rows;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Kommuneliste svarte ${response.status}`);
  }
  return response.json();
}

export async function fetchLocalKommuner(
  signal?: AbortSignal,
): Promise<Kommune[]> {
  return parseRows(await fetchJson(LOCAL_URL, signal), WEBSITES);
}

export async function fetchKommuner(
  signal?: AbortSignal,
): Promise<Kommune[]> {
  return parseRows(await fetchJson(KOMMUNEINFO_URL, signal), WEBSITES);
}

export function mergeKommunerWebsites(
  rows: Kommune[],
  previous: readonly Kommune[],
): Kommune[] {
  const websites = new Map(previous.map((row) => [row.nummer, row.nettside]));
  return rows.map((row) =>
    row.nettside
      ? row
      : { ...row, nettside: websites.get(row.nummer) ?? '' },
  );
}

export function kommunerEqual(
  left: readonly Kommune[],
  right: readonly Kommune[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sort = (rows: readonly Kommune[]) =>
    [...rows].sort(
      (a, b) =>
        a.nummer.localeCompare(b.nummer, 'nb') ||
        a.navn.localeCompare(b.navn, 'nb'),
    );
  const a = sort(left);
  const b = sort(right);
  return a.every(
    (row, index) =>
      row.nummer === b[index].nummer && row.navn === b[index].navn,
  );
}
