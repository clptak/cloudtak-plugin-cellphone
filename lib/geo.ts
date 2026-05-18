// Great-circle destination point (haversine forward).

const R = 6371008.8; // mean Earth radius in meters

export function destination(
    lat: number,
    lon: number,
    distanceMeters: number,
    bearingDeg: number
): { lat: number; lon: number } {
    const φ1 = (lat * Math.PI) / 180;
    const λ1 = (lon * Math.PI) / 180;
    const θ = (bearingDeg * Math.PI) / 180;
    const δ = distanceMeters / R;

    const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
    const φ2 = Math.asin(sinφ2);
    const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
    const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
    const λ2 = λ1 + Math.atan2(y, x);

    return {
        lat: (φ2 * 180) / Math.PI,
        lon: (((λ2 * 180) / Math.PI + 540) % 360) - 180
    };
}
