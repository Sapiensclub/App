import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

// The one location seam (PRD 10.10 / spec §4). Everything location-shaped in
// the app goes through here: GPS in, coordinates + distance + ETA out, and a
// showLocation() that deep-links to the user's own maps app. When an embedded
// map arrives later ([P2]), only this module and the display component change.

export type Coords = { lat: number; lng: number };

/** Ask for foreground location permission. Returns true if granted. */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/** Current position (throws if permission missing or GPS unavailable). */
export async function getCurrentCoords(): Promise<Coords> {
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/**
 * A human locality label for approx_area ("Koregaon Park", "Baner") — the
 * ONLY location detail helpers see before confirm (staged disclosure).
 */
export async function reverseGeocodeLocality(coords: Coords): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coords.lat,
      longitude: coords.lng,
    });
    const r = results[0];
    if (!r) return null;
    return r.district || r.subregion || r.city || r.region || null;
  } catch {
    return null;
  }
}

/** Great-circle distance in meters (haversine). */
export function distanceMeters(a: Coords, b: Coords): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Rough walking ETA in minutes (~4.2 km/h + a small buffer). */
export function walkingEtaMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 70));
}

/** "400 m" / "1.2 km" style label. */
export function distanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 50) * 50} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Open the destination in the user's own maps app (their app, their (zero)
 * cost, better navigation than we'd build — PRD 10.10).
 */
export function showLocation(dest: Coords, label = 'Meeting point'): Promise<void> {
  const name = encodeURIComponent(label);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${dest.lat},${dest.lng}&q=${name}`
      : `geo:${dest.lat},${dest.lng}?q=${dest.lat},${dest.lng}(${name})`;
  return Linking.openURL(url);
}
