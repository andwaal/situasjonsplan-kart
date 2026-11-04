import type {
  EiendomLabel,
  FormatConfig,
  GeoJsonFeatureCollection,
  PropertyForm,
} from './config';

export type PdfWorkerStage = 'map' | 'pdf';

export interface PdfWorkerRequest {
  requestId: number;
  format: FormatConfig;
  center: [number, number];
  property: PropertyForm;
  geojson: GeoJsonFeatureCollection;
  labels: EiendomLabel[];
}

export type PdfWorkerResponse =
  | { requestId: number; type: 'progress'; stage: PdfWorkerStage }
  | {
      requestId: number;
      type: 'done';
      bytes: ArrayBuffer;
      filename: string;
    }
  | { requestId: number; type: 'error'; message: string };
