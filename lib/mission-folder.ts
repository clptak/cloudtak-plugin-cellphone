/** Active-mission UID layer used for cellphone Ping / RTT / Email Parse CoTs. */
export const CELLPHONE_DATA_FOLDER = 'Cellphone Data';

export type MissionLayerLike = {
    uid: string;
    name?: string;
    type?: string;
    // Host MissionLayer uses unknown[]; keep loose so mapStore.mission assigns.
    mission_layers?: unknown[];
};

export type MissionLike = {
    layer: {
        list(opts?: { refresh?: boolean }): Promise<MissionLayerLike[]>;
        create(body: { name: string; type: 'UID' }): Promise<MissionLayerLike>;
        attachFeatures(layerUid: string, uids: string[]): Promise<void>;
    };
};

function findUidLayerByName(
    layers: MissionLayerLike[],
    name: string
): MissionLayerLike | undefined {
    for (const layer of layers) {
        if (layer.type === 'UID' && layer.name === name) return layer;
        const nested = layer.mission_layers as MissionLayerLike[] | undefined;
        if (nested?.length) {
            const found = findUidLayerByName(nested, name);
            if (found) return found;
        }
    }
    return undefined;
}

/**
 * Ensure a root-level UID mission layer named "Cellphone Data" exists, then
 * file the given CoT UIDs under it.
 */
export async function fileFeaturesInCellphoneDataFolder(
    mission: MissionLike,
    uids: string[]
): Promise<void> {
    if (!uids.length) return;

    const layers = await mission.layer.list({ refresh: true });
    let folder = findUidLayerByName(layers, CELLPHONE_DATA_FOLDER);

    if (!folder) {
        folder = await mission.layer.create({
            name: CELLPHONE_DATA_FOLDER,
            type: 'UID',
        });
    }

    if (!folder.uid) {
        throw new Error(`Failed to resolve "${CELLPHONE_DATA_FOLDER}" mission folder`);
    }

    await mission.layer.attachFeatures(folder.uid, uids);
}
