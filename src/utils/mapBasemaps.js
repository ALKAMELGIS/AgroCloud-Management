/**
 * Shared Leaflet basemap tile definitions, in the order of the Esri basemap gallery.
 * `name` is the label in basemap lists, `preview` a z4 tile over the Gulf for the
 * gallery thumbnail, `overlay` an optional labels layer drawn on top.
 * Keys `light`, `osm`, `satellite`, `topo` are kept: people's saved choices use them.
 */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const esri = (service) => `${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`;
const esriPreview = (service) => `${ESRI}/${service}/MapServer/tile/4/6/10`;
const ESRI_CREDIT = '&copy; Esri';

export const BASEMAPS = {
  satellite: {
    label: 'Imagery',
    name: 'Imagery',
    url: esri('World_Imagery'),
    preview: esriPreview('World_Imagery'),
    attribution: `${ESRI_CREDIT}, Maxar, Earthstar Geographics`,
  },
  hybrid: {
    label: 'Imagery Hybrid',
    name: 'Imagery Hybrid',
    url: esri('World_Imagery'),
    overlay: esri('Reference/World_Boundaries_and_Places'),
    preview: esriPreview('World_Imagery'),
    attribution: `${ESRI_CREDIT}, Maxar, Earthstar Geographics, HERE`,
  },
  streets: {
    label: 'Streets',
    name: 'Streets',
    url: esri('World_Street_Map'),
    preview: esriPreview('World_Street_Map'),
    attribution: `${ESRI_CREDIT}, HERE, Garmin, USGS`,
  },
  topo: {
    label: 'Topographic',
    name: 'Topographic',
    url: esri('World_Topo_Map'),
    preview: esriPreview('World_Topo_Map'),
    attribution: `${ESRI_CREDIT}, HERE, Garmin, USGS`,
  },
  gray: {
    label: 'Light Gray Canvas',
    name: 'Light Gray Canvas',
    url: esri('Canvas/World_Light_Gray_Base'),
    overlay: esri('Canvas/World_Light_Gray_Reference'),
    preview: esriPreview('Canvas/World_Light_Gray_Base'),
    attribution: `${ESRI_CREDIT}, HERE, Garmin`,
    maxNativeZoom: 16,
  },
  dark: {
    label: 'Dark Gray Canvas',
    name: 'Dark Gray Canvas',
    url: esri('Canvas/World_Dark_Gray_Base'),
    overlay: esri('Canvas/World_Dark_Gray_Reference'),
    preview: esriPreview('Canvas/World_Dark_Gray_Base'),
    attribution: `${ESRI_CREDIT}, HERE, Garmin`,
    maxNativeZoom: 16,
  },
  natgeo: {
    label: 'National Geographic',
    name: 'National Geographic',
    url: esri('NatGeo_World_Map'),
    preview: esriPreview('NatGeo_World_Map'),
    attribution: `${ESRI_CREDIT}, National Geographic, Garmin, HERE`,
    maxNativeZoom: 16,
  },
  oceans: {
    label: 'Oceans',
    name: 'Oceans',
    url: esri('Ocean/World_Ocean_Base'),
    overlay: esri('Ocean/World_Ocean_Reference'),
    preview: esriPreview('Ocean/World_Ocean_Base'),
    attribution: `${ESRI_CREDIT}, GEBCO, NOAA, Garmin`,
    maxNativeZoom: 13,
  },
  terrain: {
    label: 'Terrain with Labels',
    name: 'Terrain with Labels',
    url: esri('World_Terrain_Base'),
    overlay: esri('Reference/World_Reference_Overlay'),
    preview: esriPreview('World_Terrain_Base'),
    attribution: `${ESRI_CREDIT}, USGS, NOAA`,
    maxNativeZoom: 13,
  },
  osm: {
    label: 'OpenStreetMap',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    preview: 'https://a.tile.openstreetmap.org/4/10/6.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  light: {
    label: 'Light map',
    name: 'Light map',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    preview: 'https://a.basemaps.cartocdn.com/light_all/4/10/6.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
};
