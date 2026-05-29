// Port of the rtt2cot node-red subflow.
// Emits an arc (u-rb-a LineString) + tower point (a-f-G).

import type { Feature, FeatureCollection } from 'geojson';
import { destination as gcDestination } from './geo.ts';

export type RttInput = {
    name: string;
    lat: number;
    lon: number;
    azimuth: number;
    distance: number;
    meters?: boolean;
    creatorUid?: string;
    rttdateTimeInput?: string;
    color?: string;
};

export type RttPrepared = {
    name: string;
    lat: number;
    lon: number;
    azimuth: number;
    distance: number; // meters
    creatorUid: string;
    date: string;
    time: string;
    dtg: string | null;
    color: string;
};

function formatPhoenix(d: Date): { date: string; time: string } {
    return {
        date: d.toLocaleDateString('en-US', {
            timeZone: 'America/Phoenix',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }),
        time: d.toLocaleTimeString('en-US', {
            timeZone: 'America/Phoenix',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        })
    };
}

export function prepareRtt(input: RttInput): RttPrepared {
    const azimuth = Number(input.azimuth);
    const distanceRaw = Number(input.distance);
    const creatorUid = input.creatorUid || 'cloudtak';
    const meters = input.meters === true;
    const distance = meters ? distanceRaw : distanceRaw * 1609.34;

    let date = '';
    let time = '';
    let dtg: string | null = null;
    if (input.rttdateTimeInput) {
        const dateObj = new Date(input.rttdateTimeInput);
        if (!isNaN(dateObj.getTime())) {
            const parts = formatPhoenix(dateObj);
            date = parts.date;
            time = parts.time;
            dtg = `${input.rttdateTimeInput}:00.0Z`;
        }
    }
    if (!date) {
        const parts = formatPhoenix(new Date());
        date = parts.date;
        time = parts.time;
    }

    return { name: input.name, lat: Number(input.lat), lon: Number(input.lon), azimuth, distance, creatorUid, date, time, dtg, color: input.color || '#FF0000' };
}

function calculateArc(lat: number, lon: number, startAz: number, endAz: number, distance: number, steps: number): number[][] {
    const out: number[][] = [];
    for (let i = 0; i <= steps; i++) {
        const angle = startAz + (i * (endAz - startAz)) / steps;
        const p = gcDestination(lat, lon, distance, angle);
        out.push([p.lon, p.lat]);
    }
    return out;
}

export function rttFeatures(prepared: RttPrepared): FeatureCollection {
    const steps = 20;
    const startAz = prepared.azimuth - 70;
    const endAz = prepared.azimuth + 70;
    const arc = calculateArc(prepared.lat, prepared.lon, startAz, endAz, prepared.distance, steps);

    const arcName = `ARC ${prepared.name} - ${prepared.time} on ${prepared.date}`;
    const arcDesc = `Distance:  ${prepared.distance}\nAzimuth:  ${prepared.azimuth}\n\nFor Cellphone transaction for tower and sector on ${prepared.date} at ${prepared.time}`;
    const pointName = `${prepared.name} - ${prepared.time} on ${prepared.date}`;
    const pointDesc = `Tower location for cellphone transaction for tower and sector on ${prepared.date} at ${prepared.time}`;

    const now = new Date();
    const tenMinutesLater = new Date(now.getTime() + 10 * 60 * 1000);
    const arcUid = crypto.randomUUID();
    const pointUid = crypto.randomUUID();

    const mid = arc[Math.floor(arc.length / 2)];

    const arcFeature: Feature = {
        type: 'Feature',
        id: arcUid,
        properties: {
            id: arcUid,
            name: arcName,
            description: arcDesc,
            type: 'u-rb-a',
            icon: 'u-rb-a',
            how: 'h-e',
            callsign: arcName,
            time: prepared.dtg || now.toISOString(),
            start: now.toISOString(),
            stale: tenMinutesLater.toISOString(),
            archived: true,
            range: prepared.distance,
            bearing: prepared.azimuth,
            center: [mid[0], mid[1], 9999999],
            stroke: prepared.color,
            'stroke-width': 2,
            'stroke-opacity': 1,
            labels: false
        },
        geometry: { type: 'LineString', coordinates: arc }
    };

    const pointFeature: Feature = {
        type: 'Feature',
        id: pointUid,
        properties: {
            id: pointUid,
            name: pointName,
            description: pointDesc,
            type: 'a-n-G',
            how: 'h-g-i-g-o',
            icon: '83198b4872a8c34eb9c549da8a4de5a28f07821185b39a2277948f66c24ac17a:WildFire/Repeater',
            callsign: pointName,
            time: prepared.dtg || now.toISOString(),
            start: now.toISOString(),
            stale: tenMinutesLater.toISOString(),
            archived: true,
            center: [prepared.lon, prepared.lat, 9999999],
            'marker-opacity': 1,
            'marker-color': '#FFFFFF',
            remarks: 'None'
        },
        geometry: { type: 'Point', coordinates: [prepared.lon, prepared.lat, 9999999] }
    };

    return { type: 'FeatureCollection', features: [arcFeature, pointFeature] };
}
