import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { MapBrowserEvent } from 'ol';
import type { Coordinate } from 'ol/coordinate';
import Feature from 'ol/Feature';
import type { FeatureLike } from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import Polygon, { fromExtent } from 'ol/geom/Polygon';
import type Geometry from 'ol/geom/Geometry';
import ImageLayer from 'ol/layer/Image';
import VectorLayer from 'ol/layer/Vector';
import Map from 'ol/Map';
import Overlay from 'ol/Overlay';
import View from 'ol/View';
import { click } from 'ol/events/condition';
import { defaults as defaultControls, ScaleLine } from 'ol/control';
import Draw, { type DrawEvent } from 'ol/interaction/Draw';
import Select from 'ol/interaction/Select';
import Translate from 'ol/interaction/Translate';
import Snap from 'ol/interaction/Snap';
import ImageWMS from 'ol/source/ImageWMS';
import VectorSource from 'ol/source/Vector';
import { getArea, getLength } from 'ol/sphere';
import { Fill, RegularShape, Stroke, Style, Text } from 'ol/style';

import './projection';
import { reverseGeocode } from './adresse';
import {
  DEFAULT_CENTER,
  DEFAULT_RESOLUTION,
  KATEGORI_COLORS,
  KATEGORI_LABELS,
  PROJECTION_CODE,
  formatArea,
  formatMetres,
  type AppConfig,
  type SelectionInfo,
  type GeoJsonFeatureCollection,
  type Kategori,
  type LineStyle,
  type PropertyForm,
  type PropertyMetadata,
  type SceneObject,
  type Tool,
  EMPTY_SELECTION,
} from './config';
import { fetchTeigLabels } from './matrikkel';

export interface MapHandle {
  getCenter(): [number, number];
  flyTo(punkt: [number, number]): void;
  finishDrawing(): void;
  abortDrawing(): void;
  getGeoJson(): GeoJsonFeatureCollection;
  loadGeoJson(collection: GeoJsonFeatureCollection): void;
  getFeatureCount(): number;
  setSelectedCategory(category: Kategori): void;
  setSelectedName(name: string): void;
  setSelectedLabelOptions(showSides: boolean, showArea: boolean): void;
  setSelectedText(text: string): void;
  setSelectedTextColor(color: string): void;
  setSelectedFontSize(size: number): void;
  setSelectedLineOptions(
    style: LineStyle,
    arrowStart: boolean,
    arrowEnd: boolean,
  ): void;
  setSelectedLineColor(color: string): void;
  setSelectedLineWidth(width: number): void;
  deleteSelected(): void;
  clearAll(): void;
}

interface MapViewProps {
  config: AppConfig;
  format: string;
  tool: Tool;
  category: Kategori;
  rectWidth: number;
  rectHeight: number;
  rectAngle: number;
  property: PropertyForm;
  initialCenter: [number, number];
  printCenter: [number, number];
  selectionRequest: { id: string; token: number } | null;
  onFeatureCountChange(count: number): void;
  onObjectsChange(objects: SceneObject[]): void;
  onObjectCreated(id: string): void;
  onSelectionChange(selection: SelectionInfo): void;
  onPropertyFound(property: PropertyMetadata): void;
  onPropertyLookupStart(): void;
  onPropertyLookupError(message: string): void;
  onDrawingStateChange(active: boolean): void;
}

function isCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

const SELECTED_STYLE = new Style({
  stroke: new Stroke({ color: '#2563eb', width: 3, lineDash: [5, 4] }),
});

const SELECTED_TEXT_STYLE = new Style({
  image: new RegularShape({
    points: 4,
    radius: 5,
    angle: Math.PI / 4,
    fill: new Fill({ color: '#2563eb' }),
    stroke: new Stroke({ color: '#ffffff', width: 2 }),
  }),
});

const PREVIEW_STYLE = new Style({
  stroke: new Stroke({ color: '#2563eb', width: 2, lineDash: [6, 4] }),
  fill: new Fill({ color: 'rgba(37, 99, 235, 0.16)' }),
});

const FRAME_STYLE = new Style({
  stroke: new Stroke({ color: '#111827', width: 1.6, lineDash: [8, 5] }),
  fill: new Fill({ color: 'rgba(17, 24, 39, 0.03)' }),
});

// The printed extent is marked by the dashed frame only. Dimming the rest
// would tint the white parcel background and mute the building colors.
const SHADE_STYLE = new Style({});

const MASK_STYLE = new Style({
  fill: new Fill({ color: 'rgba(255, 255, 255, 0.9)' }),
  stroke: new Stroke({ color: '#6b7280', width: 1, lineDash: [4, 3] }),
});

function distanceLabel(feature: FeatureLike): string {
  const geometry = feature.getGeometry();
  if (!(geometry instanceof LineString)) {
    return '';
  }
  return `${formatMetres(
    getLength(geometry, { projection: PROJECTION_CODE }),
    1,
  )} m`;
}

function polygonMeasurementStyles(
  geometry: Polygon,
  showSides: boolean,
  showArea: boolean,
): Style[] {
  if (!showSides && !showArea) {
    return [];
  }
  const ring = geometry.getLinearRings()[0]?.getCoordinates();
  if (!ring || ring.length < 2) {
    return [];
  }
  const label = (text: string, point: Point, size: number): Style =>
    new Style({
      geometry: point,
      text: new Text({
        text,
        font: `700 ${size}px system-ui, sans-serif`,
        fill: new Fill({ color: '#ff0000' }),
        stroke: new Stroke({ color: '#ffffff', width: 3 }),
        overflow: true,
        textAlign: 'center',
        textBaseline: 'middle',
      }),
    });

  const styles: Style[] = [];
  if (showArea) {
    styles.push(
      label(
        formatArea(getArea(geometry, { projection: PROJECTION_CODE })),
        geometry.getInteriorPoint(),
        12,
      ),
    );
  }
  if (!showSides) {
    return styles;
  }
  for (let index = 1; index < ring.length; index += 1) {
    const start = ring[index - 1];
    const end = ring[index];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length < 0.1) {
      continue;
    }
    styles.push(
      label(
        `${formatMetres(length, 1)} m`,
        new Point([(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]),
        10,
      ),
    );
  }
  return styles;
}

