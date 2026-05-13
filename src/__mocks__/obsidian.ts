export class App {}

export class Notice {
  constructor(public message: string) {}
}

export class Plugin {
  app: any;
  loadData(): Promise<any> { return Promise.resolve(null); }
  saveData(_data: any): Promise<void> { return Promise.resolve(); }
  addCommand(_cmd: any): void {}
  addSettingTab(_tab: any): void {}
}

export class PluginSettingTab {
  constructor(public app: any, public plugin: any) {}
  display(): void {}
}

export class Setting {
  constructor(_containerEl: any) {}
  setName(_name: string) { return this; }
  setDesc(_desc: string) { return this; }
  addText(_cb: (text: any) => any) { return this; }
  addToggle(_cb: (toggle: any) => any) { return this; }
}

export class TFile {
  path = "";
  name = "";
}
