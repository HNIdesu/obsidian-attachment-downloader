import { Notice } from "obsidian";

export default class ProgressNotice {
	notice: Notice;
	textEl: HTMLElement;
	progressBarEl: HTMLProgressElement;
	private _text: string;
	private _progress: number;
	get text(): string {
		return this._text;
	}
	set text(value: string) {
		this._text = value;
		this.textEl.innerText = value;
	}
	get progress() {
		return this._progress;
	}
	set progress(value: number) {
		this.progressBarEl.value = value;
	}
	constructor(
		message: string = "",
		progress: number = 0,
		maxProgress: number = 1,
		duration: number = 0
	) {
		this.notice = new Notice(message, duration);
		const container = this.notice.containerEl;
		this.textEl = this.notice.messageEl;
		this.progressBarEl = container.createEl("progress");
        this.progressBarEl.value = progress
        this.progressBarEl.max = maxProgress
	}
	close() {
		this.notice.hide();
	}
}
