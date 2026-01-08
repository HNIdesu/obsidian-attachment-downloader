import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { AttachmentDownloadPluginSettings, DEFAULT_SETTINGS } from 'settings';
import MediaUrl from '../util/MediaUrl';
import AttachmentDownloadSettingTab from '../view/AttachmentDownloadSettingTab';
import ProgressNotice from '../components/ProgressNotice';

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
    async setupLfsDownloadUI() {
        const attachmentStatus = await fetch(`http://${this.plugin.settings.hostName}:${this.plugin.settings.port}/status-lfs`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                resources: this.mediaList.map(it=>it.url.mediaPath)
            }),
            signal: this.abortController.signal
        }).then(res=>res.json())
        this.mediaList.filter(it=>attachmentStatus[it.url.mediaPath] === "pointer-file").forEach(it=>{
            it.element.addClass("hidden")
            const containerEl = it.element.parentElement!
            const downloadArea = it.element.createDiv({
                cls: "attachment-download__area"
            })
            const titleElement = downloadArea.createEl("div",{
                text: `This attachment is not stored locally. Click below to download "${it.url.mediaPath}".`,
                cls: "attachment-download__title"
            })
            const btnElement = downloadArea.createEl("button",{
                text: "Download Attachment",
                cls: "attachment-download__button"
            })
            downloadArea.appendChild(titleElement)
            downloadArea.appendChild(btnElement)
            btnElement.addEventListener("click",async ()=>{
                btnElement.setText("Downloading...")
                btnElement.disabled = true
                try{
                    const json = await fetch(`http://${this.plugin.settings.hostName}:${this.plugin.settings.port}/pull-lfs`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            resources: [it.url.mediaPath]
                        }),
                        signal: this.abortController.signal
                    }).then(res => res.json())
                    const lastModifiedTime = json[0] as number
                    if (lastModifiedTime !== it.url.lastModifiedTime) {
                        it.url.lastModifiedTime = lastModifiedTime;
                        it.element.setAttribute("src", it.url.toString())
                    }
                    it.element.removeClass("hidden")
                    downloadArea.remove()
                }catch(err) {
                    console.error(err)
                    btnElement.setText("Download failed. Click to retry.")
                    btnElement.disabled = false
                }
            })
            containerEl.appendChild(downloadArea)
        })
    }
    async loadMedia(batchSize:number) {
        if (this.isLoading) {
            console.warn("Media is already loading. Please wait...");
            return
        }
        const mediaList = this.mediaList
        if (mediaList.length === 0) return
        this.isLoading = true
        const loadingProgressNotice = new ProgressNotice()
        loadingProgressNotice.text = "Loading attachments..."
        loadingProgressNotice.progress = 0
        let loadedAttachmentCount = 0
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
                    if (lastModifiedTime !== entry.url.lastModifiedTime) {
                        entry.url.lastModifiedTime = lastModifiedTime;
                        entry.element.setAttribute("src", entry.url.toString())
                    }
                }
            }).catch(err => {
                if (err.name === "AbortError"){
                    loadingProgressNotice.close()
                    this.isLoading = false
                    new Notice("Attachment loading aborted.",500)
                    throw err
                }
                console.error(err)
            })
            loadedAttachmentCount += mediaListChunk.length
            loadingProgressNotice.progress = loadedAttachmentCount / mediaList.length
        }
        this.isLoading = false
        loadingProgressNotice.close()
    }
    destroy() {
        this.observer.disconnect()
        this.abortController.abort()
    }
}

export default class MeidaDownloaderPlugin extends Plugin {
    private _session: Session | null = null
    private _timer: number | null = null
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
        this.registerEvent(this.app.workspace.on("file-open",  file => {
            if (plugin._session !== null) {
                plugin._session.destroy()
                plugin._session = null
            }
            if (file === null) return
            plugin._session = new Session(plugin, file)
            let lastEntryCount = 0
            if (plugin._timer)
                clearInterval(plugin._timer)
            plugin._timer = window.setInterval(() => {
                const length = plugin._session?.mediaList.length
                if (length !== undefined) {
                    if (length <= lastEntryCount) {
                        clearInterval(plugin._timer!)
                        plugin._timer = null
                        if (plugin.settings.downloadMode === "auto")
                            plugin._session?.loadMedia(plugin.settings.batchSize)
                        plugin._session?.setupLfsDownloadUI()
                    } else
                        lastEntryCount = length
                } else {
                    clearInterval(plugin._timer!)
                    plugin._timer = null
                }
            }, 1000)
            
        }))
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
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}