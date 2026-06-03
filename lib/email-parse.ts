// Extracts cell-location fields from carrier "location result" email bodies
// (Verizon, AT&T, T-Mobile) so the existing cell-ping plotting code can draw
// the uncertainty circle and optionally post a DataSync log entry.
//
// Each carrier states its own source time zone in the body:
//   - Verizon  — "Timestamp = ..." is UTC.
//   - AT&T     — "located on ... GMT" is UTC.
//   - T-Mobile — "... Pacific Standard/Daylight Time" is US Pacific.
// We resolve that to an absolute instant (UTC ISO-8601). The user-selected
// "market" time zone is only used for the human-readable callsign stamp; it
// does not change the underlying instant or the DataSync `dtg`.

export type Carrier = 'verizon' | 'att' | 'tmobile';

export type ParsedPing = {
    carrier: Carrier;
    callsignPrefix: string;
    lat: number;
    lon: number;
    uncertaintyMeters: number;
    transactionUtcISO: string;
};

export const CARRIERS: { id: Carrier; label: string; prefix: string }[] = [
    { id: 'verizon', label: 'Verizon', prefix: 'VZW' },
    { id: 'att', label: 'AT&T', prefix: 'ATT' },
    { id: 'tmobile', label: 'T-Mobile', prefix: 'TMOBILE' },
];

// US time zones offered for the "market time" callsign stamp. IANA names are
// used so Intl applies the correct DST rules for the transaction date.
export const US_TIMEZONES: { id: string; label: string }[] = [
    { id: 'America/New_York', label: 'Eastern' },
    { id: 'America/Chicago', label: 'Central' },
    { id: 'America/Denver', label: 'Mountain' },
    { id: 'America/Phoenix', label: 'Arizona' },
    { id: 'America/Los_Angeles', label: 'Pacific' },
    { id: 'America/Anchorage', label: 'Alaska' },
    { id: 'Pacific/Honolulu', label: 'Hawaii' },
    { id: 'UTC', label: 'UTC/GMT' },
];

function carrierPrefix(carrier: Carrier): string {
    const found = CARRIERS.find((c) => c.id === carrier);
    return found ? found.prefix : carrier.toUpperCase();
}

// Brand color for a carrier, matched by the presence of its prefix in the
// given text (case-insensitive). Anything unrecognized falls back to red.
export function carrierColor(text: string): string {
    const t = (text || '').toUpperCase();
    if (t.includes('TMOBILE')) return '#E20074';
    if (t.includes('ATT')) return '#067AB4';
    if (t.includes('VZW')) return '#FF0000';
    return '#FF0000';
}

// Build a UTC ISO string from wall-clock components plus the source-zone
// offset (east-positive minutes). UTC instant = wall-as-UTC − offset.
function toUtcISO(
    year: number,
    month: number,
    day: number,
    hour24: number,
    minute: number,
    second: number,
    offsetMinutes: number
): string {
    const ms = Date.UTC(year, month - 1, day, hour24, minute, second) - offsetMinutes * 60000;
    return new Date(ms).toISOString();
}

function to24Hour(hour12: number, meridiem: string): number {
    const m = meridiem.toUpperCase();
    if (m === 'AM') return hour12 === 12 ? 0 : hour12;
    return hour12 === 12 ? 12 : hour12 + 12;
}

// "MM/DD/YYYY h:mm:ss AM/PM" → 24-hour components.
const dateTime12Re = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)/i;
// "MM/DD/YYYY HH:MM:SS" (24-hour).
const dateTime24Re = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/;

function parseVerizon(text: string): ParsedPing {
    const lat = text.match(/Latitude\s*=\s*(-?\d+(?:\.\d+)?)/i);
    const lon = text.match(/Longitude\s*=\s*(-?\d+(?:\.\d+)?)/i);
    const radius = text.match(/Radius\s*\(meters\)\s*=\s*(\d+(?:\.\d+)?)/i);
    const ts = text.match(new RegExp('Timestamp\\s*=\\s*' + dateTime12Re.source, 'i'));

    if (!lat) throw new Error('Verizon: could not find "Latitude = ".');
    if (!lon) throw new Error('Verizon: could not find "Longitude = ".');
    if (!radius) throw new Error('Verizon: could not find "Radius (meters) = ".');
    if (!ts) throw new Error('Verizon: could not find "Timestamp = MM/DD/YYYY h:mm:ss AM/PM".');

    const transactionUtcISO = toUtcISO(
        Number(ts[3]), Number(ts[1]), Number(ts[2]),
        to24Hour(Number(ts[4]), ts[7]), Number(ts[5]), Number(ts[6]),
        0
    );

    return {
        carrier: 'verizon',
        callsignPrefix: carrierPrefix('verizon'),
        lat: Number(lat[1]),
        lon: Number(lon[1]),
        uncertaintyMeters: Number(radius[1]),
        transactionUtcISO,
    };
}

