import type { PdfWorkerRequest, PdfWorkerResponse } from './pdfWorkerProtocol';
import { extentForCenter, wmsSizePx } from './layout';
import { renderSituasjonsplan } from './pdf';
import { fetchMapComposite } from './wms';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<PdfWorkerRequest>) => void) | null;
  postMessage(message: PdfWorkerResponse, transfer?: Transferable[]): void;
};

workerScope.onmessage = (event) => {
  const request = event.data;
  void (async () => {
    try {
      workerScope.postMessage({
        requestId: request.requestId,
        type: 'progress',
        stage: 'map',
      });
      const extent = extentForCenter(request.center, request.format);
      const [width, height] = wmsSizePx(request.format);
      const mapPng = await fetchMapComposite(extent, width, height);

      workerScope.postMessage({
        requestId: request.requestId,
        type: 'progress',
        stage: 'pdf',
      });
      const rendered = await renderSituasjonsplan({
        format: request.format,
        center: request.center,
        property: request.property,
        geojson: request.geojson,
        labels: request.labels,
        mapPng,
      });
      const bytes = rendered.bytes.slice().buffer;

      workerScope.postMessage(
        {
          requestId: request.requestId,
          type: 'done',
          bytes,
          filename: rendered.filename,
        },
        [bytes],
      );
    } catch (cause) {
      workerScope.postMessage({
        requestId: request.requestId,
        type: 'error',
        message:
          cause instanceof Error
            ? cause.message
            : 'Kunne ikke generere PDF.',
      });
    }
  })();
};
