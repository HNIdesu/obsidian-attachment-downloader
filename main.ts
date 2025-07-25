import { Platform, Plugin, TFile } from 'obsidian';
import { MySettingTab } from './settings'
interface MyPluginSettings {
    hostName: string
    port: number
}
class Session {
    file: TFile
    abortController: AbortController
    observer: MutationObserver
    constructor(plugin: MeidaDownloaderPlugin, file: TFile) {
        this.file = file
        const controller = new AbortController()
        this.abortController = controller
        this.observer = new MutationObserver(records => {
            for (const record of records) {
                for (let i = 0; i < record.addedNodes.length; i++) {
                    const node = record.addedNodes[i]
                    if (node.nodeName == "IMG" || node.nodeName == "AUDIO" || node.nodeName == "VIDEO") {
                        const vaultDirectory: string = (plugin.app.vault.adapter as any).basePath.replaceAll("\\", "/") // directory of the vault
                        const link = (node as Element).getAttribute("src")
                        let url: MediaUrl
                        try {
                            url = MediaUrl.parse(link, vaultDirectory)
                        } catch (ex) {
                            continue
                        }
                        fetch(`http://${plugin.settings.hostName}:${plugin.settings.port}/pull-lfs`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                resources: [url.mediaPath]
                            }),
                            signal: controller.signal
                        }).then(res => res.json()).then(json => {
                            const lastModifiedTime = json[0] as number
                            if (lastModifiedTime != url.lastModifiedTime) {
                                url.lastModifiedTime = lastModifiedTime;
                                (node as Element).setAttribute("src", url.toString())
                            }
                        }).catch(err => {
                            console.error(err)
                        })
                    }
                }
            }
        })
    }
    destroy() {
        this.observer.disconnect()
        this.abortController.abort()
    }
}

const DEFAULT_SETTINGS: Partial<MyPluginSettings> = {
    hostName: "127.0.0.1",
    port: 3322
}

class MediaUrl {
    hostname: string
    protocol: string
    vaultDirectory: string
    mediaPath: string
    lastModifiedTime: number
    hash: string
    private MediaUrl() { }
    static parse(urlStr: string | undefined | null, vaultDirectory: string): MediaUrl {
        const result = new MediaUrl()
        const url = new URL(urlStr!)
        result.protocol = url.protocol
        result.hostname = url.hostname
        result.vaultDirectory = vaultDirectory
        if (Platform.isMobileApp) {
            const regex = new RegExp(`/_capacitor_file_${vaultDirectory}/(.+)`, "g")
            const matchResult = regex.exec(url.pathname)
            result.mediaPath = matchResult![1]
            result.lastModifiedTime = 0
        } else {
            const regex = new RegExp(`/${vaultDirectory}/(.+)`, "g")
            const matchResult = regex.exec(url.pathname)
            result.mediaPath = matchResult![1]
            result.lastModifiedTime = parseInt(url.search.substring(1))
        }
        result.hash = url.hash
        return result
    }
    toString() {
        return Platform.isMobileApp ? `${this.protocol}//${this.hostname}/_capacitor_file_${this.vaultDirectory}/${this.mediaPath}?${this.lastModifiedTime}${this.hash}` :
            `${this.protocol}//${this.hostname}/${this.vaultDirectory}/${this.mediaPath}?${this.lastModifiedTime}${this.hash}`
    }
}

export default class MeidaDownloaderPlugin extends Plugin {
    private _onFileOpen: ((file: TFile | null) => any)
    private _session: Session | null = null
    settings: MyPluginSettings;
    async onload() {
        const plugin: MeidaDownloaderPlugin = this
        this._onFileOpen = file => {
            if (file == null) return
            plugin._session?.destroy()
            plugin._session = new Session(plugin, file)
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