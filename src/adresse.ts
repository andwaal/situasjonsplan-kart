import type { AddressSuggestion, PropertyMetadata } from './config';
import { fetchTeigLabels } from './matrikkel';

const SEARCH_URL = 'https://ws.geonorge.no/adresser/v1/sok';
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_LIMIT = 50;

const searchCache = new Map<
  string,
  { cachedAt: number; results: AddressSuggestion[] }
>();

export class AdresseError extends Error {}

function asInt(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pointFrom(address: Record<string, unknown>): [number, number] | null {
  const point = address.representasjonspunkt;
  if (!point || typeof point !== 'object') {
    return null;
  }
  const record = point as Record<string, unknown>;
  const epsg = String(record.epsg ?? '').toUpperCase();
  if (epsg && epsg !== 'EPSG:25833') {
    return null;
  }
  const lon = Number(record.lon);
  const lat = Number(record.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }
  return [lon, lat];
}

function parseAddress(address: unknown): PropertyMetadata | null {
  if (!address || typeof address !== 'object') {
    throw new AdresseError('Ugyldig adresseoppføring');
  }
  const record = address as Record<string, unknown>;
  const name = String(record.adressenavn ?? '').trim();
  const number = String(record.nummer ?? '').trim();
  const letter = String(record.bokstav ?? '').trim();
  let addressText = String(record.adressetekst ?? '').trim();
  if (!addressText) {
    addressText = [name, `${number}${letter}`]
      .filter((part) => part.trim())
      .join(' ');
  }
  if (!addressText) {
    return null;
  }
  const postNumber = String(record.postnummer ?? '').trim();
  const postPlace = String(record.poststed ?? '').trim();
  const distanceRaw = Number(record.meterDistanseTilPunkt);
  return {
    adresse: addressText,
    poststed: [postNumber, postPlace].filter(Boolean).join(' '),
    gnr: asInt(record.gardsnummer),
    bnr: asInt(record.bruksnummer),
    fnr: asInt(record.festenummer),
    snr: asInt(record.seksjonsnummer),
    kommune: String(record.kommunenavn ?? '').trim(),
    kommunenummer: String(record.kommunenummer ?? '').trim(),
    distanse: Number.isFinite(distanceRaw) ? distanceRaw : null,
  };
}

async function getJson(
  url: string,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${url}?${params}`, { signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }
    throw new AdresseError(`Kunne ikke kontakte Adresse API: ${String(cause)}`);
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new AdresseError(
      `Adresse API svarte ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }
  if (!payload || typeof payload !== 'object') {
    throw new AdresseError('Ugyldig svar fra Adresse API');
  }
  return payload as Record<string, unknown>;
}

function parseSuggestions(payload: Record<string, unknown>): AddressSuggestion[] {
  const addresses = payload.adresser;
  if (!Array.isArray(addresses)) {
    throw new AdresseError('Ugyldig svar fra Adresse API');
  }
  const results: AddressSuggestion[] = [];
  for (const entry of addresses) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const metadata = parseAddress(entry);
    const point = pointFrom(entry as Record<string, unknown>);
    if (metadata && point) {
      results.push({ ...metadata, punkt: point });
    }
  }
  return results;
}

async function addressByCadastral(
  gnr: number,
  bnr: number,
  ost: number,
  nord: number,
  signal?: AbortSignal,
): Promise<PropertyMetadata | null> {
  const params = new URLSearchParams({
    gardsnummer: String(gnr),
    bruksnummer: String(bnr),
    treffPerSide: '10',
    utkoordsys: '25833',
  });
  const payload = await getJson(SEARCH_URL, params, signal);
  const results = parseSuggestions(payload);
  if (results.length === 0) {
    return null;
  }
  results.sort(
    (a, b) =>
      Math.hypot(a.punkt[0] - ost, a.punkt[1] - nord) -
      Math.hypot(b.punkt[0] - ost, b.punkt[1] - nord),
  );
  const nearest = results[0];
  return {
    adresse: nearest.adresse,
    poststed: nearest.poststed,
    gnr: nearest.gnr,
    bnr: nearest.bnr,
    fnr: nearest.fnr,
    snr: nearest.snr,
    kommune: nearest.kommune,
    kommunenummer: nearest.kommunenummer,
    distanse: nearest.distanse,
  };
}

export async function reverseGeocode(
  ost: number,
  nord: number,
  radius = 15,
  signal?: AbortSignal,
): Promise<PropertyMetadata | null> {
  for (const queryRadius of [1.5, radius, 50]) {
    const labels = await fetchTeigLabels(
      [
        ost - queryRadius,
        nord - queryRadius,
        ost + queryRadius,
        nord + queryRadius,
      ],
      signal,
      false,
    );
    if (labels.length === 0) {
      continue;
    }
    labels.sort(
      (a, b) =>
        Math.hypot(a.punkt[0] - ost, a.punkt[1] - nord) -
        Math.hypot(b.punkt[0] - ost, b.punkt[1] - nord),
    );
    for (const label of labels.slice(0, 3)) {
      const match = /^(\d+)\s*\/\s*(\d+)/.exec(label.tekst);
      if (!match) {
        continue;
      }
      const found = await addressByCadastral(
        Number(match[1]),
        Number(match[2]),
        ost,
        nord,
        signal,
      );
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export async function searchAddresses(
  query: string,
  limit = 5,
  signal?: AbortSignal,
  municipalityNumber = '',
): Promise<AddressSuggestion[]> {
  const term = query.trim();
  if (term.length < 3) {
    return [];
  }
  const municipality = municipalityNumber
    ? municipalityNumber.padStart(4, '0')
    : '';
  const cacheKey = `${municipality}|${limit}|${term.toLocaleLowerCase('nb')}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < SEARCH_CACHE_TTL_MS) {
    return cached.results;
  }

  const params = new URLSearchParams({
    sok: term.endsWith('*') ? term : `${term}*`,
    treffPerSide: String(limit),
    utkoordsys: '25833',
  });
  if (municipality) {
    params.set('kommunenummer', municipality);
  }
  const payload = await getJson(SEARCH_URL, params, signal);
  const results = parseSuggestions(payload);
  searchCache.set(cacheKey, { cachedAt: Date.now(), results });
  while (searchCache.size > SEARCH_CACHE_LIMIT) {
    const oldest = searchCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    searchCache.delete(oldest);
  }
  return results;
}
