# obs-2-things

An [Obsidian](https://obsidian.md) plugin that sends open tasks from the
current note to the [Things 3](https://culturedcode.com/things/) inbox.

Tasks are sent in a single URL call using the `things:///json` scheme, which
works on both macOS and iOS. After sending, each task is marked `- [M]` in
the note to indicate it has been moved.

## Installation

This plugin is not listed in the Obsidian community plugin directory. Install
it via [BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers
Auto-update Tool).

1. Install BRAT from the Obsidian community plugins directory if you haven't
   already.
2. Open the BRAT settings and click **Add Beta Plugin**.
3. Enter the repository URL: `https://github.com/sulrich/obsidian-things3`
4. Click **Add Plugin**, then enable **obs-2-things** in Settings → Community
   Plugins.

## Things 3 setup

The plugin uses the Things URL scheme, which requires an auth token.

1. In Things 3, open **Settings → General** and enable **Things URLs**.
2. Copy the auth token that appears.
3. In Obsidian, open **Settings → obs-2-things** and paste the token into
   the **Things 3 auth token** field.

The auth token is stored in `localStorage` on each device and is not synced —
you need to set it once per device.

## Usage

Open a note containing one or more open tasks (`- [ ]`), then run the command
**Send open tasks to Things 3** from the command palette.

Each open task is added to the Things 3 inbox with:

- the task text as the title
- a note containing an `obsidian://` deep link back to the source note and the
  date it was added
- any configured tags (see below)

After sending, the tasks are marked `- [M]` in the note.

## Configuration

All settings except the auth token sync across devices via Obsidian Sync.

| Setting | Default | Description |
|---|---|---|
| **Things 3 auth token** | — | Per-device auth token from Things 3 → Settings → General → Enable Things URLs. Not synced. |
| **Tags** | `obsidian` | Comma-separated list of tags to apply to every created todo. Leading `#` is stripped automatically so Obsidian-style tags work as-is. **Tags must already exist in Things 3** — unknown tags are silently ignored. Leave empty for no tags. |
