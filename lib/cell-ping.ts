// Port of the cellPing2cot node-red subflow. Emits a single u-d-c-c Polygon
// feature with shape.ellipse so node-cot's from_geojson injects the required
// detail (see ELLIPSE_TYPES in node-cot/lib/parser/from_geojson.ts).

import type { Feature, FeatureCollection } from 'geojson';
import { destination as gcDestination } from './geo.ts';

export type CellPingInput = {
    name: string;
    lat: number;
    lon: number;
    distance: number;
    azimuth?: number;
    meters?: boolean;
    creatorUid?: string;
    eventID?: string;
    pingdateTimeInput?: string;
};

export type CellPingPrepared = {
    name: string;
    lat: number;
    lon: number;
    distance: number; // always in meters
    azimuth: number;
    uncertainty: number;
    creatorUid: string;
    eventID?: string;
    date: string;
    time: string;
    takLogDateTime: string | null;
    callsign: string;
};

function isoLocalToParts(input: string): { date: string; time: string; takLogDateTime: string | null } {
    const dateTime = input + ':00.0';
    const iso8601LocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
    if (iso8601LocalRegex.test(dateTime)) {
        const date = dateTime.split('T')[0];
        const tparts = dateTime.split('T')[1].split(':');
        const time = `${tparts[0]}:${tparts[1]}`;
        return { date, time, takLogDateTime: new Date(dateTime).toISOString() };
    }
    const now = new Date().toISOString();
    return {
        date: now.split('T')[0],
        time: now.split('T')[1].slice(0, 5),
        takLogDateTime: null
    };
}

export function prepareCellPing(input: CellPingInput): CellPingPrepared {
    const azimuth = input.azimuth !== undefined ? Number(input.azimuth) : 0;
    const uncertainty = Number(input.distance);
    const creatorUid = input.creatorUid || 'cloudtak';
    const meters = input.meters === true;
    const distance = meters ? input.distance : input.distance * 1609.34;

    let parts: { date: string; time: string; takLogDateTime: string | null };
    if (input.pingdateTimeInput) {
        parts = isoLocalToParts(input.pingdateTimeInput);
    } else {
        const now = new Date().toISOString();
        parts = {
            date: now.split('T')[0],
            time: now.split('T')[1].slice(0, 5),
            takLogDateTime: null
        };
    }

    return {
        name: input.name,
        lat: Number(input.lat),
        lon: Number(input.lon),
        distance,
        azimuth,
        uncertainty,
        creatorUid,
        eventID: input.eventID,
        date: parts.date,
        time: parts.time,
        takLogDateTime: parts.takLogDateTime,
        callsign: `${input.name} - ${parts.time} on ${parts.date}`
    };
}

function circleRing(lat: number, lon: number, radiusMeters: number, steps = 64): number[][] {
    const ring: number[][] = [];
    for (let i = 0; i <= steps; i++) {
        const bearing = (i * 360) / steps;
        const p = gcDestination(lat, lon, radiusMeters, bearing);
        ring.push([p.lon, p.lat]);
    }
    return ring;
}

export function cellPingFeatures(prepared: CellPingPrepared): FeatureCollection {
    const now = new Date();
    const stale = new Date(now.getTime() + 1440000000).toISOString();
    const uid = crypto.randomUUID();

    const ring = circleRing(prepared.lat, prepared.lon, prepared.distance);
    const circle: Feature = {
        type: 'Feature',
        id: uid,
        properties: {
            id: uid,
            type: 'u-d-c-c',
            how: 'h-e',
            callsign: prepared.callsign,
            time: prepared.takLogDateTime || now.toISOString(),
            start: now.toISOString(),
            stale,
            archived: true,
            remarks: 'Location and Uncertainty',
            'stroke': '#FF0000',
            'stroke-width': 2,
            'stroke-opacity': 1,
            'fill': '#FF0000',
            'fill-opacity': 0.1,
            shape: {
                ellipse: {
                    major: prepared.distance,
                    minor: prepared.distance,
                    angle: 0
                }
            }
        },
        geometry: { type: 'Polygon', coordinates: [ring] }
    };

    return { type: 'FeatureCollection', features: [circle] };
}
