import { writeFile } from 'node:fs/promises';

const ADMIN_URL = 'https://ws.geonorge.no/kommuneinfo/v1/kommuner';
const BRREG_URL =
  'https://data.brreg.no/enhetsregisteret/api/enheter?organisasjonsform=KOMM&size=100&page=';

// Brreg has no website for these; verified against the official domains 2026-11-02.
const WEBSITE_OVERRIDES = {
  '1160': 'https://www.vindafjord.kommune.no/',
  '1508': 'https://www.alesund.kommune.no/',
  '1576': 'https://www.aure.kommune.no/',
  '1578': 'https://www.fjord.kommune.no/',
  '1579': 'https://www.hustadvika.kommune.no/',
  '3205': 'https://www.lillestrom.kommune.no/',
  '3207': 'https://www.nordrefollo.kommune.no/',
  '3911': 'https://www.faerder.kommune.no/',
  '4020': 'https://www.midt-telemark.kommune.no/',
  '4225': 'https://www.lyngdal.kommune.no/',
  '4618': 'https://www.ullensvang.kommune.no/',
  '4626': 'https://www.oygarden.kommune.no/',
  '4631': 'https://www.alver.kommune.no/',
  '4647': 'https://www.sunnfjord.kommune.no/',
  '5057': 'https://www.orland.kommune.no/',
  '5058': 'https://www.afjord.kommune.no/',
  '5530': 'https://www.senja.kommune.no/',
  '5603': 'https://www.hammerfest.kommune.no/',
  '5614': 'https://www.loppa.kommune.no/',
};

function normalizeWebsite(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return withScheme.endsWith('/') ? withScheme : `${withScheme}/`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

const [administrativeUnits, brreg] = await Promise.all([
  fetchJson(ADMIN_URL),
  (async () => {
    const all = [];
    for (let page = 0; page < 20; page += 1) {
      const data = await fetchJson(`${BRREG_URL}${page}`);
      all.push(...(data._embedded?.enheter ?? []));
      if (page + 1 >= data.page.totalPages) break;
    }
    return all;
  })(),
]);

const websites = new Map();
for (const entity of brreg) {
  const number = entity.forretningsadresse?.kommunenummer;
  if (number && entity.hjemmeside) {
    websites.set(number, entity.hjemmeside);
  }
}

const rows = administrativeUnits
  .map((unit) => {
    const number = String(unit.kommunenummer);
    const website = normalizeWebsite(
      WEBSITE_OVERRIDES[number] ?? websites.get(number),
    );
    if (!website) {
      throw new Error(`No website for ${number} ${unit.kommunenavn}`);
    }
    return { nummer: number, navn: unit.kommunenavn, nettside: website };
  })
  .sort((a, b) => a.nummer.localeCompare(b.nummer, 'nb'));

const generated = `${JSON.stringify(rows, null, 2)}\n`;

await writeFile(new URL('../src/kommuner.json', import.meta.url), generated);
console.log(`Wrote ${rows.length} municipalities`);
