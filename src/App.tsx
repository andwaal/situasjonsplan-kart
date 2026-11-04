import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import type { MapHandle } from './MapView';
import SourceGuide from './SourceGuide';
import { searchAddresses } from './adresse';
import { KOMMUNER, type Kommune } from './kommuner';
import {
  fetchKommuner,
  fetchLocalKommuner,
  kommunerEqual,
  mergeKommunerWebsites,
} from './kommunerApi';
import { APP_CONFIG } from './appConfig';
import {
  DEFAULT_CENTER,
  formatMetres,
  todayIso,
  type AddressSuggestion,
  type Kategori,
  type PropertyForm,
  type PropertyMetadata,
  type SceneObject,
  type SelectionInfo,
  type Tool,
  EMPTY_SELECTION,
} from './config';
import {
  ABOUT_DISCLAIMERS,
  ABOUT_INTRO,
  ABOUT_REPOSITORY_URL,
} from './about';
import { extentForCenter } from './layout';
import { fetchTeigLabels } from './matrikkel';
import type {
  PdfWorkerRequest,
  PdfWorkerResponse,
  PdfWorkerStage,
} from './pdfWorkerProtocol';
import {
  loadSavedProject,
  loadSavedProjects,
  projectIdFor,
  upsertSavedProject,
  type SavedProjectSummary,
} from './savedProjects';

const LazyMapView = lazy(() => import('./MapView'));

function prefetchMapView() {
  void import('./MapView');
}

const WIZARD_STEPS = [
  { id: 'property', label: 'Søk eiendom' },
  { id: 'format', label: 'Arkformat' },
  { id: 'draw', label: 'Tegn tiltak' },
  { id: 'measure', label: 'Mål avstander' },
  { id: 'meta', label: 'Tittelfelt' },
  { id: 'download', label: 'Last ned' },
] as const;

type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];

const DRAW_TOOLS: Array<{ id: Tool; label: string }> = [
  { id: 'rectangle', label: 'Rektangel' },
  { id: 'polygon', label: 'Tegn bygg' },
  { id: 'plainline', label: 'Linje' },
  { id: 'text', label: 'Tekst' },
];

