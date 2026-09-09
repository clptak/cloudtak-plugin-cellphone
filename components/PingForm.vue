<template>
    <div class='p-3'>
        <div class='d-flex flex-wrap gap-1 mb-3 mt-2'>
            <button
                v-for='tab in modeOptions'
                :key='tab.value'
                type='button'
                class='btn btn-sm btn-outline-warning'
                :class='{ active: mode === tab.value }'
                @click='mode = tab.value'
            >
                {{ tab.label }}
            </button>
        </div>

        <div class='row g-2'>
            <template v-if='mode !== "email"'>
                <div class='col-12'>
                    <TablerInput
                        v-model='form.name'
                        label='Carrier'
                        placeholder='e.g. VZW, ATT, TMOBILE'
                    />
                </div>

                <div class='col-12'>
                    <TablerInput
                        v-model='form.coordinates'
                        label='Coordinates (DD / DMS / DM / MPS)'
                        placeholder='34.12345 -118.56789'
                    />
                </div>

                <div :class='mode === "rtt" ? "col-6" : "col-12"'>
                    <TablerInput
                        v-model='form.distance'
                        type='number'
                        :label='mode === "rtt" ? "Distance" : "Range"'
                    />
                </div>
                <div
                    v-if='mode === "rtt"'
                    class='col-6'
                >
                    <TablerInput
                        v-model='form.azimuth'
                        type='number'
                        label='Azimuth (deg)'
                    />
                </div>

                <div class='col-12'>
                    <TablerToggle
                        v-model='distanceInPrimaryUnit'
                        :label='distanceUnitLabel'
                    />
                </div>

                <div class='col-12'>
                    <TablerInput
                        v-model='form.dateTime'
                        type='datetime-local'
                        label='Date / Time (local)'
                    />
                </div>
            </template>

            <template v-if='mode === "email"'>
                <div class='col-12'>
                    <TablerEnum
                        v-model='carrierLabel'
                        label='Carrier'
                        :options='carrierOptions'
                    />
                </div>

                <div class='col-12'>
                    <TablerEnum
                        v-model='timezoneLabel'
                        label='Market Time Zone'
                        description='Used only for the callsign timestamp. The DataSync dtg is always UTC.'
                        :options='timezoneOptions'
                    />
                </div>

                <div class='col-12'>
                    <TablerInput
                        v-model='form.emailText'
                        label='Pasted Email Text'
                        :rows='8'
                        placeholder='Paste the full carrier location-result email body here…'
                    />
                </div>
            </template>

            <div class='col-12'>
                <TablerToggle
                    v-model='form.addDataSyncLog'
                    :label='mode === "email" ? "Add to Active DataSync" : "Add DataSync Log"'
                    :description='missionGuid ? undefined : "(needs an active mission)"'
                    :disabled='!missionGuid'
                />
            </div>

            <div
                v-if='missionGuid'
                class='col-12 small text-muted'
            >
                Will post to active mission: <code>{{ missionGuid }}</code>
            </div>
            <div
                v-else
                class='col-12 small text-muted'
            >
                No active mission — features will be written to the local map.
            </div>

            <div
                v-if='error'
                class='col-12'
            >
                <TablerInlineAlert
                    severity='danger'
                    title='Submit failed'
                    :description='error'
                />
            </div>
            <div
                v-if='success'
                class='col-12'
            >
                <TablerInlineAlert
                    severity='success'
                    title='Posted'
                    :description='success'
                />
            </div>

            <div class='col-12'>
                <button
                    class='btn btn-primary w-100 mt-2'
                    :disabled='submitting'
                    @click='submit'
                >
                    {{ submitting ? 'Submitting…' : 'Submit' }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang='ts'>
import { ref, reactive, computed } from 'vue';
import {
    TablerInput,
    TablerEnum,
    TablerToggle,
    TablerInlineAlert,
} from '@tak-ps/vue-tabler';
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
import { fileFeaturesInCellphoneDataFolder } from '../lib/mission-folder.ts';
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
type PingMode = 'ping' | 'rtt' | 'email';

const mode = ref<PingMode>('ping');
const modeOptions: { value: PingMode; label: string }[] = [
    { value: 'ping', label: 'Cellphone Ping' },
    { value: 'rtt', label: 'RTT Timing Advance' },
    { value: 'email', label: 'Email Parse' },
];
const error = ref<string>('');
const success = ref<string>('');
const submitting = ref<boolean>(false);
const form = reactive<{
    name: string;
    coordinates: string;
    distance: number | undefined;
    azimuth: number | undefined;
    meters: boolean;
    dateTime: string;
    addDataSyncLog: boolean;
    carrier: Carrier;
    marketTimeZone: string;
    emailText: string;
}>({
    name: '',
    coordinates: '',
    distance: undefined,
    azimuth: undefined,
    meters: false,
    dateTime: nowDateTimeLocal(),
    addDataSyncLog: false,
    carrier: 'verizon',
    marketTimeZone: 'America/Phoenix',
    emailText: '',
});

const carrierOptions = CARRIERS.map((c) => c.label);
const timezoneOptions = US_TIMEZONES.map((tz) => tz.label);

const carrierLabel = computed({
    get: () => CARRIERS.find((c) => c.id === form.carrier)?.label ?? CARRIERS[0].label,
    set: (label: string) => {
        const found = CARRIERS.find((c) => c.label === label);
        if (found) form.carrier = found.id;
    },
});

const timezoneLabel = computed({
    get: () => US_TIMEZONES.find((tz) => tz.id === form.marketTimeZone)?.label ?? US_TIMEZONES[0].label,
    set: (label: string) => {
        const found = US_TIMEZONES.find((tz) => tz.label === label);
        if (found) form.marketTimeZone = found.id;
    },
});

const distanceUnitLabel = computed(() =>
    mode.value === 'rtt'
        ? 'Distance is in miles (else meters)'
        : 'Distance is in meters (else miles)',
);

// RTT copy treats miles as the on-state; form.meters stays true when the input is meters.
const distanceInPrimaryUnit = computed({
    get: () => (mode.value === 'rtt' ? !form.meters : form.meters),
    set: (on: boolean) => {
        form.meters = mode.value === 'rtt' ? !on : on;
    },
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
        if (form.distance === undefined || Number.isNaN(form.distance)) {
            error.value = mode.value === 'rtt' ? 'Distance is required.' : 'Range is required.';
            return;
        }
        if (mode.value === 'rtt' && (form.azimuth === undefined || Number.isNaN(form.azimuth))) {
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

        // Callsign + uid of the primary feature, captured BEFORE the loop:
        // normalize_geojson mutates the feature in place, so read the originals
        // up front for the DataSync log entry.
        const primaryCallsign = String(fc.features[0].properties?.callsign ?? form.name);
        let primaryUid = String(fc.features[0].id);
        const cotUids: string[] = [];

        // Add each feature via the map worker — authored:true puts it on the
        // live map and, if a mission is active, links it to that mission and
        // broadcasts it to TAK Server. No custom server routes needed.
        for (let i = 0; i < fc.features.length; i++) {
            const feat = fc.features[i];
            // Snapshot the original properties before normalize_geojson moves
            // them into properties.metadata.
            const origProps = (feat.properties ?? {}) as Record<string, unknown>;
            const featUid = String(feat.id ?? origProps.id ?? '');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const norm = await normalize_geojson(feat as any) as any;
            // node-cot (>=14) rebuilds properties as { metadata: <orig> }, which
            // drops the top-level properties.id the CoT store uses as its uid.
            // Without this the store mints a fresh uid, so the DataSync log
            // entry (entryUid below) points at a uid that isn't in the mission
            // and silently fails to attach. Restore it.
            if (featUid) norm.properties.id = featUid;
            // node-cot's from_geojson reads `type`, `how` and `icon` from the
            // TOP LEVEL to emit the CoT event type and the <usericon> detail,
            // but normalize_geojson relegated them to properties.metadata.
            // Restore them from the snapshot for point features (the RTT tower).
            if (feat.geometry?.type === 'Point') {
                for (const key of ['type', 'how', 'icon'] as const) {
                    if (typeof origProps[key] === 'string') {
                        norm.properties[key] = origProps[key];
                    }
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cot = await mapStore.worker.db.add(norm as any, { authored: true });
            const addedId = cot && typeof (cot as { id?: unknown }).id === 'string'
                ? (cot as { id: string }).id
                : featUid;
            if (addedId) cotUids.push(addedId);
            if (i === 0 && addedId) primaryUid = addedId;
        }

        const mission = mapStore.mission;
        const guid = missionGuid.value;

        if (mission && cotUids.length) {
            try {
                await fileFeaturesInCellphoneDataFolder(mission, cotUids);
            } catch (folderErr) {
                const msg = folderErr instanceof Error ? folderErr.message : String(folderErr);
                throw new Error(
                    `Features posted to mission, but filing into "Cellphone Data" failed: ${msg}`,
                    { cause: folderErr },
                );
            }
        }

        // Optional mission log entry — only when a mission is active.
        if (guid && form.addDataSyncLog) {
            await std(`/api/marti/missions/${encodeURIComponent(guid)}/log`, {
                method: 'POST',
                body: {
                    content: `${logLabel} ${primaryCallsign}`,
                    dtg: logDtg,
                    keywords: ['investigation', 'cellphone', logKeyword],
                    entryUid: primaryUid
                }
            });
        }

        const suffix = guid
            ? (form.addDataSyncLog
                ? ' to mission "Cellphone Data" (with log entry)'
                : ' to mission "Cellphone Data"')
            : ' to local map';
        success.value = `Posted ${fc.features.length} feature(s)${suffix}.`;
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        submitting.value = false;
    }
}
</script>
