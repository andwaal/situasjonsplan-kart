import type { WmsLayerConfig } from './config';

export const FKB_URL = 'https://wms.geonorge.no/skwms1/wms.fkb';
export const MATRIKKEL_URL = 'https://wms.geonorge.no/skwms1/wms.matrikkel';

export const FKB_BASE_LAYERS =
  'fkb_vann,fkb_samferdsel,fkb_bygningsmessigeanlegg,fkb_hoydekurver,fkb_presentasjonsdata';

const RESIDENTIAL_BUILDING_TYPES = [
  '111',
  '112',
  '113',
  '121',
  '122',
  '123',
  '124',
  '131',
  '136',
  '141',
  '142',
  '143',
  '144',
  '145',
  '146',
  '152',
  '193',
  '199',
];

const RESIDENTIAL_FILL = '#FF7F00';
const OTHER_BUILDING_FILL = '#f2c94c';

function buildingSld(): string {
  const residentialFilter = `<ogc:Or>${RESIDENTIAL_BUILDING_TYPES.map(
    (code) =>
      '<ogc:PropertyIsEqualTo>' +
      '<ogc:PropertyName>bygningstype</ogc:PropertyName>' +
      `<ogc:Literal>${code}</ogc:Literal>` +
      '</ogc:PropertyIsEqualTo>',
  ).join('')}</ogc:Or>`;
  return (
    '<StyledLayerDescriptor version="1.0.0" ' +
    'xmlns="http://www.opengis.net/sld" ' +
    'xmlns:ogc="http://www.opengis.net/ogc">' +
    '<NamedLayer><Name>bygning</Name><UserStyle><FeatureTypeStyle>' +
    '<Rule><Name>Boligbygg</Name>' +
    `<ogc:Filter>${residentialFilter}</ogc:Filter>` +
    '<PolygonSymbolizer><Fill>' +
    `<CssParameter name="fill">${RESIDENTIAL_FILL}</CssParameter>` +
    '</Fill></PolygonSymbolizer></Rule>' +
    '<Rule><Name>Andre bygg</Name><ElseFilter/>' +
    '<PolygonSymbolizer><Fill>' +
    `<CssParameter name="fill">${OTHER_BUILDING_FILL}</CssParameter>` +
    '</Fill></PolygonSymbolizer></Rule>' +
    '</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>'
  );
}

const ROOF_SLD_TEMPLATE =
  '<StyledLayerDescriptor version="1.0.0" ' +
  'xmlns="http://www.opengis.net/sld" ' +
  'xmlns:ogc="http://www.opengis.net/ogc">' +
  '<NamedLayer><Name>bygningsavgrensning</Name><UserStyle><FeatureTypeStyle>' +
  '<Rule><Name>Mønelinje</Name>' +
  '<ogc:Filter><ogc:PropertyIsEqualTo>' +
  '<ogc:PropertyName>objtype</ogc:PropertyName>' +
  '<ogc:Literal>Mønelinje</ogc:Literal>' +
  '</ogc:PropertyIsEqualTo></ogc:Filter>' +
  '<LineSymbolizer><Stroke>' +
  '<CssParameter name="stroke">#686868</CssParameter>' +
  '<CssParameter name="stroke-width">3.0</CssParameter>' +
  '</Stroke></LineSymbolizer></Rule>' +
  '<Rule><Name>Takriss</Name>' +
  '<ogc:Filter><ogc:Or>' +
  '<ogc:PropertyIsEqualTo><ogc:PropertyName>objtype</ogc:PropertyName>' +
  '<ogc:Literal>Takkant</ogc:Literal></ogc:PropertyIsEqualTo>' +
  '<ogc:PropertyIsEqualTo><ogc:PropertyName>objtype</ogc:PropertyName>' +
  '<ogc:Literal>Takriss</ogc:Literal></ogc:PropertyIsEqualTo>' +
  '</ogc:Or></ogc:Filter>' +
  '<LineSymbolizer><Stroke>' +
  '<CssParameter name="stroke">#010101</CssParameter>' +
  '<CssParameter name="stroke-width">3.0</CssParameter>' +
  '</Stroke></LineSymbolizer></Rule>' +
  '<Rule><Name>Taksprang</Name>' +
  '<ogc:Filter><ogc:PropertyIsEqualTo>' +
  '<ogc:PropertyName>objtype</ogc:PropertyName>' +
  '<ogc:Literal>Taksprang</ogc:Literal>' +
  '</ogc:PropertyIsEqualTo></ogc:Filter>' +
  '<LineSymbolizer><Stroke>' +
  '<CssParameter name="stroke">#010101</CssParameter>' +
  '<CssParameter name="stroke-width">3.0</CssParameter>' +
  '</Stroke></LineSymbolizer></Rule>' +
  '<Rule><Name>Takoverbygg</Name>' +
  '<ogc:Filter><ogc:Or>' +
  '<ogc:PropertyIsEqualTo><ogc:PropertyName>objtype</ogc:PropertyName>' +
  '<ogc:Literal>TakoverbyggKant</ogc:Literal></ogc:PropertyIsEqualTo>' +
  '<ogc:PropertyIsEqualTo><ogc:PropertyName>objtype</ogc:PropertyName>' +
  '<ogc:Literal>Takoverbygg</ogc:Literal></ogc:PropertyIsEqualTo>' +
  '</ogc:Or></ogc:Filter>' +
  '<LineSymbolizer><Stroke>' +
  '<CssParameter name="stroke">#010101</CssParameter>' +
  '<CssParameter name="stroke-width">3.0</CssParameter>' +
  '</Stroke></LineSymbolizer></Rule>' +
  '</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>';

