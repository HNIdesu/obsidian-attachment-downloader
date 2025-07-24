import { MarkdownView, Plugin, TFile } from 'obsidian';


export default class MeidaDownloaderPlugin extends Plugin {
    private _onFileOpen: ((file: TFile | null) => any) | null = null;
    private markdownView: MarkdownView | null = null
    private abortController: AbortController | null = null
    private async onFileOpen(plugin: MeidaDownloaderPlugin, file: TFile | null) {
        plugin.abortController?.abort()
        const controller = new AbortController()
        plugin.abortController = controller
        if (file != null) {
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
            const batchSize = 5
            let start = 0
            while (true) {
                const urls = urlCollection.slice(start, start + batchSize)
                if (urls.length == 0) break
                try {
                    const res = await fetch("http://127.0.0.1:3322/pull-lfs", {
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
                    if (res.status == 200){
                        const results = await res.json() as Array<number>
                        if (results.contains(0))
                            plugin.markdownView?.previewMode?.rerender(true)
                    }
                    
                } catch (ex) {
                    if (ex.name == "AbortError") {
                        break
                    }
                }
                start += urls.length
            }
        }
    }
    onload() {
        this.markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const plugin: MeidaDownloaderPlugin = this
        this._onFileOpen = (file: TFile | null) => {
            plugin.onFileOpen(plugin, file)
        };
        this.app.workspace.on("file-open", this._onFileOpen)
    }
    onunload() {
        this.markdownView = null
        this.app.workspace.off("file-open", this._onFileOpen!)
        this._onFileOpen = null
    }
}