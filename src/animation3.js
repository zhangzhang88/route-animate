import animatePath from "./animatePath2";
import flyInAndRotate from "./flyInAndRotate";
import * as turf from "@turf/turf";
import add3D from "./add3D2";
import { delay } from "./util";

const getPinRouteGeoJson = async () => {
  const response = await fetch("./data/route-dongguan.geojson");
  const pinRouteGeojson = await response.json();
  return pinRouteGeojson;
};

const getMapOptions = (container) => {
  return {
    container,
    projection: "globe",
    zoom: 11,
    center: { lng: 113.8558, lat: 22.9890 },
    pitch: 40,
    bearing: 0,
    style: "mapbox://styles/mapbox/satellite-streets-v12",
    interactive: true,
    hash: false,
  };
};

const playAnimations = async (mapboxgl, map, path, lineId, marker, duration) => {
  return new Promise(async (resolve) => {
    const targetLngLat = {
      lng: path.geometry.coordinates[0][0],
      lat: path.geometry.coordinates[0][1],
    };
    await delay(1_000);

    const { bearing, altitude } = await flyInAndRotate({
      map,
      targetLngLat,
      duration: 6_000,
      startAltitude: 1_000_000,
      endAltitude: 8_000,
      startBearing: 0,
      endBearing: -20,
      startPitch: 40,
      endPitch: 50,
      mapboxgl,
    });
    const durationFactor = 2;
    const { endBearing } = await animatePath({
      map,
      duration: duration || 10000 * durationFactor,
      path,
      startBearing: bearing,
      startAltitude: altitude,
      pitch: 50,
      mapboxgl,
      lineId: "line",
      marker,
    });

    setTimeout(() => {
      resolve();
    }, 3_000);
  });
};

export { getMapOptions, playAnimations, getPinRouteGeoJson, add3D };
