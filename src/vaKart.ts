/**
 * Verified public pages for VA maps, map ordering or cable detection.
 *
 * Keyed by municipality number. Only add a URL after checking that it is
 * public, still resolves, and gives the user a direct route to the VA map,
 * ledningskart or gravemelding. Municipalities not listed fall back to their
 * official homepage in SourceGuide.
 */
export const VA_KART_URLS: Readonly<Record<string, string>> = {
  // Oslo: ordering information for VA maps and drawings.
  '0301':
    'https://www.oslo.kommune.no/vann-og-avlop/kart-og-tegninger/slik-bestiller-du-kart-og-tegninger',
  // Bergen: order water and sewage pipe maps.
  '4601':
    'https://www.bergen.kommune.no/innbyggerhjelpen/vann-vei-og-trafikk/vann-og-avlop/profesjonelle-va-aktorer/bestill-vannog-avlopsledningskart',
  // Trondheim: pipe maps and excavation notice.
  '5001':
    'https://www.trondheim.kommune.no/tema/bygg-kart-og-eiendom/kart/ledningskart/',
  // Bærum: plumber archive and pipe maps.
  '3201':
    'https://www.baerum.kommune.no/tjenester/vann-og-avlop/bygge-og-fornye/rorleggerarkiv-og-ledningskart/',
  // Drammen: map of water and sewage pipes.
  '3301':
    'https://www.drammen.kommune.no/tjenester/vann-avlop/kart-vann-og-avlop/',
  // Sola: VA map.
  '1124':
    'https://www.sola.kommune.no/byggesak-eiendom-og-kart/vann-og-avlop/va-kart/',
  // Levanger: excavation notice and pipe maps.
  '5037':
    'https://www.levanger.kommune.no/tjenester/parkering-veg-vann-avlop-og-avfall/vann-og-avlop/gravemelding-og-ledningskart/',
};

export function vaKartUrl(
  municipalityNumber: string | null | undefined,
): string | undefined {
  return municipalityNumber
    ? VA_KART_URLS[municipalityNumber.padStart(4, '0')]
    : undefined;
}
