export class TAbstractFile {
  path: string;

  constructor(path = "") {
    this.path = path;
  }
}

export class TFile extends TAbstractFile {
  basename: string;
  extension: string;

  constructor(path = "") {
    super(path);

    const filename = path.split("/").at(-1) ?? "";
    const lastDot = filename.lastIndexOf(".");
    if (lastDot === -1) {
      this.basename = filename;
      this.extension = "";
    } else {
      this.basename = filename.slice(0, lastDot);
      this.extension = filename.slice(lastDot + 1);
    }
  }
}

export class App {
  vault: Record<string, unknown> = {};
  workspace: Record<string, unknown> = {};
  metadataCache: Record<string, unknown> = {};
}

export class Plugin {
  app = new App();
}

export class Notice {
  constructor(_message: string) {}
}

export class WorkspaceLeaf {}

export class ItemView {
  contentEl = { empty() {}, addClass() {}, createDiv() { return { createEl() { return {} } } }, createEl() { return {} } };
  app = new App();
  constructor(_leaf: WorkspaceLeaf) {}
  getViewType(): string { return "" }
  getDisplayText(): string { return "" }
  getIcon(): string { return "" }
  registerEvent(_evt: unknown) {}
}

export class Modal {
  app: App;
  modalEl = { addClass(_c: string) {}, removeClass(_c: string) {} };
  contentEl = { empty() {}, addClass(_c: string) {}, createDiv(_o?: unknown) { return { createEl() { return {} }, createSpan() { return {} } } }, createEl(_t?: string, _o?: unknown) { return {} } };
  constructor(app: App) { this.app = app; }
  open() {}
  close() {}
  setTitle(_t: string) {}
}

export class ButtonComponent {
  constructor(_el: unknown) {}
  setButtonText(_t: string) { return this }
  setCta() { return this }
  onClick(_cb: unknown) { return this }
}

export class PluginSettingTab {
  containerEl = { empty() {}, createEl() { return {} } };
  constructor(_app: App, _plugin: unknown) {}
}

export class Setting {
  constructor(_el: unknown) {}
  setName(_n: string) { return this }
  setDesc(_d: string) { return this }
  addToggle(_cb: unknown) { return this }
  addText(_cb: unknown) { return this }
  addDropdown(_cb: unknown) { return this }
  addTextArea(_cb: unknown) { return this }
}

export const MarkdownRenderer = {
  render(_app: unknown, _md: string, _el: unknown, _path: string, _component: unknown) { return Promise.resolve() }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
