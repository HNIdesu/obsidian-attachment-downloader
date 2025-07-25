import MeidaDownloaderPlugin from './main';
import { App, PluginSettingTab, Setting } from 'obsidian';

export class MySettingTab extends PluginSettingTab {
    plugin: MeidaDownloaderPlugin;

    constructor(app: App, plugin: MeidaDownloaderPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Host Name')
            .setDesc("Specify the server host for downloading media.")
            .addText(comp =>
                comp.setPlaceholder('127.0.0.1')
                    .setValue(this.plugin.settings.hostName)
                    .onChange(async (value) => {
                        this.plugin.settings.hostName = value;
                        await this.plugin.saveSettings();
                    })
            );
        new Setting(containerEl)
            .setName("Port Number")
            .setDesc("Define the port your media server is listening to. Ensure it matches the server configuration.")
            .addText(comp =>
                comp.setPlaceholder('3322')
                    .setValue(this.plugin.settings.port.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.port = parseInt(value);
                        await this.plugin.saveSettings();
                    })
            );
    }

}