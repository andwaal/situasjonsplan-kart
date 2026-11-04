import type { AppConfig } from './config';
import { PAGE_FORMATS, SCALE } from './layout';
import { WMS_LAYERS } from './wms';

export const APP_CONFIG: AppConfig = {
  projection: {
    code: 'EPSG:25833',
    name: 'ETRS89 / UTM zone 33N',
    definition:
      '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  },
  scale: SCALE,
  wms_layers: WMS_LAYERS,
  formats: PAGE_FORMATS,
};
