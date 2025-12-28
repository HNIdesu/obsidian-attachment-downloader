import { MarkdownView, Plugin, TFile } from 'obsidian';
import { AttachmentDownloadPluginSettings, DEFAULT_SETTINGS } from 'settings';
import MediaUrl from '../util/MediaUrl';
import AttachmentDownloadSettingTab from '../view/AttachmentDownloadSettingTab';

type MediaEntry = {
    element: Element,
    url: MediaUrl
}

class Session {
    file: TFile
    abortController: AbortController
    observer: MutationObserver
    mediaList: Array<MediaEntry>
    plugin: MeidaDownloaderPlugin
    isLoading = false
    constructor(plugin: MeidaDownloaderPlugin, file: TFile) {
        this.plugin = plugin
        this.file = file
        const controller = new AbortController()
        this.abortController = controller
        const mediaList = new Array<MediaEntry>()
        this.mediaList = mediaList
        this.observer = new MutationObserver(records => {
            for (const record of records) {
                for (let i = 0; i < record.addedNodes.length; i++) {
                    const node = record.addedNodes[i]
                    if (node.nodeName === "IMG" || node.nodeName === "AUDIO" || node.nodeName === "VIDEO") {
                        const vaultDirectory: string = (plugin.app.vault.adapter as any).basePath.replaceAll("\\", "/") // directory of the vault
                        const link = (node as Element).getAttribute("src")
                        let url: MediaUrl
                        try {
                            url = MediaUrl.parse(link, vaultDirectory)
                        } catch (ex) {
                            continue
                        }
                        mediaList.push({
                            "element": node as Element,
                            url
                        })
                    }
                }
            }
        })
    }
    async loadMedia(batchSize:number) {
        if (this.isLoading) {
            console.warn("Media is already loading. Please wait...");
            return
        }
        const mediaList = this.mediaList
        if (mediaList.length == 0) return
        this.isLoading = true
        for (let i = 0; i < mediaList.length; i += batchSize) {
            const mediaListChunk = mediaList.slice(i, i + batchSize)
            await fetch(`http://${this.plugin.settings.hostName}:${this.plugin.settings.port}/pull-lfs`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    resources: mediaListChunk.map(it => it.url.mediaPath)
                }),
                signal: this.abortController.signal
            }).then(res => res.json()).then(json => {
                for (let i = 0; i < mediaListChunk.length; i++) {
                    const lastModifiedTime = json[i] as number
                    const entry = mediaListChunk[i]
                    if (lastModifiedTime != entry.url.lastModifiedTime) {
                        entry.url.lastModifiedTime = lastModifiedTime;
                        entry.element.setAttribute("src", entry.url.toString())
                    }
                }
            }).catch(err => {
                if (err.name === "AbortError")
                    throw err
                console.error(err)
            })
        }
        this.isLoading = false
    }
    destroy() {
        this.observer.disconnect()
        this.abortController.abort()
    }
}

export default class MeidaDownloaderPlugin extends Plugin {
    private _onFileOpen: ((file: TFile | null) => any)
    private _session: Session | null = null
    private _timer: NodeJS.Timer | null = null
    settings: AttachmentDownloadPluginSettings;
    async onload() {
        const plugin: MeidaDownloaderPlugin = this
        this.addCommand({
            id: "download-all-attachments",
            name: "Download All Attachments",
            checkCallback: (checking) => {
                const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView)
                const previewMode = markdownView?.previewMode?.containerEl?.style?.display === ""
                const file = markdownView?.file
                if (previewMode && file) {
                    if (!checking)
                        plugin._session?.loadMedia(plugin.settings.batchSize)
                    return true;
                }
                return false;
            },
        })
        this._onFileOpen = file => {
            if (file === null) return
            plugin._session?.destroy()
            plugin._session = new Session(plugin, file)
            let lastEntryCount = 0
            if (plugin._timer)
                clearInterval(plugin._timer)
            if (plugin.settings.downloadMode == "auto")
                plugin._timer = setInterval(() => {
                    const length = plugin._session?.mediaList.length
                    if (length !== undefined) {
                        if (length <= lastEntryCount) {
                            clearInterval(plugin._timer!)
                            plugin._timer = null
                            plugin._session?.loadMedia(plugin.settings.batchSize)
                        } else
                            lastEntryCount = length
                    } else {
                        clearInterval(plugin._timer!)
                        plugin._timer = null
                    }
                }, 1000)
        }
        this.app.workspace.on("file-open", this._onFileOpen)
        this.registerMarkdownPostProcessor((e) => {
            plugin._session?.observer?.observe(e, {
                childList: true,
                subtree: true
            })
        });
        await this.loadSettings()
        this.addSettingTab(new AttachmentDownloadSettingTab(this.app, this))
    }
    onunload() {
        this._session?.destroy()
        this._session = null
        this.app.workspace.off("file-open", this._onFileOpen!)
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}