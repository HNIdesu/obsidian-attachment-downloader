import { MarkdownView, Plugin, TFile } from 'obsidian';
import { MySettingTab } from './settings'
interface MyPluginSettings {
    hostName: string
    port: number
    batchSize: number
    downloadMode: string
}

const DEFAULT_SETTINGS: Partial<MyPluginSettings> = {
    hostName: "127.0.0.1",
    port: 3322,
    batchSize: 5,
    downloadMode: "auto"
}

export default class MeidaDownloaderPlugin extends Plugin {
    private _onFileOpen: ((file: TFile | null) => any) | null = null;
    private abortController: AbortController | null = null
    settings: MyPluginSettings;

    private async downloadAllAttachments(plugin: MeidaDownloaderPlugin, file: TFile) {
        plugin.abortController?.abort()
        const controller = new AbortController()
        plugin.abortController = controller
        const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView)
        const notePath = file.path
        const content = await plugin.app.vault.cachedRead(file)
        const regExp = new RegExp("!\\[([^\\]]*)\\]\\(([^\\)]*)\\)", "g")
        const urlCollection = []
        for (const match of content.matchAll(regExp)) {
            let url = match[2]
            if (url.trim() == "" || url.contains("\\")) continue
            url = url.trim().replace("%20", " ")
            if (!url.startsWith("attachments/"))
                url = "attachments/" + url
            urlCollection.push(url)
        }
        const batchSize = plugin.settings.batchSize
        let start = 0
        while (true) {
            const urls = urlCollection.slice(start, start + batchSize)
            if (urls.length == 0) break
            try {
                const res = await fetch(`http://${plugin.settings.hostName}:${plugin.settings.port}/pull-lfs`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        note: notePath,
                        resources: urls
                    }),
                    signal: controller.signal
                })
                if (res.status == 200) {
                    const results = await res.json() as Array<number>
                    if (results.contains(0))
                        markdownView?.previewMode?.rerender(true)
                }

            } catch (ex) {
                if (ex.name == "AbortError") {
                    break
                }
            }
            start += urls.length
        }
    }

    async onload() {
        const plugin: MeidaDownloaderPlugin = this
        this.addCommand({
            id: "download-all-attachments",
            name: "Download All Attachments",
            checkCallback: (checking) =>{
                const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView)
                const previewMode = markdownView?.previewMode?.containerEl?.style?.display === ""
                const file = markdownView?.file
                if (previewMode && file) {
                    if (!checking)
                        plugin.downloadAllAttachments(plugin, file);
                    return true;
                }
                return false;
            },
        })
        this._onFileOpen = (file: TFile | null) => {
            if (plugin.settings.downloadMode != "auto") return
            if (file != null) plugin.downloadAllAttachments(plugin, file)
        };
        this.app.workspace.on("file-open", this._onFileOpen)
        await this.loadSettings()
        this.addSettingTab(new MySettingTab(this.app, this))
    }
    onunload() {
        this.removeCommand("download-all-attachments")
        this.app.workspace.off("file-open", this._onFileOpen!)
        this.abortController?.abort()
        this._onFileOpen = null
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}