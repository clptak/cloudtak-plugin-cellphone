// Port of the node-red "Coordinates Parse" subflow.
//
// NOTE: the source regexes hard-code US-SW latitude bands (3X) and US-SW
// longitude bands (11X). Behaviour is preserved here for parity.

export type LatLon = { lat: number; lon: number };

const regexMPS = /\(-\d\d\d:\d\d:\d\d.\d\d\d\d,\d\d:\d\d:\d\d.\d\d\d\d\)/g;
const regexDDdddd = /(\d+\.\d+)(\s|\S|\W+)(\d+\.\d+)/g;
const regexDMmm = /(\d+)[\s|\W](\d+\.\d+)([\s|\W|\w]+)(\d+)[\s|\W](\d+\.\d+)/g;
const regexDMSnoDec = /((\d+)(\s|\W)(\d+)([^.])(\d+))(.*)((\d+)(\s|\W)(\d+)([^.])(\d+))/g;

const regexLatDD = /((3\d\.\d+))/g;
const regexLonDD = /((11\d\.\d+))/g;
const regexLatDMSnoDec = /(3\d)(\s|\W)(\d+)(\s|\W)(\d+)/g;
const regexLonDMSnoDec = /(11\d)(\s|\W)(\d+)(\s|\W)(\d+)/g;
const regexLatDM = /(3\d)[\W|\s](\d+\.\d+)/g;
const regexLonDM = /(11\d)[\W|\s](\d+\.\d+)/g;

export type Topic = 'MPS' | 'decimalDegree' | 'decimalMinutes' | 'DegMinSec' | 'stop';

export function detectTopic(coords: string): Topic {
    if (coords.match(regexMPS) != null) return 'MPS';
    if (coords.match(regexDDdddd) != null) return 'decimalDegree';
    if (coords.match(regexDMmm) != null) return 'decimalMinutes';
    if (coords.match(regexDMSnoDec) != null) return 'DegMinSec';
    return 'stop';
}

function dmsToDD(latDms: [number, number, number], lonDms: [number, number, number]): LatLon {
    const latmin = latDms[1] + latDms[2] / 60;
    const lonmin = lonDms[1] + lonDms[2] / 60;
    const latdd = Number((latDms[0] + latmin / 60).toFixed(5));
    const londd = Number((-1 * (Math.abs(lonDms[0]) + lonmin / 60)).toFixed(5));
    return { lat: latdd, lon: londd };
}

function parseDecimalDegree(coords: string): LatLon {
    const latMatch = coords.match(regexLatDD);
    const lonMatch = coords.match(regexLonDD);
    if (!latMatch || !lonMatch) throw new Error('Could not parse decimal-degree coordinates');
    const latdd = Number(latMatch[0]);
    const londd = Number(lonMatch[0]);
    const latMin = (latdd - Math.floor(latdd)) * 60;
    const lonMin = (londd - Math.floor(londd)) * 60;
    const latSec = (latMin - Math.floor(latMin)) * 60;
    const lonSec = (lonMin - Math.floor(lonMin)) * 60;
    const latDms: [number, number, number] = [Math.floor(latdd), Math.floor(latMin), Number(latSec.toFixed(4))];
    const lonDms: [number, number, number] = [-1 * Math.floor(londd), Math.floor(lonMin), Number(lonSec.toFixed(4))];
    return dmsToDD(latDms, lonDms);
}

function parseDegMinSec(coords: string): LatLon {
    const latMatches = coords.match(regexLatDMSnoDec);
    const lonMatches = coords.match(regexLonDMSnoDec);
    if (!latMatches || !lonMatches) throw new Error('Could not parse DMS coordinates');
    const latraw = latMatches[0].split(/\D/);
    const lonraw = lonMatches[0].split(/\D/);
    const latDms: [number, number, number] = [Number(latraw[0]), Number(latraw[1]), Number(latraw[2])];
    const lonDms: [number, number, number] = [-1 * Number(lonraw[0]), Number(lonraw[1]), Number(lonraw[2])];
    return dmsToDD(latDms, lonDms);
}

function parseDecimalMinute(input: string): LatLon {
    const coords = input.replace('-', '');
    const latraw = coords.match(regexLatDM);
    const lonraw = coords.match(regexLonDM);
    if (!latraw || !lonraw) throw new Error('Could not parse decimal-minute coordinates');
    const latsplit = latraw[0].split(/\W|\s[^.]/);
    const lonsplit = lonraw[0].split(/\W|\s[^.]/);
    const latdd = Number(latsplit[0]);
    const londd = Number(lonsplit[0]);
    const latmm = Number(latsplit[1] + '.' + latsplit[2]);
    const lonmm = Number(lonsplit[1] + '.' + lonsplit[2]);
    const latSec = (latmm - Math.floor(latmm)) * 60;
    const lonSec = (lonmm - Math.floor(lonmm)) * 60;
    const latDms: [number, number, number] = [Math.floor(latdd), Math.floor(latmm), Number(latSec.toFixed(4))];
    const lonDms: [number, number, number] = [-1 * Math.floor(londd), Math.floor(lonmm), Number(lonSec.toFixed(4))];
    return dmsToDD(latDms, lonDms);
}

function parseMPS(coords: string): LatLon {
    // "(-DDD:MM:SS.ssss,DD:MM:SS.ssss)" — Hexagon Intergraph format
    const m = coords.match(/\(-(\d+):(\d+):(\d+\.\d+),(\d+):(\d+):(\d+\.\d+)\)/);
    if (!m) throw new Error('Could not parse MPS coordinates');
    const lonDms: [number, number, number] = [-1 * Number(m[1]), Number(m[2]), Number(m[3])];
    const latDms: [number, number, number] = [Number(m[4]), Number(m[5]), Number(m[6])];
    return dmsToDD(latDms, lonDms);
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
