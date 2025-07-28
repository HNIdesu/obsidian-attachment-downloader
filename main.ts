import { MarkdownView, Platform, Plugin, TFile } from 'obsidian';
import { MySettingTab } from './settings'
interface MyPluginSettings {
    hostName: string
    port: number
    downloadMode: string
}
class MediaEntry {
    element: Element
    url: MediaUrl
    constructor(element: Element, url: MediaUrl) {
        this.element = element
        this.url = url
    }
}
class Session {
    file: TFile
    abortController: AbortController
    observer: MutationObserver
    mediaList: Array<MediaEntry>
    plugin: MeidaDownloaderPlugin
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
                        mediaList.push(new MediaEntry((node as Element), url))
                    }
                }
            }
        })
    }
    loadMedia() {
        const mediaList = this.mediaList
        if (mediaList.length == 0) return
        fetch(`http://${this.plugin.settings.hostName}:${this.plugin.settings.port}/pull-lfs`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                resources: mediaList.map(it => it.url.mediaPath)
            }),
            signal: this.abortController.signal
        }).then(res => res.json()).then(json => {
            for (let i = 0; i < mediaList.length; i++) {
                const lastModifiedTime = json[i] as number
                const entry = mediaList[i]
                if (lastModifiedTime != entry.url.lastModifiedTime) {
                    entry.url.lastModifiedTime = lastModifiedTime;
                    entry.element.setAttribute("src", entry.url.toString())
                }
            }
        }).catch(err => {
            console.error(err)
        })
    }
    destroy() {
        this.observer.disconnect()
        this.abortController.abort()
    }
}

const DEFAULT_SETTINGS: Partial<MyPluginSettings> = {
    hostName: "127.0.0.1",
    port: 3322,
    downloadMode: "auto"
}

class MediaUrl {
    hostname: string
    protocol: string
    vaultDirectory: string
    mediaPath: string
    lastModifiedTime: number
    hash: string
    private constructor() { }
    static parse(urlStr: string | undefined | null, vaultDirectory: string): MediaUrl {
        const result = new MediaUrl()
        const url = new URL(urlStr!)
        result.protocol = url.protocol
        result.hostname = url.hostname
        result.vaultDirectory = vaultDirectory
        if (Platform.isMobileApp) {
            const regex = new RegExp(`/_capacitor_file_${vaultDirectory}/(.+)`, "g")
            const matchResult = regex.exec(url.pathname)
            result.mediaPath = decodeURIComponent(matchResult![1])
            result.lastModifiedTime = 0
        } else {
            const regex = new RegExp(`/${vaultDirectory}/(.+)`, "g")
            const matchResult = regex.exec(url.pathname)
            result.mediaPath = decodeURIComponent(matchResult![1])
            result.lastModifiedTime = parseInt(url.search.substring(1))
        }
        result.hash = url.hash
        return result
    }
    toString() {
        return Platform.isMobileApp ?
            `${this.protocol}//${this.hostname}/_capacitor_file_${this.vaultDirectory}/${encodeURIComponent(this.mediaPath)}?${this.lastModifiedTime}${this.hash}` :
            `${this.protocol}//${this.hostname}/${this.vaultDirectory}/${encodeURIComponent(this.mediaPath)}?${this.lastModifiedTime}${this.hash}`
    }
}

export default class MeidaDownloaderPlugin extends Plugin {
    private _onFileOpen: ((file: TFile | null) => any)
    private _session: Session | null = null
    private _timer: NodeJS.Timer | null = null
    settings: MyPluginSettings;
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
                        plugin._session?.loadMedia()
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
                            plugin?._session?.loadMedia()
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
        this.addSettingTab(new MySettingTab(this.app, this))
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