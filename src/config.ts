export const PROJECTION_CODE = 'EPSG:25833';

/** Neutral initial view; address search navigates anywhere in Norway. */
export const DEFAULT_CENTER: [number, number] = [598000, 6640000];
export const DEFAULT_RESOLUTION = 0.35;

export type Tool = 'pan' | 'polygon' | 'line' | 'plainline' | 'rectangle' | 'text';
export type Kategori = 'ny' | 'eksisterende' | 'rives' | 'avstand' | 'tekst' | 'linje';
export type LineStyle = 'solid' | 'dashed';

export const KATEGORI_LABELS: Record<Kategori, string> = {
  ny: 'Nytt tiltak',
  eksisterende: 'Eksisterende bygg',
  rives: 'Rives',
  avstand: 'Avstand',
  tekst: 'Tekst',
  linje: 'Linje',
};

export const KATEGORI_COLORS: Record<Kategori, string> = {
  ny: '#ff0000',
  eksisterende: '#000000',
  rives: '#ffff00',
  avstand: '#ff0000',
  tekst: '#111827',
  linje: '#111827',
};

export interface WmsLayerConfig {
  id: string;
  url: string;
  layers: string;
  title: string;
  transparent: boolean;
  attribution: string;
  sld_body?: string;
  print_sld_body?: string;
}

export interface SelectionInfo {
  count: number;
  selectedId: string | null;
  category: Kategori | null;
  kind: 'polygon' | 'line' | 'text' | null;
  name: string | null;
  showSides: boolean;
  showArea: boolean;
  text: string | null;
  textColor: string | null;
  fontSize: number | null;
  lineStyle: LineStyle | null;
  lineColor: string | null;
  lineWidth: number | null;
  arrowStart: boolean | null;
  arrowEnd: boolean | null;
}

export const EMPTY_SELECTION: SelectionInfo = {
  count: 0,
  selectedId: null,
  category: null,
  kind: null,
  name: null,
  showSides: false,
  showArea: false,
  text: null,
  textColor: null,
  fontSize: null,
  lineStyle: null,
  lineColor: null,
  lineWidth: null,
  arrowStart: null,
  arrowEnd: null,
};

export interface SceneObject {
  id: string;
  kind: 'polygon' | 'line' | 'text';
  category: Kategori;
  title: string;
  detail: string;
}

export interface EiendomLabel {
  tekst: string;
  punkt: [number, number];
}

export interface PropertyMetadata {
  adresse: string;
  poststed: string;
  gnr: number;
  bnr: number;
  fnr: number;
  snr: number;
  kommune: string;
  kommunenummer: string;
  distanse: number | null;
}

export interface AddressSuggestion extends PropertyMetadata {
  punkt: [number, number];
}

export interface FormatConfig {
  name: string;
  page_mm: [number, number];
  map_frame_mm: { x: number; y: number; width: number; height: number };
  ground_size_m: [number, number];
  title_block_mm: { x: number; y: number; width: number; height: number };
  title_block_ground_size_m: [number, number];
  dpi: number;
}

export interface AppConfig {
  projection: { code: string; name: string; definition: string };
  scale: number;
  wms_layers: WmsLayerConfig[];
  formats: Record<string, FormatConfig>;
}

export interface PropertyForm {
  gnr: string;
  bnr: string;
  fnr: string;
  snr: string;
  address: string;
  applicant: string;
  date: string;
  municipality: string;
  municipalityNumber: string;
  format: 'A4' | 'A3';
}

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: Record<string, unknown>;
  }>;
};

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function formatMetres(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  return rounded.toLocaleString('nb-NO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatArea(value: number): string {
  return `${formatMetres(value, 1)} m²`;
}

export function fallbackFilename(form: PropertyForm): string {
  const parts = [form.gnr || '0', form.bnr || '0'];
  const fnr = form.fnr.trim();
  const snr = form.snr.trim();
  if (fnr || snr) {
    parts.push(fnr || '0');
  }
  if (snr) {
    parts.push(snr);
  }
  return `Situasjonsplan_${parts.join('-')}.pdf`;
}