function roofSld(width: number): string {
  return ROOF_SLD_TEMPLATE.replaceAll('3.0', String(width));
}

export const BUILDING_SLD = buildingSld();
export const ROOF_SCREEN_SLD = roofSld(1.1);
export const ROOF_PRINT_SLD = roofSld(3);

export const WMS_LAYERS: WmsLayerConfig[] = [
  {
    id: 'fkb',
    url: FKB_URL,
    layers: FKB_BASE_LAYERS,
    title: 'FKB bakgrunnskart',
    transparent: false,
    attribution: '© Kartverket / Geonorge',
  },
  {
    id: 'bygning',
    url: FKB_URL,
    layers: 'bygning',
    title: 'Bygninger (oransje = bolig, gul = andre)',
    transparent: true,
    sld_body: BUILDING_SLD,
    attribution: '© Kartverket / Geonorge',
  },
  {
    id: 'bygningsavgrensning',
    url: FKB_URL,
    layers: 'bygningsavgrensning',
    title: 'Takriss, mønelinje, taksprang og takoverbygg',
    transparent: true,
    sld_body: ROOF_SCREEN_SLD,
    print_sld_body: ROOF_PRINT_SLD,
    attribution: '© Kartverket / Geonorge',
  },
  {
    id: 'eiendomsgrense',
    url: MATRIKKEL_URL,
    layers: 'eiendomsgrense',
    title: 'Eiendomsgrenser',
    transparent: true,
    attribution: '© Kartverket / Geonorge',
  },
];

export class WmsError extends Error {}

async function fetchWmsLayer(
  layer: WmsLayerConfig,
  bbox: [number, number, number, number],
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: layer.layers,
    styles: '',
    srs: 'EPSG:25833',
    bbox: bbox.map((value) => value.toFixed(3)).join(','),
    width: String(width),
    height: String(height),
    format: 'image/png',
  });
  if (layer.transparent) {
    params.set('transparent', 'true');
  }
  const sld = layer.print_sld_body ?? layer.sld_body;
  if (sld) {
    params.set('SLD_BODY', sld);
  }
  let response: Response;
  try {
    response = await fetch(`${layer.url}?${params}`, { signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }
    throw new WmsError(`Kunne ikke kontakte karttjenesten: ${String(cause)}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.startsWith('image/')) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new WmsError(
      `Karttjenesten svarte ${response.status} (${contentType}): ${detail}`,
    );
  }
  return response.blob();
}

type CompositeCanvas = OffscreenCanvas | HTMLCanvasElement;

function createCompositeCanvas(width: number, height: number): CompositeCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function compositeToPng(canvas: CompositeCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new WmsError('Kunne ikke komponere kartbildet.'));
      }
    }, 'image/png');
  });
}

export async function fetchMapComposite(
  bbox: [number, number, number, number],
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const canvas = createCompositeCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new WmsError('Kunne ikke opprette kartlerret.');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);

  const blobs = await Promise.all(
    WMS_LAYERS.map((layer) =>
      fetchWmsLayer(layer, bbox, width, height, signal),
    ),
  );
  for (const blob of blobs) {
    const bitmap = await createImageBitmap(blob);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
  }

  const png = await compositeToPng(canvas);
  return new Uint8Array(await png.arrayBuffer());
}
