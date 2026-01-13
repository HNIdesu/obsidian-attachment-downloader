type DownloadState = "pending" | "downloading" | "failed" | "done";

export class AttachmentDownloadCard {
	private _token: any;
	private _state: DownloadState;
	private _error: any | null;
	private _cardElement: HTMLDivElement | null = null;
	private _titleElement: HTMLDivElement | null = null;
	private _downloadBtnElement: HTMLButtonElement | null = null;
	private _title: string;

	public get title(): string {
		return this._title;
	}

	public set title(value: string) {
		this._title = value;
		this._titleElement?.setText(
			`This attachment is not stored locally. Click below to download "${this._title}".`
		);
	}

	public get error(): any | null {
		return this._error;
	}

	public get state(): DownloadState {
		return this._state;
	}

	public set state(s: DownloadState) {
		this._state = s;
		if (s === "downloading") {
			if (this._downloadBtnElement) {
				this._downloadBtnElement.setText("Downloading...");
				this._downloadBtnElement.disabled = true;
			}
		} else if (s === "failed") {
			if (this._downloadBtnElement) {
				this._downloadBtnElement.setText(
					"Download failed. Click to retry."
				);
				this._downloadBtnElement.disabled = false;
			}
		} else if (s === "done") {
			if (this._downloadBtnElement) {
				this._downloadBtnElement.setText("Download completed.");
				this._downloadBtnElement.disabled = true;
			}
		} else {
			if (this._downloadBtnElement) {
				this._downloadBtnElement.setText("Download Attachment");
				this._downloadBtnElement.disabled = false;
			}
		}
	}

	constructor(token: any, onDownload: (token: any) => Promise<void>) {
		this._token = token;
		this._state = "pending";
		this._error = null;
		this.onDownload = onDownload;
	}

	async download() {
		this._error = null;
		this.state = "downloading";
		try {
			await this.onDownload(this._token);
			this.state = "done";
			this.onDownloadCompleted(this._token);
		} catch (ex) {
			this._error = ex;
			this.state = "failed";
			this.onDownloadFailed(this._token, this._error);
		}
	}

	render(containerEl: Element) {
		const downloadCard = containerEl.createDiv({
			cls: "attachment-download__card",
		});
		const titleElement = downloadCard.createEl("div", {
			text: `This attachment is not stored locally. Click below to download "${this._title}".`,
			cls: "attachment-download__title",
		});
		const btnElement = downloadCard.createEl("button", {
			text: "Download Attachment",
			cls: "attachment-download__button",
		});
		this._cardElement = downloadCard;
		this._titleElement = titleElement;
		this._downloadBtnElement = btnElement;
		btnElement.addEventListener("click", this.download.bind(this));
	}

	remove() {
		if (
			this._cardElement &&
			this._titleElement &&
			this._downloadBtnElement
		) {
			this._cardElement.remove();
			this._cardElement = null;
			this._titleElement = null;
			this._downloadBtnElement = null;
		}
	}

	markAsCompleted() {
		this.state = "done";
		this.onDownloadCompleted(this._token);
	}

	onDownload: (token: any) => Promise<void>;
	onDownloadCompleted: (token: any) => void = () => {};
	onDownloadFailed: (token: any, error: any) => void = () => {};
}
