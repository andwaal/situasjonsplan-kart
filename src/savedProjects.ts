import type { GeoJsonFeatureCollection, PropertyForm } from './config';

export interface SavedProjectSummary {
  id: string;
  address: string;
  municipality: string;
  municipalityNumber: string;
  gnr: string;
  bnr: string;
  updatedAt: number;
  stepIndex: number;
  center: [number, number];
  form: PropertyForm;
}

export interface SavedProject extends SavedProjectSummary {
  geojson: GeoJsonFeatureCollection;
}

const INDEX_KEY = 'situasjonskart.projects.v2.index';
const GEOMETRY_PREFIX = 'situasjonskart.projects.v2.geometry.';
const LEGACY_KEY = 'situasjonskart.projects.v1';
const MAX_PROJECTS = 8;

export function projectIdFor(form: PropertyForm): string {
  return [
    form.municipalityNumber,
    form.gnr,
    form.bnr,
    form.fnr,
    form.snr,
    form.address,
  ]
    .join('|')
    .toLocaleLowerCase('nb-NO');
}

function validCenter(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((part) => Number.isFinite(Number(part)))
  );
}

function normalizeForm(value: unknown): PropertyForm | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const form = value as Record<string, unknown>;
  const address = String(form.address ?? '').trim();
  if (!address) {
    return null;
  }
  return {
    gnr: String(form.gnr ?? ''),
    bnr: String(form.bnr ?? ''),
    fnr: String(form.fnr ?? ''),
    snr: String(form.snr ?? ''),
    address,
    applicant: String(form.applicant ?? ''),
    date: String(form.date ?? ''),
    municipality: String(form.municipality ?? ''),
    municipalityNumber: String(form.municipalityNumber ?? ''),
    format: form.format === 'A3' ? 'A3' : 'A4',
  };
}

function normalizeGeoJson(value: unknown): GeoJsonFeatureCollection | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.type !== 'FeatureCollection' || !Array.isArray(record.features)) {
    return null;
  }
  return value as GeoJsonFeatureCollection;
}

function summarize(
  project: SavedProject | SavedProjectSummary,
): SavedProjectSummary {
  return {
    id: project.id,
    address: project.address,
    municipality: project.municipality,
    municipalityNumber: project.municipalityNumber,
    gnr: project.gnr,
    bnr: project.bnr,
    updatedAt: project.updatedAt,
    stepIndex: project.stepIndex,
    center: project.center,
    form: project.form,
  };
}

function parseSummary(value: unknown): SavedProjectSummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const form = normalizeForm(record.form);
  if (
    !form ||
    typeof record.id !== 'string' ||
    !validCenter(record.center)
  ) {
    return null;
  }
  return {
    id: record.id,
    address: form.address,
    municipality: form.municipality,
    municipalityNumber: form.municipalityNumber,
    gnr: form.gnr,
    bnr: form.bnr,
    updatedAt: Number(record.updatedAt) || 0,
    stepIndex: Math.max(0, Math.min(5, Number(record.stepIndex) || 0)),
    center: record.center,
    form,
  };
}

function parseStoredProject(value: unknown): SavedProject | null {
  const summary = parseSummary(value);
  if (!summary || !value || typeof value !== 'object') {
    return null;
  }
  const geojson = normalizeGeoJson((value as Record<string, unknown>).geojson);
  return geojson ? { ...summary, geojson } : null;
}

function sortAndLimit(projects: SavedProjectSummary[]): SavedProjectSummary[] {
  return [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_PROJECTS);
}

function readIndex(): SavedProjectSummary[] | null {
  const raw = window.localStorage.getItem(INDEX_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return sortAndLimit(
      parsed
        .map(parseSummary)
        .filter((entry): entry is SavedProjectSummary => entry !== null),
    );
  } catch {
    return null;
  }
}

function writeIndex(projects: SavedProjectSummary[]): void {
  window.localStorage.setItem(
    INDEX_KEY,
    JSON.stringify(projects.map(summarize)),
  );
}

function readLegacyProjects(): SavedProject[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(parseStoredProject)
      .filter((entry): entry is SavedProject => entry !== null)
      .slice(0, MAX_PROJECTS);
  } catch {
    return [];
  }
}

function migrateLegacyProjects(): SavedProjectSummary[] {
  const legacy = readLegacyProjects();
  if (legacy.length === 0) {
    return [];
  }
  try {
    for (const project of legacy) {
      window.localStorage.setItem(
        `${GEOMETRY_PREFIX}${project.id}`,
        JSON.stringify(project.geojson),
      );
    }
    const summaries = sortAndLimit(legacy.map(summarize));
    writeIndex(summaries);
    window.localStorage.removeItem(LEGACY_KEY);
    return summaries;
  } catch {
    return sortAndLimit(legacy.map(summarize));
  }
}

export function loadSavedProjects(): SavedProjectSummary[] {
  try {
    const indexed = readIndex();
    return indexed ?? migrateLegacyProjects();
  } catch {
    return [];
  }
}

export function loadSavedProject(id: string): SavedProject | null {
  const summary = loadSavedProjects().find((project) => project.id === id);
  if (!summary) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(`${GEOMETRY_PREFIX}${id}`);
    if (raw) {
      const geojson = normalizeGeoJson(JSON.parse(raw));
      if (geojson) {
        return { ...summary, geojson };
      }
    }
  } catch {
    // Fall through to the legacy store.
  }
  const legacy = readLegacyProjects().find((project) => project.id === id);
  return legacy ?? null;
}

export function upsertSavedProject(project: SavedProject): SavedProjectSummary[] {
  const previous = loadSavedProjects();
  const next = [
    summarize(project),
    ...previous.filter((entry) => entry.id !== project.id),
  ];
  const kept = next.slice(0, MAX_PROJECTS);
  const dropped = next.slice(MAX_PROJECTS);
  try {
    window.localStorage.setItem(
      `${GEOMETRY_PREFIX}${project.id}`,
      JSON.stringify(project.geojson),
    );
    writeIndex(kept);
  } catch {
    return previous;
  }
  for (const entry of dropped) {
    try {
      window.localStorage.removeItem(`${GEOMETRY_PREFIX}${entry.id}`);
    } catch {
      // Ignore cleanup failures.
    }
  }
  return kept;
}
