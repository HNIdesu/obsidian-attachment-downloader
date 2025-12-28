import MeidaDownloaderPlugin from '../plugin/AttachmentDownloadPlugin';
import { App, PluginSettingTab, Setting } from 'obsidian';

export default class AttachmentDownloadSettingTab extends PluginSettingTab {
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
        new Setting(containerEl)
            .setName("Attachment Download Mode")
            .setDesc("Choose whether attachments are downloaded automatically or manually.")
            .addDropdown(comp => {
                comp.addOptions({
                        "auto": "Auto",
                        "mannual": "Mannual"
                    })
                    .setValue(this.plugin.settings.downloadMode)
                    .onChange(async (value) => {
                        this.plugin.settings.downloadMode = value;
                        await this.plugin.saveSettings();
                    })
            });
        new Setting(containerEl)
            .setName("Batch Size")
            .setDesc("Number of attachments processed in a single batch. UI will refresh after each batch completes.")
            .addText(comp =>
                comp.setPlaceholder('5')
                    .setValue(this.plugin.settings.batchSize.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.batchSize = parseInt(value);
                        await this.plugin.saveSettings();
                    })
            );
    }

}