import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';

import { PROJECTION_CODE } from './config';

proj4.defs(
  PROJECTION_CODE,
  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
);
register(proj4);
