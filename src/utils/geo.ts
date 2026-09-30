export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth\'s radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function formatDistance(km: number): string {
  if (km < 0.1) {
    return `${Math.round(km * 1000)} m from your location`;
  }
  const formatted = km < 10 ? (Number.isInteger(km) ? km.toFixed(0) : km.toFixed(1)) : Math.round(km).toString();
  return `${formatted} KM from your location`;
}

