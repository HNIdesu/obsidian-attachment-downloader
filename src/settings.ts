export interface AttachmentDownloadPluginSettings {
    hostName: string
    port: number
    batchSize: number
    downloadMode: string
}

export const DEFAULT_SETTINGS: Partial<AttachmentDownloadPluginSettings> = {
    hostName: "127.0.0.1",
    port: 3322,
    batchSize: 5,
    downloadMode: "auto"
}