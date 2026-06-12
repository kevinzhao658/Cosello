/** GeoJSON circle polygon approximating `radiusMi` miles around (lat, lng).
 *  Mirrors backend/services/mapbox.py:_circle_geojson — mid-Manhattan degree scale. */
const DEG_PER_MILE_LAT = 1 / 69.0;
const DEG_PER_MILE_LNG = 1 / 52.6;

export function circlePolygon(
  lat: number,
  lng: number,
  radiusMi: number,
  points = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (2 * Math.PI * i) / points;
    coords.push([
      lng + radiusMi * DEG_PER_MILE_LNG * Math.cos(a),
      lat + radiusMi * DEG_PER_MILE_LAT * Math.sin(a),
    ]);
  }
  coords.push(coords[0]);
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}
