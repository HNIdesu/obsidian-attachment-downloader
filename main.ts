import { Plugin, TFile } from 'obsidian';


export default class MeidaDownloaderPlugin extends Plugin {
    private async onFileOpen(plugin: Plugin, file: TFile | null) {
        if (file != null) {
            const notePath = file.path
            const resourcePaths = new Array<string>()
            const content = await plugin.app.vault.cachedRead(file)
            const regExp = new RegExp("!\\[([^\\]]*)\\]\\(([^\\)]*)\\)", "g")
            for (const match of content.matchAll(regExp)) {
                let url = match[2] // url of the attachments
                if (url.trim() == "" || url.contains("\\")) continue
                url = url.trim().replace("%20", " ")
                if (!url.startsWith("attachments/"))
                    url = "attachments/" + url
                resourcePaths.push(url)
            }
            await fetch("http://127.0.0.1:3322/pull-lfs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    note: notePath,
                    resources: resourcePaths
                }),
                //mode: "no-cors"
            })
        }
    }
    private _onFileOpen: ((file: TFile | null) => any) | null = null;
    onload() {
        const plugin: MeidaDownloaderPlugin = this
        this._onFileOpen = (file: TFile | null) => {
            plugin.onFileOpen(plugin, file)
        };
        this.app.workspace.on("file-open", this._onFileOpen)
    }
    onunload() {
        this.app.workspace.off("file-open", this._onFileOpen!)
        this._onFileOpen = null
    }
}