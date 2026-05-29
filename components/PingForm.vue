<template>
    <div class='p-3'>
        <div class='mb-2 d-flex'>
            <button
                class='btn btn-sm'
                :class='{ "btn-primary": mode === "ping", "btn-outline-secondary": mode !== "ping" }'
                @click='mode = "ping"'
            >
                Cellphone Ping
            </button>
            <button
                class='btn btn-sm ms-2'
                :class='{ "btn-primary": mode === "rtt", "btn-outline-secondary": mode !== "rtt" }'
                @click='mode = "rtt"'
            >
                RTT Timing Advance
            </button>
            <button
                class='btn btn-sm ms-2'
                :class='{ "btn-primary": mode === "email", "btn-outline-secondary": mode !== "email" }'
                @click='mode = "email"'
            >
                Email Parse
            </button>
        </div>

        <template v-if='mode !== "email"'>
            <div class='mb-2'>
                <label class='form-label'>CARRIER</label>
                <input
                    v-model='form.name'
                    class='form-control'
                    placeholder='e.g. VZW, ATT, TMOBILE'
                >
            </div>

            <div class='mb-2'>
                <label class='form-label'>Coordinates (DD / DMS / DM / MPS)</label>
                <input
                    v-model='form.coordinates'
                    class='form-control'
                    placeholder='34.12345 -118.56789'
                >
            </div>

            <div class='mb-2 row'>
                <div class='col'>
                    <label class='form-label'>{{ mode === 'rtt' ? 'Distance' : 'Range' }}</label>
                    <input
                        v-model.number='form.distance'
                        type='number'
                        step='any'
                        class='form-control'
                    >
                </div>
                <div
                    v-if='mode === "rtt"'
                    class='col'
                >
                    <label class='form-label'>Azimuth (deg)</label>
                    <input
                        v-model.number='form.azimuth'
                        type='number'
                        step='any'
                        class='form-control'
                    >
                </div>
            </div>

            <div class='mb-2 form-check'>
                <input
                    v-model='form.meters'
                    type='checkbox'
                    class='form-check-input'
                >
                <label class='form-check-label'>Distance is in meters (else miles)</label>
            </div>

            <div class='mb-2'>
                <label class='form-label'>Date / Time (local)</label>
                <input
                    v-model='form.dateTime'
                    type='datetime-local'
                    class='form-control'
                >
            </div>
        </template>

        <template v-if='mode === "email"'>
            <div class='mb-2'>
                <label class='form-label'>Carrier</label>
                <select
                    v-model='form.carrier'
                    class='form-select'
                >
                    <option
                        v-for='c in CARRIERS'
                        :key='c.id'
                        :value='c.id'
                    >
                        {{ c.label }}
                    </option>
                </select>
            </div>

            <div class='mb-2'>
                <label class='form-label'>Market Time Zone</label>
                <select
                    v-model='form.marketTimeZone'
                    class='form-select'
                >
                    <option
                        v-for='tz in US_TIMEZONES'
                        :key='tz.id'
                        :value='tz.id'
                    >
                        {{ tz.label }}
                    </option>
                </select>
                <div class='small text-muted'>
                    Used only for the callsign timestamp. The DataSync <code>dtg</code> is always UTC.
                </div>
            </div>

            <div class='mb-2'>
                <label class='form-label'>Pasted Email Text</label>
                <textarea
                    v-model='form.emailText'
                    class='form-control'
                    rows='8'
                    placeholder='Paste the full carrier location-result email body here…'
                />
            </div>
        </template>

        <div class='mb-2 form-check form-switch'>
            <input
                v-model='form.addDataSyncLog'
                type='checkbox'
                class='form-check-input'
                role='switch'
                :disabled='!missionGuid'
            >
            <label class='form-check-label'>
                {{ mode === 'email' ? 'Add to Active DataSync' : 'Add DataSync Log' }}
                <span
                    v-if='!missionGuid'
                    class='text-muted'
                >(needs an active mission)</span>
            </label>
        </div>

        <div
            v-if='missionGuid'
            class='mb-2 small text-muted'
        >
            Will post to active mission: <code>{{ missionGuid }}</code>
        </div>
        <div
            v-else
            class='mb-2 small text-muted'
        >
            No active mission — features will be written to the local map.
        </div>

        <div
            v-if='error'
            class='alert alert-danger'
        >
            {{ error }}
        </div>
        <div
            v-if='success'
            class='alert alert-success'
        >
            {{ success }}
        </div>

        <button
            class='btn btn-primary w-100'
            :disabled='submitting'
            @click='submit'
        >
            {{ submitting ? 'Submitting…' : 'Submit' }}
        </button>
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
import {
    parseCarrierEmail,
    formatMarketStamp,
    carrierColor,
    CARRIERS,
    US_TIMEZONES,
    type Carrier,
} from '../lib/email-parse.ts';
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
const mode = ref<'ping' | 'rtt' | 'email'>('ping');
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
    carrier: Carrier;
    marketTimeZone: string;
    emailText: string;
}>({
    name: '',
    coordinates: '',
    distance: null,
    azimuth: null,
    meters: false,
    dateTime: nowDateTimeLocal(),
    addDataSyncLog: false,
    carrier: 'verizon',
    marketTimeZone: 'America/Phoenix',
    emailText: '',
});

