import { Platform } from "obsidian"

export default class MediaUrl {
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
