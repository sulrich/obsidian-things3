import Obs2ThingsPlugin from "./main";

const MOCK_FILE = { path: "notes/test.md" } as any;
const AUTH_TOKEN = "tok-abc123";

// builds a minimal plugin instance without invoking the Plugin constructor,
// which requires a full Obsidian runtime environment
function makePlugin(tags: string[] = []) {
  const plugin = Object.create(Obs2ThingsPlugin.prototype) as Obs2ThingsPlugin;
  plugin.settings = { tags };
  (plugin as any).app = { vault: { getName: () => "test-vault" } };
  return plugin;
}

// decodes the things:///json data parameter and returns the parsed todos array
function decodeTodos(url: string): any[] {
  const match = url.match(/[?&]data=([^&]+)/);
  if (!match) throw new Error("no data param found in url");
  return JSON.parse(decodeURIComponent(match[1]));
}

// ---------------------------------------------------------------------------
// parseTasks
// ---------------------------------------------------------------------------

describe("parseTasks", () => {
  let plugin: Obs2ThingsPlugin;

  beforeEach(() => {
    plugin = makePlugin();
  });

  it("returns empty array for empty content", () => {
    expect(plugin.parseTasks("")).toEqual([]);
  });

  it("returns empty array for content with no tasks", () => {
    expect(plugin.parseTasks("# Heading\n\nsome prose\n\n> blockquote")).toEqual([]);
  });

  it("matches a single open task", () => {
    const tasks = plugin.parseTasks("- [ ] buy milk");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe("buy milk");
    expect(tasks[0].lineIndex).toBe(0);
    expect(tasks[0].indent).toBe("");
  });

  it("matches multiple open tasks", () => {
    const tasks = plugin.parseTasks("- [ ] first\n- [ ] second\n- [ ] third");
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.text)).toEqual(["first", "second", "third"]);
  });

  it("does not match completed tasks - [x]", () => {
    expect(plugin.parseTasks("- [x] done")).toEqual([]);
  });

  it("does not match completed tasks - [X]", () => {
    expect(plugin.parseTasks("- [X] done")).toEqual([]);
  });

  it("does not match moved tasks - [M]", () => {
    expect(plugin.parseTasks("- [M] already sent to things")).toEqual([]);
  });

  it("does not match cancelled tasks - [-]", () => {
    expect(plugin.parseTasks("- [-] cancelled")).toEqual([]);
  });

  it("does not match forwarded tasks - [>]", () => {
    expect(plugin.parseTasks("- [>] forwarded")).toEqual([]);
  });

  it("only returns open tasks from mixed content", () => {
    const content = [
      "# my note",
      "",
      "- [x] already done",
      "- [ ] still open",
      "- [M] sent to things last week",
      "- [ ] also open",
      "- [-] cancelled",
    ].join("\n");
    const tasks = plugin.parseTasks(content);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.text)).toEqual(["still open", "also open"]);
  });

  it("preserves indentation in the indent field", () => {
    const tasks = plugin.parseTasks("  - [ ] indented task");
    expect(tasks[0].indent).toBe("  ");
    expect(tasks[0].text).toBe("indented task");
  });

  it("returns correct lineIndex values", () => {
    const content = "# heading\n\n- [ ] task one\nsome text\n- [ ] task two";
    const tasks = plugin.parseTasks(content);
    expect(tasks[0].lineIndex).toBe(2);
    expect(tasks[1].lineIndex).toBe(4);
  });

  it("handles CRLF line endings without trailing \\r in task text", () => {
    const content = "- [ ] first\r\n- [M] moved\r\n- [ ] second";
    const tasks = plugin.parseTasks(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].text).toBe("first");
    expect(tasks[1].text).toBe("second");
  });

  it("returns correct lineIndex values with CRLF input", () => {
    const content = "# heading\r\n\r\n- [ ] task one\r\n- [M] moved\r\n- [ ] task two";
    const tasks = plugin.parseTasks(content);
    expect(tasks[0].lineIndex).toBe(2);
    expect(tasks[1].lineIndex).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// applyMovedStatus
// ---------------------------------------------------------------------------

describe("applyMovedStatus", () => {
  let plugin: Obs2ThingsPlugin;

  beforeEach(() => {
    plugin = makePlugin();
  });

  it("replaces - [ ] with - [M] for the given tasks", () => {
    const content = "- [ ] buy milk";
    const tasks = plugin.parseTasks(content);
    expect(plugin.applyMovedStatus(content, tasks)).toBe("- [M] buy milk");
  });

  it("does not modify lines that are not in the task list", () => {
    const content = "- [ ] task one\n- [ ] task two\n- [ ] task three";
    const allTasks = plugin.parseTasks(content);
    const updated = plugin.applyMovedStatus(content, [allTasks[1]]);
    const lines = updated.split("\n");
    expect(lines[0]).toBe("- [ ] task one");
    expect(lines[1]).toBe("- [M] task two");
    expect(lines[2]).toBe("- [ ] task three");
  });

  it("does not re-process already-moved - [M] lines", () => {
    // parseTasks never returns - [M] lines; passing empty tasks simulates that
    const content = "- [M] already moved";
    expect(plugin.applyMovedStatus(content, [])).toBe("- [M] already moved");
  });

  it("does not modify - [x] lines", () => {
    const content = "- [x] completed";
    expect(plugin.applyMovedStatus(content, [])).toBe("- [x] completed");
  });

  it("preserves indentation when marking tasks", () => {
    const content = "  - [ ] indented task";
    const tasks = plugin.parseTasks(content);
    expect(plugin.applyMovedStatus(content, tasks)).toBe("  - [M] indented task");
  });

  it("handles CRLF input and outputs LF only", () => {
    const content = "- [ ] task one\r\n- [ ] task two";
    const tasks = plugin.parseTasks(content);
    const updated = plugin.applyMovedStatus(content, tasks);
    const lines = updated.split("\n");
    expect(lines[0]).toBe("- [M] task one");
    expect(lines[1]).toBe("- [M] task two");
  });

  it("lineIndex values from parseTasks align correctly after CRLF normalization", () => {
    const content = "# heading\r\n\r\n- [ ] task one\r\n- [ ] task two";
    const tasks = plugin.parseTasks(content);
    const updated = plugin.applyMovedStatus(content, tasks);
    const lines = updated.split("\n");
    expect(lines[2]).toBe("- [M] task one");
    expect(lines[3]).toBe("- [M] task two");
  });
});

// ---------------------------------------------------------------------------
// buildThingsUrl
// ---------------------------------------------------------------------------

describe("buildThingsUrl", () => {
  it("returns a things:///json URL", () => {
    const plugin = makePlugin([]);
    const tasks = plugin.parseTasks("- [ ] task");
    expect(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN)).toMatch(
      /^things:\/\/\/json\?/
    );
  });

  it("includes the auth-token in the URL", () => {
    const plugin = makePlugin([]);
    const tasks = plugin.parseTasks("- [ ] task");
    const url = plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN);
    expect(url).toContain(`auth-token=${encodeURIComponent(AUTH_TOKEN)}`);
  });

  it("creates one todo per task", () => {
    const plugin = makePlugin([]);
    const tasks = plugin.parseTasks("- [ ] one\n- [ ] two\n- [ ] three");
    expect(decodeTodos(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN))).toHaveLength(3);
  });

  it("sets todo type to 'to-do'", () => {
    const plugin = makePlugin([]);
    const tasks = plugin.parseTasks("- [ ] task");
    const [todo] = decodeTodos(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN));
    expect(todo.type).toBe("to-do");
  });

  it("sets the todo title from the task text", () => {
    const plugin = makePlugin([]);
    const tasks = plugin.parseTasks("- [ ] buy oat milk");
    const [todo] = decodeTodos(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN));
    expect(todo.attributes.title).toBe("buy oat milk");
  });

  it("includes an obsidian:// deep link in the notes", () => {
    const plugin = makePlugin([]);
    const tasks = plugin.parseTasks("- [ ] task");
    const [todo] = decodeTodos(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN));
    expect(todo.attributes.notes).toContain("obsidian://open?vault=test-vault");
    expect(todo.attributes.notes).toContain("notes%2Ftest.md");
  });

  it("includes today's date in the notes", () => {
    const plugin = makePlugin([]);
    const tasks = plugin.parseTasks("- [ ] task");
    const [todo] = decodeTodos(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN));
    expect(todo.attributes.notes).toMatch(/added: \d{4}-\d{2}-\d{2}/);
  });

  it("includes configured tags in the payload", () => {
    const plugin = makePlugin(["work", "personal"]);
    const tasks = plugin.parseTasks("- [ ] task");
    const [todo] = decodeTodos(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN));
    expect(todo.attributes.tags).toEqual(["work", "personal"]);
  });

  it("strips leading # from tags", () => {
    const plugin = makePlugin(["#obsidian", "#work"]);
    const tasks = plugin.parseTasks("- [ ] task");
    const [todo] = decodeTodos(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN));
    expect(todo.attributes.tags).toEqual(["obsidian", "work"]);
  });

  it("strips multiple leading # characters", () => {
    const plugin = makePlugin(["##doubled"]);
    const tasks = plugin.parseTasks("- [ ] task");
    const [todo] = decodeTodos(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN));
    expect(todo.attributes.tags).toEqual(["doubled"]);
  });

  it("omits the tags field entirely when the tags list is empty", () => {
    const plugin = makePlugin([]);
    const tasks = plugin.parseTasks("- [ ] task");
    const [todo] = decodeTodos(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN));
    expect(todo.attributes.tags).toBeUndefined();
  });

  it("omits the tags field when all tags are empty strings", () => {
    const plugin = makePlugin(["", "  "]);
    // settings loading filters empty strings, but guard at URL build time too
    plugin.settings.tags = ["", ""];
    const tasks = plugin.parseTasks("- [ ] task");
    const [todo] = decodeTodos(plugin.buildThingsUrl(tasks, MOCK_FILE, AUTH_TOKEN));
    expect(todo.attributes.tags).toBeUndefined();
  });
});