function NumericDraftInput({
  value,
  min,
  max,
  step,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit(value: number): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (draft !== null && draft.trim() !== '' && Number.isFinite(parsed)) {
      onCommit(parsed);
    }
    setDraft(null);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  if (!('download' in HTMLAnchorElement.prototype)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

const TOOL_HINTS: Record<Tool, string> = {
  pan: 'Klikk på et objekt for å velge det. Dra objektet for å flytte det, eller bruk piltastene (Shift for større steg). Delete eller Backspace sletter.',
  text: 'Klikk i kartet der teksten skal stå. Deretter skriver du teksten i panelet Valgt objekt.',
  polygon:
    'Klikk hjørnene i bygget. Dobbeltklikk, eller trykk Ferdig, for å avslutte. Nye geometrier snapper til hjørner du allerede har tegnet.',
  rectangle:
    'Klikk i kartet for å plassere rektangelet. Bruk målene under for eksakte dimensjoner.',
  line: 'Klikk start- og sluttpunkt. Linjen tegnes med piler, og lengden merkes på linjen og skrives ut i situasjonsplanen.',
  plainline:
    'Klikk start- og sluttpunkt. Etterpå kan du velge heltrukket eller stiplet linje og piler i starten og/eller slutten.',
};


function emptyForm(): PropertyForm {
  return {
    gnr: '',
    bnr: '',
    fnr: '',
    snr: '',
    address: '',
    applicant: '',
    date: todayIso(),
    municipality: '',
    municipalityNumber: '',
    format: 'A4',
  };
}

function savedAtLabel(value: number): string {
  return new Intl.DateTimeFormat('nb-NO', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function App() {
  const mapRef = useRef<MapHandle | null>(null);
  const config = APP_CONFIG;
  const [tool, setTool] = useState<Tool>('pan');
  const [drawingActive, setDrawingActive] = useState(false);
  const [category, setCategory] = useState<Kategori>('ny');
  const [featureCount, setFeatureCount] = useState(0);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [selection, setSelection] = useState<SelectionInfo>(EMPTY_SELECTION);
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [selectionRequest, setSelectionRequest] = useState<
    { id: string; token: number } | null
  >(null);
  const [pendingObjectId, setPendingObjectId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pdfStage, setPdfStage] = useState<
    PdfWorkerStage | 'labels' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [rectWidth, setRectWidth] = useState(6);
  const [rectHeight, setRectHeight] = useState(4);
  const [rectAngle, setRectAngle] = useState(0);
  const [addressQuery, setAddressQuery] = useState('');
  const [municipalityFilter, setMunicipalityFilter] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchSettled, setSearchSettled] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const searchAbortRef = useRef<AbortController | null>(null);
  const skipSearchRef = useRef<string | null>(null);
  const objectListRef = useRef<HTMLUListElement | null>(null);
  const scrollToSelectedRef = useRef(false);
  const [form, setForm] = useState<PropertyForm>(emptyForm);
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>(
    () => loadSavedProjects(),
  );
  const resumeGuardRef = useRef(false);
  const aboutDialogRef = useRef<HTMLDialogElement | null>(null);
  const pdfWorkerRef = useRef<Worker | null>(null);
  const pdfRequestRef = useRef(0);
  const [municipalities, setMunicipalities] =
    useState<readonly Kommune[]>(KOMMUNER);

  const getPdfWorker = () => {
    if (!pdfWorkerRef.current) {
      pdfWorkerRef.current = new Worker(
        new URL('./pdfWorker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    return pdfWorkerRef.current;
  };

  useEffect(() => {
    if (stepIndex >= 4) {
      getPdfWorker();
    }
  }, [stepIndex]);

  useEffect(
    () => () => {
      pdfWorkerRef.current?.terminate();
      pdfWorkerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: number | null = null;
    const apply = (rows: readonly Kommune[]) => {
      if (controller.signal.aborted) {
        return;
      }
      setMunicipalities((previous) => {
        const merged = mergeKommunerWebsites([...rows], previous);
        return kommunerEqual(previous, merged) ? previous : merged;
      });
    };
    const run = async () => {
      try {
        apply(await fetchLocalKommuner(controller.signal));
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        try {
          apply(await fetchKommuner(controller.signal));
        } catch {
          // Keep the bundled register when both sources are unavailable.
        }
        return;
      }
      if (controller.signal.aborted) {
        return;
      }
      refreshTimer = window.setTimeout(() => {
        fetchKommuner(controller.signal)
          .then(apply)
          .catch(() => {
            // The local build artifact remains the source of truth.
          });
      }, 1500);
    };
    void run();
    return () => {
      controller.abort();
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
    };
  }, []);

  const municipalityOptions = useMemo(() => {
    const nameCounts = new Map<string, number>();
    for (const kommune of municipalities) {
      nameCounts.set(
        kommune.navn,
        (nameCounts.get(kommune.navn) ?? 0) + 1,
      );
    }
    return [...municipalities]
      .sort(
        (a, b) =>
          a.navn.localeCompare(b.navn, 'nb') ||
          a.nummer.localeCompare(b.nummer, 'nb'),
      )
      .map((kommune) => ({
        ...kommune,
        label:
          (nameCounts.get(kommune.navn) ?? 0) > 1
            ? `${kommune.navn} (${kommune.nummer})`
            : kommune.navn,
      }));
  }, [municipalities]);

  useEffect(() => {
    const term = addressQuery.trim();
    if (skipSearchRef.current === addressQuery) {
      skipSearchRef.current = null;
      setSearchBusy(false);
      setSearchSettled(false);
      return;
    }
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchError(null);
    setSearchSettled(false);
    if (term.length < 3) {
      setSuggestions([]);
      setSearchBusy(false);
      return;
    }
    setSearchBusy(true);
    let controller: AbortController | null = null;
    const timer = window.setTimeout(() => {
      controller = new AbortController();
      searchAbortRef.current = controller;
      searchAddresses(
          term,
          5,
          controller.signal,
          municipalityFilter,
        )
        .then((results) => {
          if (controller?.signal.aborted) {
            return;
          }
          setSuggestions(results);
          setSearchSettled(true);
        })
        .catch((cause: unknown) => {
          if (
            controller?.signal.aborted ||
            (cause instanceof DOMException && cause.name === 'AbortError')
          ) {
            return;
          }
          setSuggestions([]);
          setSearchError(
            cause instanceof Error
              ? cause.message
              : 'Kunne ikke søke etter adresse.',
          );
          setSearchSettled(true);
        })
        .finally(() => {
          if (!controller?.signal.aborted) {
            setSearchBusy(false);
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [addressQuery, municipalityFilter]);

  useEffect(() => {
    if (
      resumeGuardRef.current ||
      !form.address.trim() ||
      !mapCenter
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      const geojson = mapRef.current?.getGeoJson();
      if (!geojson) {
        return;
      }
      setSavedProjects(
        upsertSavedProject({
          id: projectIdFor(form),
          address: form.address,
          municipality: form.municipality,
          municipalityNumber: form.municipalityNumber,
          gnr: form.gnr,
          bnr: form.bnr,
          updatedAt: Date.now(),
          stepIndex,
          center: [mapCenter[0], mapCenter[1]],
          form: { ...form },
          geojson,
        }),
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [form, mapCenter, objects, stepIndex]);

  useEffect(() => {
    const id = WIZARD_STEPS[stepIndex]?.id;
    if (id === 'measure') {
      setTool('line');
    } else {
      setTool('pan');
    }
  }, [stepIndex]);

  useEffect(() => {
    if (!pendingObjectId) {
      return;
    }
    setTool('pan');
    setSelectionRequest({ id: pendingObjectId, token: Date.now() });
    setPendingObjectId(null);
  }, [pendingObjectId]);

  useEffect(() => {
    const id = selection.selectedId;
    const list = objectListRef.current;
    if (!id || !list || !scrollToSelectedRef.current) {
      return;
    }
    scrollToSelectedRef.current = false;
    const frame = requestAnimationFrame(() => {
      const item = Array.from(
        list.querySelectorAll<HTMLElement>('[data-object-id]'),
      ).find((element) => element.dataset.objectId === id);
      item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [selection.selectedId]);

  const updateForm = (key: keyof PropertyForm, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const applyPropertyMetadata = (found: PropertyMetadata) => {
    setForm((previous) => ({
      ...previous,
      address: found.adresse || previous.address,
      gnr: found.gnr > 0 ? String(found.gnr) : '',
      bnr: found.bnr > 0 ? String(found.bnr) : '',
      fnr: found.fnr > 0 ? String(found.fnr) : '',
      snr: found.snr > 0 ? String(found.snr) : '',
      municipality: found.kommune || previous.municipality,
      municipalityNumber:
        found.kommunenummer || previous.municipalityNumber,
    }));
  };

  const handlePropertyFound = (found: PropertyMetadata) => {
    applyPropertyMetadata(found);
    setLookupBusy(false);
    setLookupError(null);
    const post = found.poststed ? `, ${found.poststed}` : '';
    setLookupMessage(
      `Hentet fra Kartverket: ${found.adresse}${post} (${found.gnr}/${found.bnr})`,
    );
  };

  const handleAddressSelected = (suggestion: AddressSuggestion) => {
    applyPropertyMetadata(suggestion);
    setMapCenter(suggestion.punkt);
    setLookupBusy(false);
    setLookupError(null);
    const post = suggestion.poststed ? `, ${suggestion.poststed}` : '';
    setLookupMessage(
      `Valgt adresse: ${suggestion.adresse}${post} (${suggestion.gnr}/${suggestion.bnr})`,
    );
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    skipSearchRef.current = suggestion.adresse;
    setAddressQuery(suggestion.adresse);
    setSuggestions([]);
    setSearchBusy(false);
    setSearchSettled(false);
    setSearchError(null);
    setSearchOpen(false);
    setActiveSuggestion(-1);
    mapRef.current?.flyTo(suggestion.punkt);
  };

  const handleAddressKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Escape') {
      setSearchOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      if (suggestions.length === 0) {
        return;
      }
      event.preventDefault();
      setSearchOpen(true);
      setActiveSuggestion(
        (previous) => (previous + 1) % suggestions.length,
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      if (suggestions.length === 0) {
        return;
      }
      event.preventDefault();
      setSearchOpen(true);
      setActiveSuggestion((previous) =>
        previous <= 0 ? suggestions.length - 1 : previous - 1,
      );
      return;
    }
    if (
      event.key === 'Enter' &&
      searchOpen &&
      activeSuggestion >= 0 &&
      suggestions[activeSuggestion]
    ) {
      event.preventDefault();
      handleAddressSelected(suggestions[activeSuggestion]);
    }
  };

  const handleLookupStart = () => {
    setLookupBusy(true);
    setLookupError(null);
    setLookupMessage(null);
  };

  const handleLookupError = (message: string) => {
    setLookupBusy(false);
    setLookupError(message);
  };

  const validateMetadata = (): string | null => {
    if (!form.gnr.trim() || !form.bnr.trim()) {
      return 'Gårdsnummer og bruksnummer må fylles ut.';
    }
    if (!form.address.trim()) {
      return 'Adresse må fylles ut.';
    }
    if (!form.applicant.trim()) {
      return 'Søker må fylles ut.';
    }
    if (!form.date) {
      return 'Dato må fylles ut.';
    }
    return null;
  };

  const goNext = () => {
    setError(null);
    setMessage(null);
    if (WIZARD_STEPS[stepIndex].id === 'property' && !mapCenter) {
      setError('Søk opp eiendommen før du går videre.');
      return;
    }
    if (WIZARD_STEPS[stepIndex].id === 'meta') {
      const problem = validateMetadata();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setStepIndex((current) =>
      Math.min(current + 1, WIZARD_STEPS.length - 1),
    );
  };

  const goBack = () => {
    setError(null);
    setMessage(null);
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const selectObjectFromList = (id: string) => {
    setError(null);
    setMessage(null);
    scrollToSelectedRef.current = true;
    setPendingObjectId(id);
  };

  const handleObjectCreated = (id: string) => {
    setSelectionRequest({ id, token: Date.now() });
    setTool('pan');
  };

  const resumeProject = (summary: SavedProjectSummary) => {
    const project = loadSavedProject(summary.id);
    if (!project) {
      setError('Kunne ikke åpne det lagrede prosjektet.');
      return;
    }
    resumeGuardRef.current = true;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    skipSearchRef.current = project.address;
    setForm({ ...emptyForm(), ...project.form });
    setMapCenter(project.center);
    setStepIndex(project.stepIndex);
    setAddressQuery(project.address);
    setMunicipalityFilter(project.municipalityNumber);
    setSuggestions([]);
    setSearchBusy(false);
    setSearchSettled(false);
    setSearchError(null);
    setSearchOpen(false);
    setActiveSuggestion(-1);
    setLookupBusy(false);
    setLookupError(null);
    setLookupMessage(
      `Gjenopptok lagret prosjekt: ${project.address}`,
    );
    setError(null);
    setMessage(null);
    let attempts = 0;
    const apply = () => {
      const map = mapRef.current;
      if (!map) {
        attempts += 1;
        if (attempts < 250) {
          window.setTimeout(apply, 16);
          return;
        }
        resumeGuardRef.current = false;
        setError('Kartet ble ikke klart. Prosjektet er ikke gjenopprettet.');
        return;
      }
      map.loadGeoJson(project.geojson);
      map.flyTo(project.center);
      resumeGuardRef.current = false;
    };
    window.setTimeout(apply, 0);
  };

  const startOver = () => {
    resumeGuardRef.current = true;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    skipSearchRef.current = null;
    mapRef.current?.clearAll();
    mapRef.current?.flyTo(DEFAULT_CENTER);
    setForm(emptyForm());
    setMapCenter(null);
    setStepIndex(0);
    setAddressQuery('');
    setMunicipalityFilter('');
    setSuggestions([]);
    setSearchBusy(false);
    setSearchSettled(false);
    setSearchError(null);
    setSearchOpen(false);
    setActiveSuggestion(-1);
    setFeatureCount(0);
    setObjects([]);
    setSelection(EMPTY_SELECTION);
    setSelectionRequest(null);
    setPendingObjectId(null);
    setDrawingActive(false);
    setTool('pan');
    setLookupBusy(false);
    setLookupMessage(null);
    setLookupError(null);
    setError(null);
    setMessage(null);
    window.setTimeout(() => {
      resumeGuardRef.current = false;
    }, 0);
  };

  const renderPdfInWorker = (
    payload: Omit<PdfWorkerRequest, 'requestId'>,
  ) =>
    new Promise<{ bytes: ArrayBuffer; filename: string }>((resolve, reject) => {
      const worker = getPdfWorker();
      const requestId = pdfRequestRef.current + 1;
      pdfRequestRef.current = requestId;
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };
      const fail = (message: string) => {
        cleanup();
        worker.terminate();
        if (pdfWorkerRef.current === worker) {
          pdfWorkerRef.current = null;
        }
        reject(new Error(message));
      };
      const onMessage = (event: MessageEvent<PdfWorkerResponse>) => {
        if (event.data.requestId !== requestId) {
          return;
        }
        if (event.data.type === 'progress') {
          setPdfStage(event.data.stage);
          return;
        }
        if (event.data.type === 'error') {
          fail(event.data.message);
          return;
        }
        cleanup();
        resolve({
          bytes: event.data.bytes,
          filename: event.data.filename,
        });
      };
      const onError = (event: ErrorEvent) => {
        fail(event.message || 'PDF-arbeideren feilet.');
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({ ...payload, requestId });
    });

  const handleDownload = async () => {
    setError(null);
    setMessage(null);
    const problem = validateMetadata();
    if (problem) {
      setError(problem);
      setStepIndex(4);
      return;
    }
    if (!mapRef.current) {
      setError('Kartet er ikke klart ennå.');
      return;
    }
    setBusy(true);
    setPdfStage('labels');
    try {
      const format = config.formats[form.format];
      const center = mapCenter ?? mapRef.current.getCenter();
      const labels = await fetchTeigLabels(
        extentForCenter(center, format),
      );
      const rendered = await renderPdfInWorker({
        format,
        center,
        property: form,
        geojson: mapRef.current.getGeoJson(),
        labels,
      });
      const blob = new Blob([rendered.bytes], {
        type: 'application/pdf',
      });
      downloadPdf(blob, rendered.filename);
      setMessage(
        `Situasjonsplanen er lastet ned som ${rendered.filename}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Kunne ikke generere PDF.',
      );
    } finally {
      setBusy(false);
      setPdfStage(null);
    }
  };

  const formatConfig = config.formats[form.format];
  const [groundWidth, groundHeight] = formatConfig.ground_size_m;
  const isRectangle = tool === 'rectangle';
  const showSearchResults =
    searchOpen && addressQuery.trim().length >= 3;
  const step = WIZARD_STEPS[stepIndex];
  const stepId: WizardStepId = step.id;
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1;
  const selectedBuildingCategory =
    selection.category && selection.category !== 'avstand'
      ? selection.category
      : 'ny';

  return (
    <div className="app">
      <aside className="sidebar wizard-sidebar">
        <header className="brand">
          <span className="brand-kicker">Teknisk demo · 1:500</span>
          <h1>Lag situasjonsplan</h1>
        </header>

        <div className="mobile-step-bar" aria-live="polite">
          <span>
            Steg {stepIndex + 1} / {WIZARD_STEPS.length}
          </span>
          <strong>{step.label}</strong>
        </div>

        <nav className="wizard-steps" aria-label="Steg i situasjonsplanen">
          <div className="wizard-progress">
            <span>
              Steg {stepIndex + 1} av {WIZARD_STEPS.length}
            </span>
            <strong>{step.label}</strong>
          </div>
          <ol>
            {WIZARD_STEPS.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={
                    index === stepIndex ? 'wizard-step active' : 'wizard-step'
                  }
                  onClick={() => {
                    setStepIndex(index);
                    setError(null);
                    setMessage(null);
                  }}
                  disabled={index > 0 && !mapCenter}
                  aria-current={index === stepIndex ? 'step' : undefined}
                >
                  <span className="wizard-step-number">{index + 1}</span>
                  <span>{entry.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {stepId === 'property' && (
          <section className="panel">
            <h2>Søk eiendom</h2>
            <p className="hint">
              Skriv minst 3 tegn. Velg en adresse for å flytte kartet og fylle
              ut eiendomsmetadata. Du kan også klikke på en bygning i kartet.
            </p>
            <div className="address-search">
              <label className="field">
                <span>Kommune</span>
                <select
                  value={municipalityFilter}
                  onChange={(event) => {
                    setMunicipalityFilter(event.target.value);
                    setSearchOpen(false);
                    setActiveSuggestion(-1);
                  }}
                >
                  <option value="">Alle kommuner</option>
                  {municipalityOptions.map((kommune) => (
                    <option key={kommune.nummer} value={kommune.nummer}>
                      {kommune.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Adresse</span>
                <div className="address-input">
                  <input
                    type="search"
                    placeholder="Søk gateadresse eller sted"
                    value={addressQuery}
                    autoComplete="off"
                    aria-expanded={showSearchResults && suggestions.length > 0}
                    aria-controls="address-results"
                    onChange={(event) => {
                      setAddressQuery(event.target.value);
                      setSearchOpen(true);
                      setActiveSuggestion(-1);
                    }}
                    onFocus={() => {
                      prefetchMapView();
                      if (suggestions.length > 0) {
                        setSearchOpen(true);
                      }
                    }}
                    onBlur={(event) => {
                      const input = event.currentTarget;
                      window.setTimeout(() => {
                        if (document.activeElement !== input) {
                          setSearchOpen(false);
                        }
                      }, 120);
                    }}
                    onKeyDown={handleAddressKeyDown}
                  />
                  {searchBusy && (
                    <span className="search-spinner" aria-hidden="true" />
                  )}
                </div>
              </label>
              {searchError && <p className="alert error">{searchError}</p>}
              {showSearchResults && suggestions.length > 0 && (
                <ul
                  className="address-results"
                  id="address-results"
                  role="listbox"
                >
                  {suggestions.map((suggestion, index) => (
                    <li
                      key={`${suggestion.adresse}-${suggestion.punkt[0]}-${suggestion.punkt[1]}`}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === activeSuggestion}
                        className={
                          index === activeSuggestion
                            ? 'address-result active'
                            : 'address-result'
                        }
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleAddressSelected(suggestion)}
                      >
                        <span className="address-result-main">
                          <strong>{suggestion.adresse}</strong>
                          <small>{suggestion.poststed}</small>
                        </span>
                        <span className="address-result-meta">
                          {suggestion.gnr}/{suggestion.bnr}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {showSearchResults &&
                searchSettled &&
                !searchBusy &&
                suggestions.length === 0 &&
                !searchError && (
                  <p className="search-empty">
                    {municipalityFilter
                      ? 'Ingen adresser funnet i valgt kommune.'
                      : 'Ingen adresser funnet.'}
                  </p>
                )}
            </div>
            {savedProjects.length > 0 && (
              <div className="saved-projects">
                <div className="saved-projects-head">
                  <strong>Lagrede prosjekter</strong>
                  <span>Lagres automatisk</span>
                </div>
                <ul>
                  {savedProjects.map((project) => (
                    <li key={project.id}>
                      <div className="saved-project-main">
                        <strong>{project.address}</strong>
                        <small>
                          {[
                            project.municipality,
                            project.gnr && project.bnr
                              ? `${project.gnr}/${project.bnr}`
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                        <small>
                          Oppdatert {savedAtLabel(project.updatedAt)}
                        </small>
                      </div>
                      <div className="saved-project-actions">
                        <button
                          type="button"
                          className="saved-resume"
                          onClick={() => resumeProject(project)}
                        >
                          Fortsett
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={startOver}
                        >
                          Start på nytt
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lookupBusy && (
              <p className="alert info">Henter eiendom fra Kartverket …</p>
            )}
            {lookupMessage && <p className="alert success">{lookupMessage}</p>}
            {lookupError && <p className="alert error">{lookupError}</p>}
            {error && <p className="alert error">{error}</p>}
            {(form.address || form.gnr) && (
              <div className="wizard-summary">
                <div>
                  <span>Adresse</span>
                  <strong>{form.address || '—'}</strong>
                </div>
                <div>
                  <span>Gnr./Bnr.</span>
                  <strong>
                    {form.gnr || '—'} / {form.bnr || '—'}
                  </strong>
                </div>
                <div>
                  <span>Kommune</span>
                  <strong>{form.municipality || '—'}</strong>
                </div>
              </div>
            )}
          </section>
        )}

        {stepId === 'format' && (
          <section className="panel">
            <h2>Velg arkformat</h2>
            <p className="print-size">
              {form.format} · 1:{config.scale} ·{' '}
              {formatMetres(groundWidth)} × {formatMetres(groundHeight)} m
            </p>
            <p className="hint">
              Som regel kan A4 benyttes, unntaket er hvis det gjelder en større eindom som ikke får plass på A4, velg i såfall A3.
              Den stiplede rammen er nøyaktig det som skrives ut. Området er
              låst til adressen du valgte; panorering flytter kartet rundt det
              låste utskriftsområdet.
            </p>
            <label className="field">
              <span>Arkformat</span>
              <select
                value={form.format}
                onChange={(event) =>
                  updateForm('format', event.target.value)
                }
              >
                <option value="A4">A4 liggende (standard)</option>
                <option value="A3">A3 liggende</option>
              </select>
            </label>
          </section>
        )}

        {stepId === 'draw' && (
          <section className="panel">
            <h2>Tegn eller rediger</h2>
            <p className="hint">
              Bruk et av tegneverktøyene for å lage et nytt objekt. Klikk på et
              eksisterende objekt i kartet for å velge det.
            </p>
            <div className="tool-grid">
              {DRAW_TOOLS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={tool === entry.id ? 'tool active' : 'tool'}
                  onClick={() => setTool(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <p className="hint">{TOOL_HINTS[tool]}</p>
            {tool !== 'pan' && tool !== 'text' && (
              <>
                <label className="field">
                  <span>Kategori for nye tegninger</span>
                  <select
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value as Kategori)
                    }
                  >
                    <option value="ny">Nytt tiltak (rød)</option>
                    <option value="eksisterende">
                      Eksisterende bygg (grå)
                    </option>
                    <option value="rives">Rives (gul, stiplet)</option>
                  </select>
                </label>
                {isRectangle && (
                  <div className="dimensions">
                    <label className="field">
                      <span>Bredde (m)</span>
                      <NumericDraftInput
                        min={0.1}
                        max={1000}
                        step={0.1}
                        value={rectWidth}
                        onCommit={(value) =>
                          setRectWidth(Math.max(0.1, value))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Dybde (m)</span>
                      <NumericDraftInput
                        min={0.1}
                        max={1000}
                        step={0.1}
                        value={rectHeight}
                        onCommit={(value) =>
                          setRectHeight(Math.max(0.1, value))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Rotasjon (°)</span>
                      <NumericDraftInput
                        min={-360}
                        max={360}
                        step={1}
                        value={rectAngle}
                        onCommit={setRectAngle}
                      />
                    </label>
                  </div>
                )}
              </>
            )}
            <div className="action-row">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (
                    featureCount > 0 &&
                    !window.confirm('Slette alle tegninger?')
                  ) {
                    return;
                  }
                  mapRef.current?.clearAll();
                }}
                disabled={featureCount === 0}
              >
                Tøm tegning
              </button>
            </div>
            <p className="hint">
              Areal og sidelengder beregnes automatisk og vises på kartet og i
              PDF-en.
            </p>
          </section>
        )}

        {stepId === 'measure' && (
          <section className="panel">
            <h2>Mål avstander</h2>
            <p className="hint">
              Tegn røde mållinjer fra startpunkt til sluttpunkt. Lengden vises
              på linjen og blir med i PDF-en.
            </p>
            <button
              type="button"
              className="tool active"
              onClick={() => setTool('line')}
            >
              Mål avstand
            </button>
            <ul className="wizard-tips">
              <li>Korteste avstand til nabogrensen</li>
              <li>Avstand til veiens midtlinje</li>
              <li>Avstand til andre bygninger</li>
            </ul>
            <p className="hint">
              Sidelengder og areal for det du tegner beregnes automatisk – du
              trenger ikke måle bygget selv.
            </p>
            <p className="hint">
              Hvis avstanden til nabogrensen er under 4 meter, må du skaffe en
              skriftlig avstandserklæring fra naboen.
            </p>
            <SourceGuide
              municipality={form.municipality}
              municipalityNumber={form.municipalityNumber}
            />
          </section>
        )}

        {stepId === 'meta' && (
          <section className="panel">
            <h2>Kontroller tittelfeltet</h2>
            <p className="hint">
              Tittelfeltet i kartet oppdateres automatisk. Fyll ut søker og
              kontroller datoen før du går videre.
            </p>
            {lookupBusy && (
              <p className="alert info">Henter eiendom fra Kartverket …</p>
            )}
            {lookupMessage && <p className="alert success">{lookupMessage}</p>}
            {lookupError && <p className="alert error">{lookupError}</p>}
            <div className="number-grid">
              <label className="field">
                <span>Gnr. *</span>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={form.gnr}
                  onChange={(event) => updateForm('gnr', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Bnr. *</span>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={form.bnr}
                  onChange={(event) => updateForm('bnr', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Fnr.</span>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={form.fnr}
                  onChange={(event) => updateForm('fnr', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Snr.</span>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={form.snr}
                  onChange={(event) => updateForm('snr', event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>Adresse *</span>
              <input
                type="text"
                placeholder="Gateadresse 1, 0000 Sted"
                value={form.address}
                onChange={(event) => updateForm('address', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Søker *</span>
              <input
                type="text"
                placeholder="Fornavn Etternavn"
                value={form.applicant}
                onChange={(event) =>
                  updateForm('applicant', event.target.value)
                }
              />
            </label>
            <label className="field">
              <span>Dato</span>
              <input
                type="date"
                value={form.date}
                onChange={(event) => updateForm('date', event.target.value)}
              />
            </label>
            {error && <p className="alert error">{error}</p>}
          </section>
        )}

        {stepId === 'download' && (
          <section className="panel">
            <h2>Kontroller og last ned</h2>
            <div className="wizard-summary">
              <div>
                <span>Adresse</span>
                <strong>{form.address || '—'}</strong>
              </div>
              <div>
                <span>Gnr./Bnr.</span>
                <strong>
                  {form.gnr || '—'} / {form.bnr || '—'}
                </strong>
              </div>
              <div>
                <span>Arkformat</span>
                <strong>
                  {form.format} · 1:{config.scale}
                </strong>
              </div>
              <div>
                <span>Geometrier</span>
                <strong>{featureCount}</strong>
              </div>
            </div>
            <ul className="wizard-checklist">
              <li>Adresse og gårds-/bruksnummer er kontrollert</li>
              <li>Nye tiltak er tegnet og markert med rødt</li>
              <li>Nødvendige avstander er målt</li>
              <li>Søker og dato er fylt ut</li>
            </ul>
            {error && <p className="alert error">{error}</p>}
            {message && <p className="alert success">{message}</p>}
            <p className="hint">
              PDF-en lages i 1:500 med tittelfelt og nordpil. Ved utskrift må du
              bruke faktisk størrelse / 100 %.
            </p>
          </section>
        )}

        {objects.length > 0 && (
          <section className="panel object-list">
            <h2>Objekter</h2>
            <ul ref={objectListRef}>
              {objects.map((object) => (
                <li
                  key={object.id}
                  data-object-id={object.id}
                  className={
                    selection.selectedId === object.id
                      ? 'object-item selected'
                      : 'object-item'
                  }
                >
                  <button
                    type="button"
                    className={
                      selection.selectedId === object.id
                        ? 'object-row active'
                        : 'object-row'
                    }
                    onClick={() => selectObjectFromList(object.id)}
                  >
                    <span className="object-row-main">
                      <strong>{object.title}</strong>
                      {object.detail && <small>{object.detail}</small>}
                    </span>
                    <span className="object-row-kind">
                      {object.kind === 'text'
                        ? 'Tekst'
                        : object.kind === 'line'
                          ? 'Linje'
                          : 'Flate'}
                    </span>
                  </button>
                  {selection.selectedId === object.id && (
                    <div className="object-editor">
                      {selection.count > 0 ? (
              <div className="selection-editor">
                <div className="selection-heading">
                  <strong>
                    {selection.count === 1
                      ? 'Valgt objekt'
                      : `${selection.count} objekter valgt`}
                  </strong>
                  <span>
                    {selection.kind === 'line'
                      ? 'Avstandsmåling'
                      : selection.kind === 'text'
                        ? 'Tekst'
                        : 'Bygningsflate'}
                  </span>
                </div>
                <label className="field">
                  <span>Navn</span>
                  <input
                    type="text"
                    value={selection.name ?? ''}
                    onChange={(event) =>
                      mapRef.current?.setSelectedName(event.target.value)
                    }
                  />
                </label>
                {selection.kind === 'line' && selection.category === 'linje' && (
                  <div className="line-options">
                    <span className="label-options-title">Linjestil</span>
                    <div className="line-icon-row">
                      <button
                        type="button"
                        className={
                          selection.lineStyle !== 'dashed'
                            ? 'line-icon active'
                            : 'line-icon'
                        }
                        title="Heltrukket linje"
                        aria-label="Heltrukket linje"
                        onClick={() =>
                          mapRef.current?.setSelectedLineOptions(
                            'solid',
                            selection.arrowStart ?? false,
                            selection.arrowEnd ?? true,
                          )
                        }
                      >
                        <svg viewBox="0 0 40 16" aria-hidden="true">
                          <line x1="2" y1="8" x2="38" y2="8" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={
                          selection.lineStyle === 'dashed'
                            ? 'line-icon active'
                            : 'line-icon'
                        }
                        title="Stiplet linje"
                        aria-label="Stiplet linje"
                        onClick={() =>
                          mapRef.current?.setSelectedLineOptions(
                            'dashed',
                            selection.arrowStart ?? false,
                            selection.arrowEnd ?? true,
                          )
                        }
                      >
                        <svg viewBox="0 0 40 16" aria-hidden="true">
                          <line
                            x1="2"
                            y1="8"
                            x2="38"
                            y2="8"
                            strokeDasharray="6 4"
                          />
                        </svg>
                      </button>
                    </div>
                    <span className="label-options-title">Piler</span>
                    <div className="line-icon-row">
                      <button
                        type="button"
                        className={
                          selection.arrowStart
                            ? 'line-icon active'
                            : 'line-icon'
                        }
                        title="Pil i starten"
                        aria-label="Pil i starten"
                        onClick={() =>
                          mapRef.current?.setSelectedLineOptions(
                            selection.lineStyle ?? 'solid',
                            !selection.arrowStart,
                            selection.arrowEnd ?? true,
                          )
                        }
                      >
                        <svg viewBox="0 0 40 16" aria-hidden="true">
                          <line x1="10" y1="8" x2="38" y2="8" />
                          <path d="M2 8 L10 3 L10 13 Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={
                          selection.arrowEnd !== false
                            ? 'line-icon active'
                            : 'line-icon'
                        }
                        title="Pil i slutten"
                        aria-label="Pil i slutten"
                        onClick={() =>
                          mapRef.current?.setSelectedLineOptions(
                            selection.lineStyle ?? 'solid',
                            selection.arrowStart ?? false,
                            selection.arrowEnd === false,
                          )
                        }
                      >
                        <svg viewBox="0 0 40 16" aria-hidden="true">
                          <line x1="2" y1="8" x2="30" y2="8" />
                          <path d="M38 8 L30 3 L30 13 Z" />
                        </svg>
                      </button>
                    </div>
                    <div className="text-style-grid">
                      <label className="field">
                        <span>Farge</span>
                        <input
                          type="color"
                          value={selection.lineColor ?? '#111827'}
                          onChange={(event) =>
                            mapRef.current?.setSelectedLineColor(
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Tykkelse</span>
                        <NumericDraftInput
                          min={1}
                          max={8}
                          step={0.5}
                          value={selection.lineWidth ?? 2}
                          onCommit={(value) =>
                            mapRef.current?.setSelectedLineWidth(value)
                          }
                        />
                      </label>
                    </div>
                  </div>
                )}
                {selection.kind === 'polygon' && (
                  <>
                    <label className="field">
                      <span>Type på valgt objekt</span>
                      <select
                        value={selectedBuildingCategory}
                        onChange={(event) =>
                          mapRef.current?.setSelectedCategory(
                            event.target.value as Kategori,
                          )
                        }
                      >
                        <option value="ny">Nytt tiltak (rød)</option>
                        <option value="eksisterende">
                          Eksisterende bygg (grå)
                        </option>
                        <option value="rives">Rives (gul, stiplet)</option>
                      </select>
                    </label>
                    <div className="label-options">
                      <span className="label-options-title">
                        Mål som vises på kartet
                      </span>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={selection.showSides}
                          onChange={(event) =>
                            mapRef.current?.setSelectedLabelOptions(
                              event.target.checked,
                              selection.showArea,
                            )
                          }
                        />
                        Sidelengder
                      </label>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={selection.showArea}
                          onChange={(event) =>
                            mapRef.current?.setSelectedLabelOptions(
                              selection.showSides,
                              event.target.checked,
                            )
                          }
                        />
                        Areal
                      </label>
                    </div>
                  </>
                )}
                {selection.kind === 'text' && (
                  <>
                    <label className="field">
                      <span>Tekst</span>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Skriv tekst"
                        value={selection.text ?? ''}
                        onChange={(event) =>
                          mapRef.current?.setSelectedText(event.target.value)
                        }
                      />
                    </label>
                    <div className="text-style-grid">
                      <label className="field">
                        <span>Farge</span>
                        <input
                          type="color"
                          value={selection.textColor ?? '#111827'}
                          onChange={(event) =>
                            mapRef.current?.setSelectedTextColor(
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Fontstørrelse</span>
                        <NumericDraftInput
                          min={6}
                          max={72}
                          step={1}
                          value={selection.fontSize ?? 14}
                          onCommit={(value) =>
                            mapRef.current?.setSelectedFontSize(value)
                          }
                        />
                      </label>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  className="secondary danger"
                  onClick={() => mapRef.current?.deleteSelected()}
                >
                  Slett valgt objekt
                </button>
              </div>
            ) : (
              tool === 'pan' && <p className="hint">Ingen objekt er valgt.</p>
            )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="wizard-nav">
          <button
            type="button"
            className="secondary"
            onClick={goBack}
            disabled={stepIndex === 0}
          >
            Tilbake
          </button>
          {isLastStep ? (
            <button
              type="button"
              className="primary"
              onClick={handleDownload}
              disabled={busy}
            >
              {busy
                ? pdfStage === 'labels'
                  ? 'Henter eiendomsdata …'
                  : pdfStage === 'pdf'
                    ? 'Lager PDF …'
                    : 'Henter kart …'
                : 'Last ned situasjonsplan'}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={goNext}
              disabled={stepId === 'property' && !mapCenter}
            >
              Neste
            </button>
          )}
        </div>

        <footer className="footnote">
          <span>Kart: Kartverket / Geonorge. Eiendomsgrenser: Matrikkelen.</span>
          <button
            type="button"
            className="about-link"
            onClick={() => aboutDialogRef.current?.showModal()}
          >
            Om og forbehold
          </button>
        </footer>
      </aside>

      <main className="map-shell">
        {mapCenter ? (
          <Suspense
            fallback={
              <div className="map-loading" role="status">
                Laster kart …
              </div>
            }
          >
            <>
              <LazyMapView
                ref={mapRef}
                config={config}
                format={form.format}
                tool={tool}
                category={category}
                rectWidth={rectWidth}
                rectHeight={rectHeight}
                rectAngle={rectAngle}
                property={form}
                initialCenter={mapCenter}
                printCenter={mapCenter}
                selectionRequest={selectionRequest}
                onFeatureCountChange={setFeatureCount}
                onObjectsChange={setObjects}
                onObjectCreated={handleObjectCreated}
                onSelectionChange={setSelection}
                onPropertyFound={handlePropertyFound}
                onPropertyLookupStart={handleLookupStart}
                onPropertyLookupError={handleLookupError}
                onDrawingStateChange={setDrawingActive}
              />
              {drawingActive && (
                <div className="draw-actions" role="group" aria-label="Tegning">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => mapRef.current?.abortDrawing()}
                  >
                    Avbryt
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => mapRef.current?.finishDrawing()}
                  >
                    Ferdig
                  </button>
                </div>
              )}
              <div className="map-chip">
                <strong>
                  {form.format} · 1:{config.scale}
                </strong>
                <span>
                  {featureCount}{' '}
                  {featureCount === 1 ? 'geometri' : 'geometrier'}
                </span>
              </div>
            </>
          </Suspense>
        ) : (
          <div className="map-placeholder">
            <div className="map-placeholder-card">
              <span className="brand-kicker">Steg 1</span>
              <h2>Kartet vises når eiendommen er valgt</h2>
              <p>
                Søk opp adressen i panelet. Når du har valgt en adresse,
                åpnes kartet og du kan tegne situasjonsplanen.
              </p>
            </div>
          </div>
        )}
      </main>

      <dialog
        ref={aboutDialogRef}
        className="about-dialog"
        aria-labelledby="about-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        <div className="about-sheet">
          <header className="about-head">
            <div className="about-title">
              <h2 id="about-title">Om og forbehold</h2>
            </div>
            <form method="dialog">
              <button
                type="submit"
                className="about-close"
                aria-label="Lukk om og forbehold"
              >
                ×
              </button>
            </form>
          </header>
          <p className="about-intro">{ABOUT_INTRO}</p>
          <p className="about-repo">
            <span>Kildekode:</span>{' '}
            <a
              href={ABOUT_REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
            >
              github.com/andwaal/situasjonsplan-kart ↗
            </a>
          </p>
          <ul className="about-list">
            {ABOUT_DISCLAIMERS.map((disclaimer) => (
              <li key={disclaimer.title}>
                <strong>{disclaimer.title}</strong>
                <p>{disclaimer.body}</p>
              </li>
            ))}
          </ul>
          <form method="dialog" className="about-actions">
            <button type="submit" className="secondary">
              Lukk
            </button>
          </form>
        </div>
      </dialog>
    </div>
  );
}