function parseAtt(text: string): ParsedPing {
    // \s* (not \s+) so both "Latitude 61.3" and "Latitude61.3" are matched.
    const lat = text.match(/Latitude\s*(-?\d+(?:\.\d+)?)/i);
    const lon = text.match(/Longitude\s*(-?\d+(?:\.\d+)?)/i);
    // "Location accuracy likely better than" is optional: newer cMLC4/cMLC5
    // bodies use "Radius223 meter" with no intervening phrase.
    const radius = text.match(/Radius\s*(?:Location accuracy likely better than\s+)?(\d+(?:\.\d+)?)/i);
    // "located on ... GMT" is absent in the cMLC4/cMLC5 format; fall back to
    // the current UTC instant so downstream callsign stamping still works.
    const ts = text.match(new RegExp('located on\\s+' + dateTime24Re.source + '\\s*GMT', 'i'));

    if (!lat) throw new Error('AT&T: could not find "Latitude <value>".');
    if (!lon) throw new Error('AT&T: could not find "Longitude <value>".');
    if (!radius) throw new Error('AT&T: could not find radius value.');

    const transactionUtcISO = ts
        ? toUtcISO(
              Number(ts[3]), Number(ts[1]), Number(ts[2]),
              Number(ts[4]), Number(ts[5]), Number(ts[6]),
              0
          )
        : new Date().toISOString();

    return {
        carrier: 'att',
        callsignPrefix: carrierPrefix('att'),
        lat: Number(lat[1]),
        lon: Number(lon[1]),
        uncertaintyMeters: Number(radius[1]),
        transactionUtcISO,
    };
}

function parseTmobile(text: string): ParsedPing {
    const latlon = text.match(/Lat,\s*Long:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
    const uncertainty = text.match(/Uncertainty:\s*(\d+(?:\.\d+)?)\s*m/i);
    const ts = text.match(new RegExp('at\\s+' + dateTime12Re.source + '\\s+Pacific(?:\\s+(Standard|Daylight))?', 'i'));

    if (!latlon) throw new Error('T-Mobile: could not find "Lat, Long: <lat>,<lon>".');
    if (!uncertainty) throw new Error('T-Mobile: could not find "Uncertainty: <value>m".');
    if (!ts) throw new Error('T-Mobile: could not find "at MM/DD/YYYY h:mm:ss AM/PM Pacific ... Time".');

    // Pacific Standard = UTC-8, Pacific Daylight = UTC-7. Default to Standard
    // when the body only says "Pacific".
    const isDaylight = (ts[8] || '').toLowerCase() === 'daylight';
    const offsetMinutes = isDaylight ? -420 : -480;

    const transactionUtcISO = toUtcISO(
        Number(ts[3]), Number(ts[1]), Number(ts[2]),
        to24Hour(Number(ts[4]), ts[7]), Number(ts[5]), Number(ts[6]),
        offsetMinutes
    );

    return {
        carrier: 'tmobile',
        callsignPrefix: carrierPrefix('tmobile'),
        lat: Number(latlon[1]),
        lon: Number(latlon[2]),
        uncertaintyMeters: Number(uncertainty[1]),
        transactionUtcISO,
    };
}

export function parseCarrierEmail(carrier: Carrier, text: string): ParsedPing {
    switch (carrier) {
        case 'verizon': return parseVerizon(text);
        case 'att': return parseAtt(text);
        case 'tmobile': return parseTmobile(text);
    }
}

// Render an absolute UTC instant in the selected US market time zone as
// "MM/DD/YYYY at HH:MM" (24-hour) for use in the feature callsign.
export function formatMarketStamp(iso: string, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('month')}/${get('day')}/${get('year')} at ${get('hour')}:${get('minute')}`;
}