const missionGuid = computed<string | undefined>(() => mapStore.mission?.meta.guid);

async function submit() {
    error.value = '';
    success.value = '';

    if (mode.value === 'email') {
        if (!form.emailText.trim()) { error.value = 'Pasted email text is required.'; return; }
    } else {
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
    }

    submitting.value = true;
    try {
        let fc: FeatureCollection;
        // dtg used for the optional DataSync log entry. For ping/rtt this is the
        // manually entered local time; for email it is the parsed transaction
        // instant (already UTC).
        let logDtg: string;
        let logLabel: string;
        let logKeyword: string;

        if (mode.value === 'email') {
            const parsed = parseCarrierEmail(form.carrier, form.emailText);
            // Reuse the existing cell-ping plotting. Uncertainty radius is in
            // meters, so meters:true keeps it as-is.
            const prepared = prepareCellPing({
                name: parsed.callsignPrefix,
                lat: parsed.lat,
                lon: parsed.lon,
                distance: parsed.uncertaintyMeters,
                meters: true,
                color: carrierColor(parsed.callsignPrefix),
            });
            // Callsign is the carrier prefix plus the transaction time rendered
            // in the selected US market time zone. The feature time tracks the
            // true transaction instant (UTC).
            prepared.callsign = `${parsed.callsignPrefix} - ${formatMarketStamp(parsed.transactionUtcISO, form.marketTimeZone)}`;
            prepared.takLogDateTime = parsed.transactionUtcISO;
            fc = cellPingFeatures(prepared);
            logDtg = parsed.transactionUtcISO;
            logLabel = 'Ping';
            logKeyword = 'ping';
        } else {
            const { lat, lon } = parseCoordinates({ coordinates: form.coordinates });
            if (mode.value === 'ping') {
                const prepared = prepareCellPing({
                    name: form.name,
                    lat, lon,
                    distance: form.distance!,
                    meters: form.meters,
                    pingdateTimeInput: form.dateTime,
                    color: carrierColor(form.name)
                });
                fc = cellPingFeatures(prepared);
            } else {
                const prepared = prepareRtt({
                    name: form.name,
                    lat, lon,
                    distance: form.distance!,
                    azimuth: form.azimuth!,
                    meters: form.meters,
                    rttdateTimeInput: form.dateTime,
                    color: carrierColor(form.name)
                });
                fc = rttFeatures(prepared);
            }
            logDtg = localDateTimeToUtcISO(form.dateTime);
            logLabel = mode.value === 'rtt' ? 'RTT/TA' : 'Ping';
            logKeyword = mode.value === 'rtt' ? 'rtt-ta' : 'ping';
        }

        // Add each feature via the map worker — authored:true puts it on the
        // live map and, if a mission is active, links it to that mission and
        // broadcasts it to TAK Server. No custom server routes needed.
        for (const feat of fc.features) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const norm = await normalize_geojson(feat as any);
            // normalize_geojson rewrites `type` from the geometry (Point ->
            // u-d-p) and pushes non-whitelisted keys (icon, how) into
            // properties.metadata. node-cot's from_geojson reads `type`, `how`
            // and `icon` from the TOP LEVEL to emit the CoT event type and the
            // <usericon> detail, so restore them for point features (the RTT
            // tower). The circle/arc keep normalize_geojson's output unchanged.
            if (feat.geometry?.type === 'Point') {
                const op = (feat.properties ?? {}) as Record<string, unknown>;
                for (const key of ['type', 'how', 'icon'] as const) {
                    if (typeof op[key] === 'string') {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (norm as any).properties[key] = op[key];
                    }
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await mapStore.worker.db.add(norm as any, { authored: true });
        }

        const guid = missionGuid.value;

        // Optional mission log entry — only when a mission is active.
        if (guid && form.addDataSyncLog) {
            const callsign = String(fc.features[0].properties?.callsign ?? form.name);
            await std(`/api/marti/missions/${encodeURIComponent(guid)}/log`, {
                method: 'POST',
                body: {
                    content: `${logLabel} ${callsign}`,
                    dtg: logDtg,
                    keywords: ['investigation', 'cellphone', logKeyword],
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
