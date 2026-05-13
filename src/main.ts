import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";

// synced settings -- stored in data.json and synced via obsidian sync
interface Obs2ThingsSettings {
  tags: string[];
}

const DEFAULT_SETTINGS: Obs2ThingsSettings = {
  tags: ["obsidian"],
};

// auth token lives in localStorage, not synced -- things 3 generates a unique
// token per device in settings -> general -> enable things URLs
const AUTH_TOKEN_STORAGE_KEY = "obs2things-plugin-auth-token";

interface TaskItem {
  lineIndex: number;
  indent: string;
  text: string;
}

export default class Obs2ThingsPlugin extends Plugin {
  settings: Obs2ThingsSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "send-tasks-to-things3",
      name: "Send open tasks to Things 3",
      callback: () => this.sendTasksToThings(),
    });

    this.addSettingTab(new Obs2ThingsSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    // guard against a non-array tags value from a migration edge case
    if (!Array.isArray(this.settings.tags)) {
      this.settings.tags = DEFAULT_SETTINGS.tags;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getAuthToken(): string {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? "";
  }

  saveAuthToken(token: string): void {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  }

  async sendTasksToThings(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("no active note open.");
      return;
    }

    const authToken = this.getAuthToken();
    if (!authToken) {
      new Notice(
        "things 3 auth token not set. add it in settings -> obs-2-things."
      );
      return;
    }

    let content: string;
    try {
      content = await this.app.vault.read(file);
    } catch (e) {
      new Notice("failed to read note content.");
      console.error("[obs2things] vault.read error:", e);
      return;
    }

    const tasks = this.parseTasks(content);
    if (tasks.length === 0) {
      new Notice("no open tasks (- [ ]) found in current note.");
      return;
    }

    const url = this.buildThingsUrl(tasks, file, authToken);

    // open things first -- if the file write fails below the tasks are already
    // in the inbox, which is the less-bad failure mode
    window.open(url);

    // use vault.process for an atomic read-modify-write so we can't stomp on
    // edits that arrived between our initial read and this write
    try {
      await this.app.vault.process(file, (data) =>
        this.applyMovedStatus(data, tasks)
      );
    } catch (e) {
      new Notice(
        "tasks sent to things 3, but failed to update note. check console for details."
      );
      console.error("[obs2things] vault.process error:", e);
      return;
    }

    new Notice(`sent ${tasks.length} task(s) to things 3 inbox.`);
  }

  // splits content by line and matches only unchecked tasks (- [ ]) at any
  // indent level. all other checkbox states (- [x], - [M], etc.) are ignored.
  // normalizes CRLF so a trailing \r never leaks into task text or line indices.
  parseTasks(content: string): TaskItem[] {
    const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const taskRegex = /^(\s*)- \[ \] (.+)$/;
    const tasks: TaskItem[] = [];

    lines.forEach((line, index) => {
      const match = line.match(taskRegex);
      if (match) {
        tasks.push({ lineIndex: index, indent: match[1], text: match[2] });
      }
    });

    return tasks;
  }

  // uses things:///json to send all tasks in a single URL call -- avoids the
  // iOS restriction that blocks all but the first window.open() in a tight loop
  buildThingsUrl(tasks: TaskItem[], file: TFile, authToken: string): string {
    const obsidianLink = this.buildObsidianLink(file);
    const today = new Date().toISOString().split("T")[0];
    const notes = `source: ${obsidianLink}\nadded: ${today}`;

    const tags = this.settings.tags
      .filter((t) => t.length > 0)
      .map((t) => t.replace(/^#+/, ""));

    const todos = tasks.map((task) => ({
      type: "to-do",
      attributes: {
        title: task.text,
        notes: notes,
        ...(tags.length > 0 ? { tags } : {}),
      },
    }));

    const encodedData = encodeURIComponent(JSON.stringify(todos));
    const encodedToken = encodeURIComponent(authToken);
    return `things:///json?data=${encodedData}&auth-token=${encodedToken}`;
  }

  buildObsidianLink(file: TFile): string {
    const vault = encodeURIComponent(this.app.vault.getName());
    const filePath = encodeURIComponent(file.path);
    return `obsidian://open?vault=${vault}&file=${filePath}`;
  }

  // replaces - [ ] with - [M] for each matched task line. normalizes line
  // endings for consistency with parseTasks so lineIndex values stay aligned.
  applyMovedStatus(content: string, tasks: TaskItem[]): string {
    const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    for (const task of tasks) {
      const line = lines[task.lineIndex];
      if (/^(\s*)- \[ \] (.+)$/.test(line)) {
        lines[task.lineIndex] = line.replace("- [ ]", "- [M]");
      }
    }
    return lines.join("\n");
  }
}

class Obs2ThingsSettingTab extends PluginSettingTab {
  plugin: Obs2ThingsPlugin;

  constructor(app: App, plugin: Obs2ThingsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "obs-2-things settings" });

    containerEl.createEl("h3", { text: "per-device settings (not synced)" });

    new Setting(containerEl)
      .setName("things 3 auth token")
      .setDesc(
        "your per-device things 3 auth token. generate it in things 3 -> " +
          "settings -> general -> enable things URLs. stored locally on " +
          "this device only -- not synced across devices."
      )
      .addText((text) =>
        text
          .setPlaceholder("enter auth token")
          .setValue(this.plugin.getAuthToken())
          .onChange((value) => {
            this.plugin.saveAuthToken(value.trim());
          })
      );

    containerEl.createEl("h3", { text: "synced settings" });

    new Setting(containerEl)
      .setName("tags")
      .setDesc(
        "comma-separated list of tags to apply to all todos created in things 3. " +
          "leading # is stripped automatically. each tag must already exist in " +
          "things 3. leave empty to add no tags. syncs across devices via obsidian sync."
      )
      .addText((text) =>
        text
          .setPlaceholder("obsidian, work")
          .setValue(this.plugin.settings.tags.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.tags = value
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length > 0);
            await this.plugin.saveSettings();
          })
      );
  }
}
