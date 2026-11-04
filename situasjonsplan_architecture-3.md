# Architecture: Interactive Situasjonsplan (Situation Map) Module

This document outlines the technical architecture for fetching, displaying, and interacting with official Norwegian mapping data to generate a legally compliant "Situasjonsplan" for a building application (Byggesøknad) nationwide in Norway.

## 1. Map Data & Layers (WMS Integration)

To match the official Norkart/municipal standards, the application must use standard colored Web Map Service (WMS) endpoints from **Kartverket (Geonorge)** rather than grayscale.

### **Correct URLs and Layers**

The web client and browser PDF renderer request map tiles from these endpoints:

1. **Cadastre / Property Boundaries (Matrikkel):** `https://wms.geonorge.no/skwms1/wms.matrikkel` (or equivalent municipal FKB data).
   * **Required Layers:**
     * `Eiendomsgrense` (Property lines)
     * `Teig_tekst` or `GardsOgBruksnummer` (Crucial for displaying the red Gnr/Bnr labels like "62/1252" in the center of each parcel).

2. **Building Footprints and Roof Details (FKB-Bygning):** `https://wms.geonorge.no/skwms1/wms.fkb`
   To avoid flat-looking buildings, you must stack the 2D footprints beneath the roof lines.
   * **Required Layers (Order matters - bottom to top):**
     * `Bygning` (Provides the base Orange/Yellow colored fill).
     * `Takoverbygg` (Roof overhangs).
     * `Takriss` (Outer outline of the roof).
     * `Taksprang` (Breaks/edges in the roof geometry).
     * `Mønelinje` (The center ridge line of a pitched roof).

*Note: Water and sewage (VA-ledninger) is managed by individual municipalities. Add a municipal WMS layer if one is available.*

## 2. Web Client Architecture (Frontend)

To handle Norwegian map projections without distortion and enable precise CAD-like drawing, the frontend should be built with **React** and **OpenLayers** (via the `ol` npm package).

### **Core Configuration**

* **Projection:** You **MUST** configure the map to use `EPSG:25833` (EUREF89 / UTM Zone 33N). Do not use standard Web Mercator (`EPSG:3857`), as it distorts metric measurements.
* **Dependency:** Import `proj4js` into OpenLayers to define `EPSG:25833`.

### **Implementation Structure**

1. **Base Map Layer:** `ol/layer/Image` or `ol/layer/Tile` fetching the Geonorge WMS with the correct colored building, roof detail, and text layers active.
2. **Vector Layer (Drawing Canvas):** An `ol/layer/Vector` where the user's drawings and dimension lines will live.
3. **UI Overlay:** A React panel allowing users to input precise dimensions (e.g., typing "4.5m x 6m").

## 3. Strict Symbology and Exact Color Codes

To draw new buildings or extensions, use the `ol/interaction/Draw` and `ol/interaction/Snap` modules. The rendering engine MUST adhere to the following Hex/RGB codes to match Norkart cartography standards.

### **Existing Terrain & Buildings (WMS Styles)**

* **Background / Land Parcels:** Pure White (`#FFFFFF` or transparent). Do not use beige/peach fills, as it reduces contrast.
* **Roads:** Light Gray (`#E6E6E6`).
* **Residential Buildings (Boligbygg):**
  * **Fill:** Bright Orange (`#FF7F00` or `rgb(255, 127, 0)`).
  * **Outline:** Solid Black.
* **Other Buildings (Andre bygg - e.g., garages):**
  * **Fill:** Bright Yellow (`#FFFF00` or `rgb(255, 255, 0)`).
  * **Outline:** Solid Black.
* **Roofs:** Solid Black lines rendering the `Mønelinje` and `Takriss` on top of the fills.

### **Property Lines and Labels (Eiendomsinformasjon)**

* **Lines:** Solid Red lines (`#FF0000`). Ensure line thickness varies slightly based on boundary accuracy.
* **Text Labels:** Gnr/Bnr (e.g., "12/21") MUST be rendered in Red (`#FF0000`).

### **New Buildings / Extensions (Nye tiltak - User Drawn)**

* **Outline (Stroke):** Solid Red (`#FF0000`), 2px width.
* **Fill:** Light transparent red (`rgba(255, 0, 0, 0.3)`) or a red diagonal crosshatch pattern.

### **Dimension Lines and Text (Mål og Avstander)**

* **Lines:** Dashed or solid **Red** lines (`#FF0000`) with red arrowheads indicating the exact distance from the new structure to the neighbor boundary. This geometric line is mandatory.
* **Text:** The measurement text (e.g., "12,2 m") **MUST** be in Red and placed directly alongside or over the dimension line.

## 4. File Output and Naming Conventions

When the user finishes drawing, the frontend renders a PDF in the browser, combining the WMS layers and the user's GeoJSON at an exact **1:500 scale**.

### **What to Name the File**

DiBK and Norwegian municipalities expect structured naming conventions for automated sorting into their archives.

**Standard Naming Format:**
`[Dokumenttype]_[Gnr]-[Bnr]-[Fnr].pdf`

**Example:**
If the property has Gårdsnummer 12 and Bruksnummer 21, the file **must** be named:
`Situasjonsplan_12-21.pdf`

*(If there is a Festenummer (Fnr) or Seksjonsnummer (Snr), append them: `Situasjonsplan_12-21-321-321.pdf`)*

### **PDF Layout Requirements**

The final generated PDF must include:

1. **Format:** A4 or A3 size.
2. **Scale:** Exactly 1:500.
3. **Title Block (Tittelfelt):** In the bottom right corner, containing the property address, Gnr/Bnr, date, coordinate system (UTM 32N/33N depending on exact location), scale, and the applicant's name.
4. **Orientation:** A North Arrow (Nordpil) pointing UP.