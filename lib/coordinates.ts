// Parse free-form coordinate strings into { lat, lon }.
//
// Supports four formats:
//   - Decimal Degree (DD):           "34.12345 -118.56789"
//   - Decimal Minutes (DM):          "34 7.4070 -118 34.0734"
//   - Degrees Minutes Seconds (DMS): "34 07 24.4 -118 34 04.4"
//   - MPS / Hexagon Intergraph:      "(-118:34:04.4400,34:07:24.4200)"
//
// Rules:
//   - The first numeric coordinate in the string is latitude; the second
//     is longitude. Lat ranges -90..90, lon ranges -180..180.
//   - Negative values use a leading hyphen. N/S/E/W suffixes are not
//     supported.
//   - In DM and DMS, only the *degree* component carries the sign. The
//     minutes and seconds are always positive magnitudes.
//   - MPS preserves the original SAROPS field order: longitude first,
//     then latitude.
//   - Output precision is 5 decimal places.

export type LatLon = { lat: number; lon: number };

// Format-detection regexes. Patterns are tried in order of specificity
// (DMS → DM → DD) so a 6-number string isn't misread as 4 or 2 numbers.
const regexMPS     = /\(-?\d+:\d+:\d+(?:\.\d+)?\s*,\s*-?\d+:\d+:\d+(?:\.\d+)?\)/;
const regexDDPair  = /(-?\d+\.\d+)[^\d.-]+(-?\d+\.\d+)/;
const regexDMPair  = /(-?\d+)[^\d.-]+(\d+\.\d+)[^\d.-]+(-?\d+)[^\d.-]+(\d+\.\d+)/;
const regexDMSPair = /(-?\d+)[^\d.-]+(\d+)[^\d.-]+(\d+(?:\.\d+)?)[^\d.-]+(-?\d+)[^\d.-]+(\d+)[^\d.-]+(\d+(?:\.\d+)?)/;

export type Topic = 'MPS' | 'decimalDegree' | 'decimalMinutes' | 'DegMinSec' | 'stop';

export function detectTopic(coords: string): Topic {
    if (regexMPS.test(coords)) return 'MPS';
    if (regexDMSPair.test(coords)) return 'DegMinSec';
    if (regexDMPair.test(coords)) return 'decimalMinutes';
    if (regexDDPair.test(coords)) return 'decimalDegree';
    return 'stop';
}

function round5(n: number): number {
    return Number(n.toFixed(5));
}

function dmsToDecimal(deg: number, min: number, sec: number, sign: number): number {
    return sign * (Math.abs(deg) + min / 60 + sec / 3600);
}

function parseDecimalDegree(coords: string): LatLon {
    const m = coords.match(regexDDPair);
    if (!m) throw new Error('Could not parse decimal-degree coordinates');
    return { lat: round5(Number(m[1])), lon: round5(Number(m[2])) };
}

function parseDecimalMinute(coords: string): LatLon {
    const m = coords.match(regexDMPair);
    if (!m) throw new Error('Could not parse decimal-minute coordinates');
    const latSign = m[1].startsWith('-') ? -1 : 1;
    const lonSign = m[3].startsWith('-') ? -1 : 1;
    return {
        lat: round5(latSign * (Math.abs(Number(m[1])) + Number(m[2]) / 60)),
        lon: round5(lonSign * (Math.abs(Number(m[3])) + Number(m[4]) / 60))
    };
}

function parseDegMinSec(coords: string): LatLon {
    const m = coords.match(regexDMSPair);
    if (!m) throw new Error('Could not parse DMS coordinates');
    const latSign = m[1].startsWith('-') ? -1 : 1;
    const lonSign = m[4].startsWith('-') ? -1 : 1;
    return {
        lat: round5(dmsToDecimal(Number(m[1]), Number(m[2]), Number(m[3]), latSign)),
        lon: round5(dmsToDecimal(Number(m[4]), Number(m[5]), Number(m[6]), lonSign))
    };
}

function parseMPS(coords: string): LatLon {
    // Hexagon Intergraph: "(-DDD:MM:SS.ssss,DD:MM:SS.ssss)" — longitude first.
    const m = coords.match(/\((-?\d+):(\d+):(\d+(?:\.\d+)?)\s*,\s*(-?\d+):(\d+):(\d+(?:\.\d+)?)\)/);
    if (!m) throw new Error('Could not parse MPS coordinates');
    const lonSign = m[1].startsWith('-') ? -1 : 1;
    const latSign = m[4].startsWith('-') ? -1 : 1;
    return {
        lat: round5(dmsToDecimal(Number(m[4]), Number(m[5]), Number(m[6]), latSign)),
        lon: round5(dmsToDecimal(Number(m[1]), Number(m[2]), Number(m[3]), lonSign))
    };
}

export function parseCoordinates(input: { coordinates?: string; lat?: number | string; lon?: number | string }): LatLon {
    const coords = (input.coordinates !== undefined && input.coordinates !== null && input.coordinates !== '')
        ? input.coordinates
        : JSON.stringify(input.lat) + ', ' + JSON.stringify(input.lon);

    const topic = detectTopic(coords);
    switch (topic) {
        case 'MPS': return parseMPS(coords);
        case 'decimalDegree': return parseDecimalDegree(coords);
        case 'decimalMinutes': return parseDecimalMinute(coords);
        case 'DegMinSec': return parseDegMinSec(coords);
        case 'stop': throw new Error(`Could not detect coordinate format: ${coords}`);
    }
}
