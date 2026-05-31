import { defineAsyncComponent, markRaw } from 'vue';
import type { App } from 'vue';
import { IconDeviceMobilePin } from '@tabler/icons-vue';
import type { PluginAPI, PluginInstance } from '../../plugin.ts';

const PingForm = defineAsyncComponent(() => import('./components/PingForm.vue'));

const MENU_KEY = 'plugin-ping';
const ROUTE_NAME = 'home-menu-ping';

export default class PingPlugin implements PluginInstance {
    api: PluginAPI;

    constructor(api: PluginAPI) {
        this.api = api;
    }

    static async install(app: App, api: PluginAPI): Promise<PluginInstance> {
        api.routes.add({
            path: 'ping',
            name: ROUTE_NAME,
            component: PingForm,
        }, 'home-menu');

        return new PingPlugin(api);
    }

    async enable(): Promise<void> {
        // Menu entry provided by cloudtak-plugin-locator (Cellphone Data tab).
        // PingForm remains importable at plugins/ping/ for embedding.
    }

    async disable(): Promise<void> {
        this.api.menu.remove(MENU_KEY);
    }
}

type MenuItemIconType = NonNullable<Parameters<PluginAPI['menu']['add']>[0]['icon']>;
type MenuItemConfig = Parameters<PluginAPI['menu']['add']>[0];
