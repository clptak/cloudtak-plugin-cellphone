<template>
    <div class='p-3'>
        <div class='mb-2 d-flex'>
            <button
                class='btn btn-sm'
                :class='{ "btn-primary": mode === "ping", "btn-outline-secondary": mode !== "ping" }'
                @click='mode = "ping"'
            >Cellphone Ping</button>
            <button
                class='btn btn-sm ms-2'
                :class='{ "btn-primary": mode === "rtt", "btn-outline-secondary": mode !== "rtt" }'
                @click='mode = "rtt"'
            >RTT Timing Advance</button>
        </div>

        <div class='mb-2'>
            <label class='form-label'>CARRIER</label>
            <input v-model='form.name' class='form-control'>
        </div>

        <div class='mb-2'>
            <label class='form-label'>Coordinates (DD / DMS / DM / MPS)</label>
            <input v-model='form.coordinates' class='form-control' placeholder='34.12345 -118.56789'>
        </div>

        <div class='mb-2 row'>
            <div class='col'>
                <label class='form-label'>{{ mode === 'rtt' ? 'Distance' : 'Range' }}</label>
                <input v-model.number='form.distance' type='number' step='any' class='form-control'>
            </div>
            <div v-if='mode === "rtt"' class='col'>
                <label class='form-label'>Azimuth (deg)</label>
                <input v-model.number='form.azimuth' type='number' step='any' class='form-control'>
            </div>
        </div>

        <div class='mb-2 form-check'>
            <input v-model='form.meters' type='checkbox' class='form-check-input'>
            <label class='form-check-label'>Distance is in meters (else miles)</label>
        </div>

        <div class='mb-2'>
            <label class='form-label'>Date / Time (local)</label>
            <input v-model='form.dateTime' type='datetime-local' class='form-control'>
        </div>

        <div class='mb-2 form-check form-switch'>
            <input
                v-model='form.addDataSyncLog'
                type='checkbox'
                class='form-check-input'
                role='switch'
                :disabled='!missionGuid'
            >
            <label class='form-check-label'>
                Add DataSync Log
                <span v-if='!missionGuid' class='text-muted'>(needs an active mission)</span>
            </label>
        </div>

        <div v-if='missionGuid' class='mb-2 small text-muted'>
            Will post to active mission: <code>{{ missionGuid }}</code>
        </div>
        <div v-else class='mb-2 small text-muted'>
            No active mission — features will be written to the local map.
        </div>

        <div v-if='error' class='alert alert-danger'>{{ error }}</div>
        <div v-if='success' class='alert alert-success'>{{ success }}</div>

        <button
            class='btn btn-primary w-100'
            :disabled='submitting'
            @click='submit'
        >{{ submitting ? 'Submitting…' : 'Submit' }}</button>
    </div>
</template>

<script setup lang='ts'>
import { ref, reactive, computed } from 'vue';
import { useMapStore } from '../../../src/stores/map.ts';
import { std } from '../../../src/std.ts';
import { normalize_geojson } from '@tak-ps/node-cot/normalize_geojson';
import { parseCoordinates } from '../lib/coordinates.ts';
import { prepareCellPing, cellPingFeatures } from '../lib/cell-ping.ts';
import { prepareRtt, rttFeatures } from '../lib/rtt.ts';
import type { FeatureCollection } from 'geojson';

function nowDateTimeLocal(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDateTimeToUtcISO(local: string): string {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) {
        return new Date(local).toISOString();
    }
    return new Date().toISOString();
}

const mapStore = useMapStore();
const mode = ref<'ping' | 'rtt'>('ping');
const error = ref<string>('');
const success = ref<string>('');
const submitting = ref<boolean>(false);
const form = reactive<{
    name: string;
    coordinates: string;
    distance: number | null;
    azimuth: number | null;
    meters: boolean;
    dateTime: string;
    addDataSyncLog: boolean;
}>({
    name: '',
    coordinates: '',
    distance: null,
    azimuth: null,
    meters: false,
    dateTime: nowDateTimeLocal(),
    addDataSyncLog: false,
});

const missionGuid = computed<string | undefined>(() => mapStore.mission?.meta.guid);

async function submit() {
    error.value = '';
    success.value = '';

    if (!form.name) { error.value = 'Name / Callsign is required.'; return; }
    if (!form.coordinates) { error.value = 'Coordinates is required.'; return; }
    if (form.distance === null || Number.isNaN(form.distance)) {
        error.value = mode.value === 'rtt' ? 'Distance is required.' : 'Range is required.';
        return;
    }
    if (mode.value === 'rtt' && (form.azimuth === null || Number.isNaN(form.azimuth))) {
        error.value = 'Azimuth is required for RTT.';
        return;
    }

    submitting.value = true;
    try {
        const { lat, lon } = parseCoordinates({ coordinates: form.coordinates });

        let fc: FeatureCollection;
        if (mode.value === 'ping') {
            const prepared = prepareCellPing({
                name: form.name,
                lat, lon,
                distance: form.distance,
                meters: form.meters,
                pingdateTimeInput: form.dateTime
            });
            fc = cellPingFeatures(prepared);
        } else {
            const prepared = prepareRtt({
                name: form.name,
                lat, lon,
                distance: form.distance!,
                azimuth: form.azimuth!,
                meters: form.meters,
                rttdateTimeInput: form.dateTime
            });
            fc = rttFeatures(prepared);
        }

        // Add each feature via the map worker — authored:true puts it on the
        // live map and, if a mission is active, links it to that mission and
        // broadcasts it to TAK Server. No custom server routes needed.
        for (const feat of fc.features) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const norm = await normalize_geojson(feat as any);
            await mapStore.worker.db.add(norm, { authored: true });
        }

        const guid = missionGuid.value;

        // Optional mission log entry — only when a mission is active.
        if (guid && form.addDataSyncLog) {
            const label = mode.value === 'rtt' ? 'RTT/TA' : 'Ping';
            const keyword = mode.value === 'rtt' ? 'rtt-ta' : 'ping';
            const callsign = String(fc.features[0].properties?.callsign ?? form.name);
            await std(`/api/marti/missions/${encodeURIComponent(guid)}/log`, {
                method: 'POST',
                body: {
                    content: `${label} ${callsign}`,
                    dtg: localDateTimeToUtcISO(form.dateTime),
                    keywords: ['investigation', 'cellphone', keyword],
                    entryUid: String(fc.features[0].id)
                }
            });
        }

        const suffix = guid
            ? (form.addDataSyncLog ? ' to mission (with log entry)' : ' to mission')
            : ' to local map';
        success.value = `Posted ${fc.features.length} feature(s)${suffix}.`;
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        submitting.value = false;
    }
}
</script>
