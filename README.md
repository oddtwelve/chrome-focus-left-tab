# Focus Left Tab

**English** | [Русский](README.ru.md)

A Google Chrome extension. When you close the active tab, focus moves to the tab on the **left** instead of the tab on the right, which is what Chrome does by default.

## Installation

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the extension folder, the one that contains `manifest.json`.

That's it. Don't delete or move the folder: Chrome loads the extension directly from it.

## How it works

- Close the active tab → the nearest tab on the left becomes active.
- Close the leftmost tab → there's nothing on the left, so Chrome moves to the right as usual.
- Close a background (inactive) tab → focus stays where it is.
- Tabs in collapsed groups are skipped, so a group never expands on its own.
- Works in every window and keeps working after a browser restart.

## Limitations

- Chrome switches to the tab on the right first, and only then does the extension move focus to the left. The right tab may flash for a split second. Extensions can't turn off Chrome's built-in behavior.
- If you open a tab from a link and close it right away, Chrome usually returns to the tab you opened it from. The extension always goes left.

## Language

The extension's name and description follow Chrome's interface language: Russian if Chrome is in Russian, English for every other language. The strings live in `_locales/`.

## Files

- `manifest.json` — the extension manifest (Manifest V3). Permissions: `storage` and `tabGroups`. The extension can't see page addresses or page content.
- `background.js` — all of the logic.
- `_locales/` — the name and description in English (default) and Russian.
- `icons/` — the icons. `icon.svg` is the source for 48 and 128 px, `icon-16.svg` is a simplified source for 16 and 32 px.