function drawStyle(feature: FeatureLike): Style | Style[] {
  const kategori = (feature.get('kategori') as Kategori | undefined) ?? 'ny';
  const geometry = feature.getGeometry();
  const showSides = feature.get('showSides') !== false;
  const showArea = feature.get('showArea') === true;
  const measurements =
    geometry instanceof Polygon
      ? polygonMeasurementStyles(geometry, showSides, showArea)
      : [];
  if (kategori === 'tekst') {
    const color = String(feature.get('textColor') || '#111827');
    const fontSize = Number(feature.get('fontSize')) || 14;
    return new Style({
      text: new Text({
        text: String(feature.get('tekst') ?? ''),
        font: `700 ${fontSize}px system-ui, sans-serif`,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#ffffff', width: 4 }),
        overflow: true,
        textAlign: 'left',
        textBaseline: 'middle',
        offsetX: 6,
      }),
    });
  }
  if (kategori === 'linje') {
    const lineStyle = feature.get('lineStyle') === 'dashed' ? 'dashed' : 'solid';
    const color = String(feature.get('lineColor') || '#111827');
    const width = Number(feature.get('lineWidth')) || 2;
    const arrowRadius = Math.max(6, width * 2 + 3);
    const styles: Style[] = [
      new Style({
        stroke: new Stroke({
          color,
          width,
          lineDash: lineStyle === 'dashed' ? [8, 5] : undefined,
        }),
      }),
    ];
    if (geometry instanceof LineString) {
      const coordinates = geometry.getCoordinates();
      if (coordinates.length >= 2) {
        const start = coordinates[0];
        const end = coordinates[coordinates.length - 1];
        const arrowFill = new Fill({ color });
        const arrowStroke = new Stroke({ color, width: 1 });
        if (feature.get('arrowStart') === true) {
          styles.push(
            new Style({
              geometry: new Point(start),
              image: new RegularShape({
                points: 3,
                radius: arrowRadius,
                angle: Math.atan2(start[0] - end[0], start[1] - end[1]),
                fill: arrowFill,
                stroke: arrowStroke,
              }),
            }),
          );
        }
        if (feature.get('arrowEnd') !== false) {
          styles.push(
            new Style({
              geometry: new Point(end),
              image: new RegularShape({
                points: 3,
                radius: arrowRadius,
                angle: Math.atan2(end[0] - start[0], end[1] - start[1]),
                fill: arrowFill,
                stroke: arrowStroke,
              }),
            }),
          );
        }
      }
    }
    return styles;
  }
  if (kategori === 'avstand') {
    const styles = [
      new Style({
        stroke: new Stroke({ color: '#ff0000', width: 2 }),
      }),
      new Style({
        text: new Text({
          text: distanceLabel(feature),
          font: '700 13px system-ui, sans-serif',
          fill: new Fill({ color: '#ff0000' }),
          stroke: new Stroke({ color: '#ffffff', width: 4 }),
          placement: 'line',
          overflow: true,
          textBaseline: 'middle',
        }),
      }),
    ];
    const geometry = feature.getGeometry();
    if (geometry instanceof LineString) {
      const coordinates = geometry.getCoordinates();
      if (coordinates.length >= 2) {
        const start = coordinates[0];
        const end = coordinates[coordinates.length - 1];
        const startAngle = Math.atan2(start[0] - end[0], start[1] - end[1]);
        const endAngle = Math.atan2(end[0] - start[0], end[1] - start[1]);
        const arrowFill = new Fill({ color: '#ff0000' });
        const arrowStroke = new Stroke({ color: '#ff0000', width: 1 });
        for (const [point, angle] of [
          [new Point(start), startAngle],
          [new Point(end), endAngle],
        ] as const) {
          styles.push(
            new Style({
              geometry: point,
              image: new RegularShape({
                points: 3,
                radius: 6,
                angle,
                fill: arrowFill,
                stroke: arrowStroke,
              }),
            }),
          );
        }
      }
    }
    return styles;
  }
  if (kategori === 'eksisterende') {
    return [
      new Style({
        stroke: new Stroke({ color: '#000000', width: 1.5 }),
        fill: new Fill({ color: 'rgba(200, 200, 200, 0.5)' }),
      }),
      ...measurements,
    ];
  }
  if (kategori === 'rives') {
    return [
      new Style({
        stroke: new Stroke({
          color: KATEGORI_COLORS.rives,
          width: 2.5,
          lineDash: [8, 5],
        }),
      }),
      ...measurements,
    ];
  }
  return [
    new Style({
      stroke: new Stroke({ color: KATEGORI_COLORS.ny, width: 2 }),
      fill: new Fill({ color: 'rgba(255, 0, 0, 0.3)' }),
    }),
    ...measurements,
  ];
}

function selectedDrawStyle(feature: FeatureLike): Style | Style[] {
  const base = drawStyle(feature);
  const styles = Array.isArray(base) ? [...base] : [base];
  if (feature.get('kategori') === 'tekst') {
    styles.push(SELECTED_TEXT_STYLE);
  }
  return [...styles, SELECTED_STYLE];
}

function printStyle(feature: FeatureLike): Style {
  const role = feature.get('role');
  if (role === 'shade') {
    return SHADE_STYLE;
  }
  if (role === 'mask') {
    return MASK_STYLE;
  }
  return FRAME_STYLE;
}

function propertyLabelStyle(feature: FeatureLike): Style {
  return new Style({
    text: new Text({
      text: String(feature.get('tekst') ?? ''),
      font: '700 12px system-ui, sans-serif',
      fill: new Fill({ color: '#fe0101' }),
      stroke: new Stroke({ color: '#fefee5', width: 3 }),
      overflow: true,
      textAlign: 'center',
      textBaseline: 'middle',
    }),
  });
}

let featureIdCounter = 0;

function newFeatureId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  featureIdCounter += 1;
  return `obj-${Date.now()}-${featureIdCounter}`;
}

function sceneObjectFor(feature: FeatureLike): SceneObject | null {
  const geometry = feature.getGeometry();
  if (!geometry) {
    return null;
  }
  let id = feature.getId();
  if (!id) {
    id = newFeatureId();
    (feature as Feature).setId(id);
  }
  const raw = feature.get('kategori') as Kategori | undefined;
  const category = raw ?? (geometry instanceof LineString ? 'avstand' : 'ny');
  let kind: SceneObject['kind'] | null = null;
  let defaultTitle = KATEGORI_LABELS[category] ?? String(category);
  let detail = '';
  if (geometry instanceof Polygon) {
    kind = 'polygon';
    const parts: string[] = [];
    if (feature.get('showSides') !== false) parts.push('sidelengder');
    if (feature.get('showArea') === true) parts.push('areal');
    detail = parts.length > 0 ? `Viser ${parts.join(' og ')}` : 'Ingen mål';
  } else if (geometry instanceof LineString) {
    kind = 'line';
    if (category === 'linje') {
      defaultTitle = 'Linje';
      const style = feature.get('lineStyle') === 'dashed' ? 'Stiplet' : 'Heltrukket';
      const arrows: string[] = [];
      if (feature.get('arrowStart') === true) arrows.push('pil start');
      if (feature.get('arrowEnd') !== false) arrows.push('pil slutt');
      detail = [style, ...arrows].join(' · ');
    } else {
      defaultTitle = 'Avstandsmåling';
      detail = 'Mållinje';
    }
  } else if (geometry instanceof Point) {
    kind = 'text';
    defaultTitle = 'Tekst';
    detail = String(feature.get('tekst') ?? '');
  }
  if (!kind) {
    return null;
  }
  const title = String(feature.get('name') || defaultTitle);
  return { id: String(id), kind, category, title, detail };
}

function selectionInfoFor(select: Select): SelectionInfo {
  const features = select.getFeatures();
  const count = features.getLength();
  const feature = features.item(0);
  if (!feature) {
    return EMPTY_SELECTION;
  }
  const raw = feature.get('kategori');
  const category: Kategori | null =
    raw === 'ny' ||
    raw === 'eksisterende' ||
    raw === 'rives' ||
    raw === 'avstand' ||
    raw === 'tekst' ||
    raw === 'linje'
      ? raw
      : null;
  const geometry = feature.getGeometry();
  const selectedId = feature.getId() ? String(feature.getId()) : null;
  if (geometry instanceof Point && category === 'tekst') {
    return {
      count,
      selectedId,
      category: 'tekst',
      kind: 'text',
      name: String(feature.get('name') || 'Tekst'),
      showSides: false,
      showArea: false,
      text: String(feature.get('tekst') ?? ''),
      textColor: String(feature.get('textColor') || '#111827'),
      fontSize: Number(feature.get('fontSize')) || 14,
      lineStyle: null,
      lineColor: null,
      lineWidth: null,
      arrowStart: null,
      arrowEnd: null,
    };
  }
  if (geometry instanceof LineString) {
    return {
      count,
      selectedId,
      category: category ?? 'avstand',
      kind: 'line',
      name: String(feature.get('name') || 'Avstandsmåling'),
      showSides: false,
      showArea: false,
      text: null,
      textColor: null,
      fontSize: null,
      lineStyle:
        category === 'linje'
          ? feature.get('lineStyle') === 'dashed'
            ? 'dashed'
            : 'solid'
          : null,
      lineColor:
        category === 'linje'
          ? String(feature.get('lineColor') || '#111827')
          : null,
      lineWidth:
        category === 'linje' ? Number(feature.get('lineWidth')) || 2 : null,
      arrowStart: category === 'linje' ? feature.get('arrowStart') === true : null,
      arrowEnd: category === 'linje' ? feature.get('arrowEnd') !== false : null,
    };
  }
  if (geometry instanceof Polygon) {
    return {
      count,
      selectedId,
      category: category ?? 'ny',
      kind: 'polygon',
      name: String(
        feature.get('name') || KATEGORI_LABELS[category ?? 'ny'],
      ),
      showSides: feature.get('showSides') !== false,
      showArea: feature.get('showArea') === true,
      text: null,
      textColor: null,
      fontSize: null,
      lineStyle: null,
      lineColor: null,
      lineWidth: null,
      arrowStart: null,
      arrowEnd: null,
    };
  }
  return {
    count,
    selectedId,
    category,
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
}

function rectangleGeometry(
  center: Coordinate,
  width: number,
  height: number,
  angleDeg: number,
): Polygon {
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const ring: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ].map(([sx, sy]) => {
    const east = (sx * width) / 2;
    const north = (sy * height) / 2;
    return [
      center[0] + east * cos + north * sin,
      center[1] - east * sin + north * cos,
    ];
  });
  return new Polygon([ring]);
}

function measurementText(geometry: Geometry): string {
  const lastSegment = (points: Coordinate[]): number => {
    if (points.length < 2) {
      return 0;
    }
    const previous = points[points.length - 2];
    const last = points[points.length - 1];
    return Math.hypot(last[0] - previous[0], last[1] - previous[1]);
  };

  if (geometry instanceof Polygon) {
    const area = getArea(geometry, { projection: PROJECTION_CODE });
    let perimeter = 0;
    for (const ring of geometry.getLinearRings()) {
      perimeter += getLength(ring, { projection: PROJECTION_CODE });
    }
    const side = lastSegment(geometry.getLinearRings()[0].getCoordinates());
    return `Areal ${formatArea(area)} · Omkrets ${formatMetres(
      perimeter,
    )} m · Siste side ${formatMetres(side)} m`;
  }
  if (geometry instanceof LineString) {
    const coordinates = geometry.getCoordinates();
    return `Lengde ${formatMetres(
      getLength(geometry, { projection: PROJECTION_CODE }),
      1,
    )} m · Siste side ${formatMetres(lastSegment(coordinates))} m`;
  }
  return '';
}

function municipalityLabel(value: string): string {
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
  if (parts.length !== 3) {
    return value || '—';
  }
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function MapTitleBlock({
  property,
  format,
  scale,
  municipality,
}: {
  property: PropertyForm;
  format: string;
  scale: number;
  municipality: string;
}) {
  const fnr = property.fnr.trim();
  const snr = property.snr.trim();
  const showFnr = fnr !== '' || snr !== '';
  return (
    <div className="map-titleblock">
      <div className="mtb-head">
        <strong>SITUASJONSPLAN</strong>
        <span>MÅLESTOKK 1:{scale}</span>
      </div>
      <div className="mtb-sub">
        <span>
          {municipality ? `${municipalityLabel(municipality)} kommune` : '—'}
        </span>
        <span>{format}-format</span>
      </div>
      <div className="mtb-row">
        <span className="mtb-label">EIENDOM</span>
        <span className="mtb-value" title={property.address}>
          {property.address || '—'}
        </span>
      </div>
      <div className="mtb-row mtb-split">
        <span>
          <span className="mtb-label">GNR./BNR.</span>
          <span className="mtb-value">
            {property.gnr || '—'} / {property.bnr || '—'}
          </span>
        </span>
        {showFnr && (
          <span>
            <span className="mtb-label">FNR./SNR.</span>
            <span className="mtb-value">
              {fnr || '0'} / {snr || '0'}
            </span>
          </span>
        )}
      </div>
      <div className="mtb-row">
        <span className="mtb-label">SØKER</span>
        <span className="mtb-value" title={property.applicant}>
          {property.applicant || '—'}
        </span>
      </div>
      <div className="mtb-row">
        <span className="mtb-label">DATO</span>
        <span className="mtb-value">{formatDate(property.date)}</span>
      </div>
    </div>
  );
}

const MapView = forwardRef<MapHandle, MapViewProps>(function MapView(
  {
    config,
    format,
    tool,
    category,
    rectWidth,
    rectHeight,
    rectAngle,
    property,
    initialCenter,
    printCenter,
    selectionRequest,
    onFeatureCountChange,
    onObjectsChange,
    onObjectCreated,
    onSelectionChange,
    onPropertyFound,
    onPropertyLookupStart,
    onPropertyLookupError,
    onDrawingStateChange,
  },
  ref,
) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [titleBlockElement] = useState(() => {
    const element = document.createElement('div');
    element.className = 'map-titleblock-host';
    return element;
  });
  const [addressMarkerElement] = useState(() => {
    const element = document.createElement('div');
    element.className = 'address-marker';
    element.setAttribute('aria-hidden', 'true');
    return element;
  });

  const drawSource = useRef<VectorSource | null>(null);
  const previewSource = useRef<VectorSource | null>(null);
  const printSource = useRef<VectorSource | null>(null);
  const propertyLabelSource = useRef<VectorSource | null>(null);
  if (!drawSource.current) drawSource.current = new VectorSource();
  if (!previewSource.current) previewSource.current = new VectorSource();
  if (!printSource.current) printSource.current = new VectorSource();
  if (!propertyLabelSource.current) propertyLabelSource.current = new VectorSource();

  const selectRef = useRef<Select | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const drawLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const frameFeatureRef = useRef<Feature<Polygon> | null>(null);
  const shadeFeatureRef = useRef<Feature<Polygon> | null>(null);
  const maskFeatureRef = useRef<Feature<Polygon> | null>(null);
  const tooltipElementRef = useRef<HTMLDivElement | null>(null);
  const tooltipOverlayRef = useRef<Overlay | null>(null);
  const titleBlockOverlayRef = useRef<Overlay | null>(null);
  const addressMarkerOverlayRef = useRef<Overlay | null>(null);
  const updateFrameRef = useRef<() => void>(() => undefined);
  const updateTitleBlockRef = useRef<() => void>(() => undefined);
  const refreshLabelsRef = useRef<() => void>(() => undefined);
  const labelAbortRef = useRef<AbortController | null>(null);
  const labelTimerRef = useRef<number | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);

  const formatRef = useRef(format);
  formatRef.current = format;
  const printCenterRef = useRef(printCenter);
  printCenterRef.current = printCenter;
  const configRef = useRef(config);
  configRef.current = config;
  const callbacksRef = useRef({
    onFeatureCountChange,
    onObjectsChange,
    onObjectCreated,
    onSelectionChange,
    onPropertyFound,
    onPropertyLookupStart,
    onPropertyLookupError,
    onDrawingStateChange,
  });
  callbacksRef.current = {
    onFeatureCountChange,
    onObjectsChange,
    onObjectCreated,
    onSelectionChange,
    onPropertyFound,
    onPropertyLookupStart,
    onPropertyLookupError,
    onDrawingStateChange,
  };

  const updatePrintFrame = useCallback(() => {
    const map = mapRef.current;
    const frameFeature = frameFeatureRef.current;
    const shadeFeature = shadeFeatureRef.current;
    const maskFeature = maskFeatureRef.current;
    if (!map || !frameFeature || !shadeFeature || !maskFeature) {
      return;
    }
    const center = printCenterRef.current;
    const formatConfig = configRef.current.formats[formatRef.current];
    if (!formatConfig) {
      return;
    }
    const [width, height] = formatConfig.ground_size_m;
    const [cx, cy] = center;
    const extent: [number, number, number, number] = [
      cx - width / 2,
      cy - height / 2,
      cx + width / 2,
      cy + height / 2,
    ];
    frameFeature.setGeometry(fromExtent(extent));

    const pad = 100_000;
    const [minx, miny, maxx, maxy] = extent;
    const frameRing = fromExtent(extent).getCoordinates()[0];
    const outerRing: [number, number][] = [
      [minx - pad, miny - pad],
      [maxx + pad, miny - pad],
      [maxx + pad, maxy + pad],
      [minx - pad, maxy + pad],
      [minx - pad, miny - pad],
    ];
    shadeFeature.setGeometry(new Polygon([outerRing, frameRing.slice().reverse()]));

    const [blockWidth, blockHeight] = formatConfig.title_block_ground_size_m;
    maskFeature.setGeometry(
      fromExtent([
        maxx - blockWidth,
        miny,
        maxx,
        miny + blockHeight,
      ]),
    );
  }, []);
  updateFrameRef.current = updatePrintFrame;
  const updateTitleBlock = useCallback(() => {
    const map = mapRef.current;
    const formatConfig = configRef.current.formats[formatRef.current];
    const center = printCenterRef.current;
    const resolution = map?.getView().getResolution();
    if (!map || !formatConfig || !center || !resolution || resolution <= 0) {
      return;
    }
    const [frameWidth, frameHeight] = formatConfig.ground_size_m;
    const [blockWidth, blockHeight] = formatConfig.title_block_ground_size_m;
    const widthPx = Math.max(1, blockWidth / resolution);
    const heightPx = Math.max(1, blockHeight / resolution);
    const fontSize = Math.max(
      5,
      Math.min(12, Math.min(widthPx / 22, heightPx / 7)),
    );
    titleBlockElement.style.width = `${widthPx}px`;
    titleBlockElement.style.height = `${heightPx}px`;
    titleBlockElement.style.fontSize = `${fontSize}px`;
    const frameLeft = center[0] - frameWidth / 2;
    const frameBottom = center[1] - frameHeight / 2;
    titleBlockOverlayRef.current?.setPosition([
      frameLeft + frameWidth - blockWidth / 2,
      frameBottom + blockHeight / 2,
    ]);
  }, [titleBlockElement]);
  updateTitleBlockRef.current = updateTitleBlock;

  const refreshPropertyLabels = useCallback(() => {
    if (labelTimerRef.current !== null) {
      window.clearTimeout(labelTimerRef.current);
    }
    labelTimerRef.current = window.setTimeout(() => {
      const map = mapRef.current;
      const source = propertyLabelSource.current;
      const formatConfig = configRef.current.formats[formatRef.current];
      const center = printCenterRef.current;
      if (!map || !source || !formatConfig) {
        return;
      }
      const [width, height] = formatConfig.ground_size_m;
      labelAbortRef.current?.abort();
      const controller = new AbortController();
      labelAbortRef.current = controller;
      fetchTeigLabels(
        [
          center[0] - width / 2,
          center[1] - height / 2,
          center[0] + width / 2,
          center[1] + height / 2,
        ],
        controller.signal,
      )
        .then((labels) => {
          if (controller.signal.aborted) {
            return;
          }
          source.clear();
          source.addFeatures(
            labels.map((item) => {
              const feature = new Feature(new Point(item.punkt));
              feature.set('tekst', item.tekst);
              return feature;
            }),
          );
        })
        .catch((error: unknown) => {
          if (
            controller.signal.aborted ||
            (error instanceof DOMException && error.name === 'AbortError')
          ) {
            return;
          }
          source.clear();
        });
    }, 220);
  }, []);
  refreshLabelsRef.current = refreshPropertyLabels;

  useEffect(() => {
    addressMarkerOverlayRef.current?.setPosition(printCenter);
  }, [printCenter]);

  const deleteSelected = useCallback(() => {
    const select = selectRef.current;
    const source = drawSource.current;
    if (!select || !source) {
      return;
    }
    const selected = select.getFeatures().getArray().slice();
    for (const feature of selected) {
      source.removeFeature(feature);
    }
    select.getFeatures().clear();
    callbacksRef.current.onSelectionChange(EMPTY_SELECTION);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getCenter() {
        return (mapRef.current?.getView().getCenter() as [number, number]) ?? [
          ...DEFAULT_CENTER,
        ];
      },
      flyTo(punkt: [number, number]) {
        mapRef.current?.getView().animate({
          center: punkt,
          resolution: DEFAULT_RESOLUTION,
          duration: 600,
        });
      },
      finishDrawing() {
        drawRef.current?.finishDrawing();
      },
      abortDrawing() {
        drawRef.current?.abortDrawing();
      },
      getGeoJson() {
        const geojson = new GeoJSON();
        return geojson.writeFeaturesObject(
          drawSource.current?.getFeatures() ?? [],
          {
            dataProjection: PROJECTION_CODE,
            featureProjection: PROJECTION_CODE,
          },
        ) as unknown as GeoJsonFeatureCollection;
      },
      loadGeoJson(collection) {
        const source = drawSource.current;
        if (!source) {
          return;
        }
        const features = new GeoJSON().readFeatures(collection, {
          dataProjection: PROJECTION_CODE,
          featureProjection: PROJECTION_CODE,
        });
        source.clear();
        source.addFeatures(features);
        selectRef.current?.getFeatures().clear();
        callbacksRef.current.onSelectionChange(EMPTY_SELECTION);
      },
      getFeatureCount() {
        return drawSource.current?.getFeatures().length ?? 0;
      },
      setSelectedName(name: string) {
        const select = selectRef.current;
        if (!select) {
          return;
        }
        let changed = false;
        for (const feature of select.getFeatures().getArray()) {
          feature.set('name', name);
          feature.changed();
          changed = true;
        }
        if (changed) {
          callbacksRef.current.onSelectionChange(selectionInfoFor(select));
        }
      },
      setSelectedLabelOptions(showSides: boolean, showArea: boolean) {
        const select = selectRef.current;
        if (!select) {
          return;
        }
        let changed = false;
        for (const feature of select.getFeatures().getArray()) {
          if (feature.getGeometry() instanceof Polygon) {
            feature.set('showSides', showSides);
            feature.set('showArea', showArea);
            feature.changed();
            changed = true;
          }
        }
        if (changed) {
          callbacksRef.current.onSelectionChange(selectionInfoFor(select));
        }
      },
      setSelectedText(text: string) {
        const select = selectRef.current;
        if (!select) {
          return;
        }
        let changed = false;
        for (const feature of select.getFeatures().getArray()) {
          if (
            feature.getGeometry() instanceof Point &&
            feature.get('kategori') === 'tekst'
          ) {
            feature.set('tekst', text);
            feature.changed();
            changed = true;
          }
        }
        if (changed) {
          callbacksRef.current.onSelectionChange(selectionInfoFor(select));
        }
      },
      setSelectedTextColor(color: string) {
        const select = selectRef.current;
        if (!select) {
          return;
        }
        let changed = false;
        for (const feature of select.getFeatures().getArray()) {
          if (
            feature.getGeometry() instanceof Point &&
            feature.get('kategori') === 'tekst'
          ) {
            feature.set('textColor', color);
            feature.changed();
            changed = true;
          }
        }
        if (changed) {
          callbacksRef.current.onSelectionChange(selectionInfoFor(select));
        }
      },
      setSelectedLineOptions(
        style: LineStyle,
        arrowStart: boolean,
        arrowEnd: boolean,
      ) {
        const select = selectRef.current;
        if (!select) {
          return;
        }
        let changed = false;
        for (const feature of select.getFeatures().getArray()) {
          if (
            feature.getGeometry() instanceof LineString &&
            feature.get('kategori') === 'linje'
          ) {
            feature.set('lineStyle', style);
            feature.set('arrowStart', arrowStart);
            feature.set('arrowEnd', arrowEnd);
            feature.changed();
            changed = true;
          }
        }
        if (changed) {
          callbacksRef.current.onSelectionChange(selectionInfoFor(select));
        }
      },
      setSelectedLineColor(color: string) {
        const select = selectRef.current;
        if (!select) {
          return;
        }
        let changed = false;
        for (const feature of select.getFeatures().getArray()) {
          if (
            feature.getGeometry() instanceof LineString &&
            feature.get('kategori') === 'linje'
          ) {
            feature.set('lineColor', color);
            feature.changed();
            changed = true;
          }
        }
        if (changed) {
          callbacksRef.current.onSelectionChange(selectionInfoFor(select));
        }
      },
      setSelectedLineWidth(width: number) {
        const select = selectRef.current;
        if (!select) {
          return;
        }
        const lineWidth = Math.max(1, Math.min(8, Number(width) || 2));
        let changed = false;
        for (const feature of select.getFeatures().getArray()) {
          if (
            feature.getGeometry() instanceof LineString &&
            feature.get('kategori') === 'linje'
          ) {
            feature.set('lineWidth', lineWidth);
            feature.changed();
            changed = true;
          }
        }
        if (changed) {
          callbacksRef.current.onSelectionChange(selectionInfoFor(select));
        }
      },
      setSelectedFontSize(size: number) {
        const select = selectRef.current;
        if (!select) {
          return;
        }
        const fontSize = Math.max(6, Math.min(72, Math.round(size)));
        let changed = false;
        for (const feature of select.getFeatures().getArray()) {
          if (
            feature.getGeometry() instanceof Point &&
            feature.get('kategori') === 'tekst'
          ) {
            feature.set('fontSize', fontSize);
            feature.changed();
            changed = true;
          }
        }
        if (changed) {
          callbacksRef.current.onSelectionChange(selectionInfoFor(select));
        }
      },
      setSelectedCategory(category: Kategori) {
        const select = selectRef.current;
        if (!select) {
          return;
        }
        let changed = false;
        for (const feature of select.getFeatures().getArray()) {
          if (feature.getGeometry() instanceof Polygon) {
            const oldCategory = feature.get('kategori') as Kategori | undefined;
            const oldName = String(feature.get('name') || '');
            feature.set('kategori', category);
            if (!oldName || oldName === KATEGORI_LABELS[oldCategory ?? 'ny']) {
              feature.set('name', KATEGORI_LABELS[category]);
            }
            feature.changed();
            changed = true;
          }
        }
        if (changed) {
          callbacksRef.current.onSelectionChange(selectionInfoFor(select));
        }
      },
      deleteSelected,
      clearAll() {
        drawSource.current?.clear();
        previewSource.current?.clear();
        selectRef.current?.getFeatures().clear();
        callbacksRef.current.onSelectionChange(EMPTY_SELECTION);
      },
    }),
    [deleteSelected],
  );

  useEffect(() => {
    if (!mapElement.current) {
      return;
    }
    const drawVector = drawSource.current!;
    const previewVector = previewSource.current!;
    const printVector = printSource.current!;

    const layers = config.wms_layers.map(
      (layerConfig, index) =>
        new ImageLayer({
          source: new ImageWMS({
            url: layerConfig.url,
            projection: PROJECTION_CODE,
            params: {
              LAYERS: layerConfig.layers,
              VERSION: '1.1.1',
              FORMAT: 'image/png',
              TRANSPARENT: layerConfig.transparent ? 'true' : 'false',
              ...(layerConfig.sld_body
                ? { SLD_BODY: layerConfig.sld_body }
                : {}),
            },
            ratio: 1,
            attributions: layerConfig.attribution,
            crossOrigin: 'anonymous',
          }),
          zIndex: index,
        }),
    );

    const printLayer = new VectorLayer({
      source: printVector,
      zIndex: 20,
      style: printStyle,
    });
    const drawLayer = new VectorLayer({
      source: drawVector,
      zIndex: 10,
      style: drawStyle,
    });
    drawLayerRef.current = drawLayer;
    const previewLayer = new VectorLayer({
      source: previewVector,
      zIndex: 25,
      style: PREVIEW_STYLE,
    });
    const labelVector = propertyLabelSource.current!;
    const propertyLabelLayer = new VectorLayer({
      source: labelVector,
      zIndex: 15,
      style: propertyLabelStyle,
    });

    const frameFeature = new Feature(fromExtent([0, 0, 1, 1]));
    frameFeature.set('role', 'frame');
    const shadeFeature = new Feature(fromExtent([0, 0, 1, 1]));
    shadeFeature.set('role', 'shade');
    const maskFeature = new Feature(fromExtent([0, 0, 1, 1]));
    maskFeature.set('role', 'mask');
    frameFeatureRef.current = frameFeature;
    shadeFeatureRef.current = shadeFeature;
    maskFeatureRef.current = maskFeature;
    printVector.addFeatures([shadeFeature, frameFeature, maskFeature]);

    const tooltipElement = document.createElement('div');
    tooltipElement.className = 'measure-tooltip';
    tooltipElement.hidden = true;
    tooltipElementRef.current = tooltipElement;
    const tooltipOverlay = new Overlay({
      element: tooltipElement,
      positioning: 'bottom-center',
      offset: [0, -14],
      stopEvent: false,
    });
    tooltipOverlayRef.current = tooltipOverlay;

    const titleBlockOverlay = new Overlay({
      element: titleBlockElement,
      positioning: 'center-center',
      stopEvent: false,
    });
    titleBlockOverlayRef.current = titleBlockOverlay;
    const addressMarkerOverlay = new Overlay({
      element: addressMarkerElement,
      positioning: 'bottom-center',
      offset: [0, -2],
      stopEvent: false,
    });
    addressMarkerOverlay.setPosition(printCenterRef.current);
    addressMarkerOverlayRef.current = addressMarkerOverlay;

    const map = new Map({
      target: mapElement.current,
      layers: [
        ...layers,
        printLayer,
        drawLayer,
        previewLayer,
        propertyLabelLayer,
      ],
      overlays: [tooltipOverlay, addressMarkerOverlay, titleBlockOverlay],
      controls: defaultControls().extend([
        new ScaleLine({ units: 'metric', bar: true }),
      ]),
      view: new View({
        projection: PROJECTION_CODE,
        center: initialCenter,
        resolution: DEFAULT_RESOLUTION,
        minResolution: 0.01,
        maxResolution: 8,
      }),
    });
    mapRef.current = map;


    const handleMoveEnd = () => {
      updateTitleBlockRef.current();
    };
    map.on('moveend', handleMoveEnd);
    updateFrameRef.current();
    updateTitleBlockRef.current();
    refreshLabelsRef.current();

    const emitFeatureCount = () =>
      callbacksRef.current.onFeatureCountChange(
        drawVector.getFeatures().length,
      );
    const emitObjects = () =>
      callbacksRef.current.onObjectsChange(
        drawVector
          .getFeatures()
          .map(sceneObjectFor)
          .filter((item): item is SceneObject => item !== null),
      );
    drawVector.on('addfeature', emitFeatureCount);
    drawVector.on('removefeature', emitFeatureCount);
    drawVector.on('changefeature', emitFeatureCount);
    drawVector.on('clear', emitFeatureCount);
    drawVector.on('addfeature', emitObjects);
    drawVector.on('removefeature', emitObjects);
    drawVector.on('changefeature', emitObjects);
    drawVector.on('clear', emitObjects);
    emitFeatureCount();
    emitObjects();

    return () => {
      drawVector.un('addfeature', emitFeatureCount);
      drawVector.un('removefeature', emitFeatureCount);
      drawVector.un('changefeature', emitFeatureCount);
      drawVector.un('clear', emitFeatureCount);
      drawVector.un('addfeature', emitObjects);
      drawVector.un('removefeature', emitObjects);
      drawVector.un('changefeature', emitObjects);
      drawVector.un('clear', emitObjects);
      map.un('moveend', handleMoveEnd);
      if (labelTimerRef.current !== null) {
        window.clearTimeout(labelTimerRef.current);
        labelTimerRef.current = null;
      }
      labelAbortRef.current?.abort();
      labelAbortRef.current = null;
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
      labelVector.clear();
      addressMarkerOverlayRef.current = null;
      titleBlockOverlayRef.current = null;
      map.setTarget(undefined);
      mapRef.current = null;
      selectRef.current = null;
      drawLayerRef.current = null;
      frameFeatureRef.current = null;
      shadeFeatureRef.current = null;
      maskFeatureRef.current = null;
      tooltipElementRef.current = null;
      tooltipOverlayRef.current = null;
      printVector.clear();
    };
  }, [config]);

  useEffect(() => {
    updateFrameRef.current();
    updateTitleBlockRef.current();
    refreshLabelsRef.current();
  }, [format, config, printCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const drawVector = drawSource.current!;
    const previewVector = previewSource.current!;
    const target = map.getTargetElement();
    const interactions: Array<Draw | Select | Translate | Snap> = [];
    let pointerMoveHandler: ((event: MapBrowserEvent) => void) | null = null;
    let clickHandler: ((event: MapBrowserEvent) => void) | null = null;

    const tooltip = tooltipOverlayRef.current;
    const tooltipElement = tooltipElementRef.current;

    const hideTooltip = () => {
      if (tooltip) tooltip.setPosition(undefined);
      if (tooltipElement) tooltipElement.hidden = true;
    };
    hideTooltip();

    const attachMeasureTooltip = (draw: Draw) => {
      draw.on('drawstart', (event: DrawEvent) => {
        const sketch = event.feature;
        if (!tooltip || !tooltipElement) {
          return;
        }
        const update = (moveEvent: MapBrowserEvent) => {
          const geometry = sketch.getGeometry();
          if (!geometry) {
            return;
          }
          const text = measurementText(geometry);
          if (!text) {
            return;
          }
          tooltipElement.textContent = text;
          tooltipElement.hidden = false;
          tooltip.setPosition(moveEvent.coordinate);
        };
        pointerMoveHandler = update;
        map.on('pointermove', update);
        const stop = () => {
          if (pointerMoveHandler) {
            map.un('pointermove', pointerMoveHandler);
            pointerMoveHandler = null;
          }
          hideTooltip();
        };
        draw.once('drawend', stop);
        draw.once('drawabort', stop);
      });
    };

    if (tool === 'polygon' || tool === 'line' || tool === 'plainline') {
      const draw = new Draw({
        source: drawVector,
        type: tool === 'polygon' ? 'Polygon' : 'LineString',
      });
      drawRef.current = draw;
      draw.on('drawstart', () => {
        callbacksRef.current.onDrawingStateChange(true);
      });
      draw.on('drawabort', () => {
        callbacksRef.current.onDrawingStateChange(false);
      });
      draw.on('drawend', () => {
        callbacksRef.current.onDrawingStateChange(false);
      });
      draw.on('drawend', (event: DrawEvent) => {
        event.feature.setId(newFeatureId());
        if (tool === 'line') {
          event.feature.set('kategori', 'avstand');
          event.feature.set('name', 'Avstandsmåling');
        } else if (tool === 'plainline') {
          event.feature.set('kategori', 'linje');
          event.feature.set('name', 'Linje');
          event.feature.set('lineStyle', 'solid');
          event.feature.set('lineColor', '#111827');
          event.feature.set('lineWidth', 2);
          event.feature.set('arrowStart', false);
          event.feature.set('arrowEnd', true);
        } else {
          event.feature.set('kategori', category);
          event.feature.set('name', KATEGORI_LABELS[category]);
          event.feature.set('showSides', true);
          event.feature.set('showArea', false);
        }
        callbacksRef.current.onObjectCreated(String(event.feature.getId()));
      });
      if (tool !== 'plainline') {
        attachMeasureTooltip(draw);
      }
      map.addInteraction(draw);
      interactions.push(draw);
      const snap = new Snap({
        source: drawVector,
        pixelTolerance: isCoarsePointer() ? 22 : 10,
      });
      map.addInteraction(snap);
      interactions.push(snap);
    } else if (tool === 'rectangle') {
      const preview = new Feature(
        rectangleGeometry(DEFAULT_CENTER, 1, 1, 0),
      );
      previewVector.addFeature(preview);
      const valid = rectWidth > 0 && rectHeight > 0;
      const updatePreview = (coordinate: Coordinate) => {
        if (!valid) {
          preview.setGeometry(undefined);
          return;
        }
        preview.setGeometry(
          rectangleGeometry(coordinate, rectWidth, rectHeight, rectAngle),
        );
      };
      pointerMoveHandler = (event) => updatePreview(event.coordinate);
      map.on('pointermove', pointerMoveHandler);
      clickHandler = (event) => {
        if (!valid) {
          return;
        }
        const feature = new Feature(
          rectangleGeometry(
            event.coordinate,
            rectWidth,
            rectHeight,
            rectAngle,
          ),
        );
        feature.setId(newFeatureId());
        feature.set('kategori', category);
        feature.set('name', KATEGORI_LABELS[category]);
        feature.set('showSides', true);
        feature.set('showArea', false);
        drawVector.addFeature(feature);
        preview.setGeometry(undefined);
        callbacksRef.current.onObjectCreated(String(feature.getId()));
      };
      map.on('singleclick', clickHandler);
      if (target) {
        target.style.cursor = 'crosshair';
      }
    } else if (tool === 'text') {
      clickHandler = (event) => {
        const feature = new Feature(new Point(event.coordinate));
        feature.setId(newFeatureId());
        feature.set('kategori', 'tekst');
        feature.set('name', 'Tekst');
        feature.set('tekst', 'Tekst');
        feature.set('textColor', '#111827');
        feature.set('fontSize', 14);
        drawVector.addFeature(feature);
        callbacksRef.current.onObjectCreated(String(feature.getId()));
      };
      map.on('singleclick', clickHandler);
      if (target) {
        target.style.cursor = 'text';
      }
    } else {
      // Keep Translate active for touch. Starting a drag on a selected
      // feature moves it; dragging elsewhere still pans the map.
      const hitTolerance = isCoarsePointer() ? 20 : 8;
      const select = new Select({
        condition: click,
        hitTolerance,
        style: selectedDrawStyle,
        layers: (layer) => layer === drawLayerRef.current,
      });
      select.on('select', () => {
        callbacksRef.current.onSelectionChange(selectionInfoFor(select));
      });
      selectRef.current = select;
      map.addInteraction(select);
      interactions.push(select);

      const translate = new Translate({
        features: select.getFeatures(),
        hitTolerance,
      });
      map.addInteraction(translate);
      interactions.push(translate);

      pointerMoveHandler = (event) => {
        if (!target) {
          return;
        }
        const hit = map.forEachFeatureAtPixel(
          event.pixel,
          (feature) => feature,
          {
            hitTolerance,
            layerFilter: (layer) => layer === drawLayerRef.current,
          },
        );
        target.style.cursor = hit ? 'pointer' : '';
      };
      map.on('pointermove', pointerMoveHandler);

      const handleLookup = (event: MapBrowserEvent) => {
        const [ost, nord] = event.coordinate;
        lookupAbortRef.current?.abort();
        const controller = new AbortController();
        lookupAbortRef.current = controller;
        callbacksRef.current.onPropertyLookupStart();
        reverseGeocode(ost, nord, 15, controller.signal)
          .then((found) => {
            if (controller.signal.aborted) {
              return;
            }
            if (!found) {
              callbacksRef.current.onPropertyLookupError(
                'Ingen adresse funnet innen 15 m. Klikk nærmere en bygning.',
              );
              return;
            }
            callbacksRef.current.onPropertyFound(found);
          })
          .catch((error: unknown) => {
            if (
              controller.signal.aborted ||
              (error instanceof DOMException && error.name === 'AbortError')
            ) {
              return;
            }
            callbacksRef.current.onPropertyLookupError(
              error instanceof Error
                ? error.message
                : 'Kunne ikke hente eiendomsopplysninger.',
            );
          });
      };
      map.on('singleclick', handleLookup);
      clickHandler = handleLookup;
      if (target) {
        target.style.cursor = '';
      }
    }

    return () => {
      if (pointerMoveHandler) {
        map.un('pointermove', pointerMoveHandler);
      }
      if (clickHandler) {
        map.un('singleclick', clickHandler);
      }
      for (const interaction of interactions) {
        map.removeInteraction(interaction);
      }
      drawRef.current = null;
      callbacksRef.current.onDrawingStateChange(false);
      if (tool === 'rectangle') {
        previewVector.clear();
      }
      if (target) {
        target.style.cursor = '';
      }
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
      if (selectRef.current) {
        selectRef.current.getFeatures().clear();
        selectRef.current = null;
        callbacksRef.current.onSelectionChange(EMPTY_SELECTION);
      }
      hideTooltip();
    };
  }, [tool, category, rectWidth, rectHeight, rectAngle, config]);

  useEffect(() => {
    if (!selectionRequest) {
      return;
    }
    const select = selectRef.current;
    const source = drawSource.current;
    if (!select || !source) {
      return;
    }
    const feature = source.getFeatureById(selectionRequest.id);
    if (!feature) {
      return;
    }
    select.getFeatures().clear();
    select.getFeatures().push(feature);
    callbacksRef.current.onSelectionChange(selectionInfoFor(select));
  }, [selectionRequest, tool]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const select = selectRef.current;
      if (!select || select.getFeatures().getLength() === 0) {
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
        return;
      }
      const map = mapRef.current;
      const resolution = map?.getView().getResolution() ?? DEFAULT_RESOLUTION;
      const step = resolution * (event.shiftKey ? 10 : 1);
      let dx = 0;
      let dy = 0;
      if (event.key === 'ArrowLeft') dx = -step;
      else if (event.key === 'ArrowRight') dx = step;
      else if (event.key === 'ArrowUp') dy = step;
      else if (event.key === 'ArrowDown') dy = -step;
      else return;
      event.preventDefault();
      for (const feature of select.getFeatures().getArray()) {
        feature.getGeometry()?.translate(dx, dy);
        feature.changed();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected]);

  return (
    <>
      <div className="map" ref={mapElement} />
      {createPortal(
        <MapTitleBlock
          property={property}
          format={format}
          scale={config.scale}
          municipality={property.municipality}
        />,
        titleBlockElement,
      )}
    </>
  );
});

export default MapView;
