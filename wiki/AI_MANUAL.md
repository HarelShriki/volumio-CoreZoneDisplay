# AI Manual — Volumio CoreZoneDisplay

> **Read this before changing anything.** It lists the rules, where things live, recipes for common changes, and the checks to run before you finish. The full architecture is in [WIKI.md](WIKI.md).

---

## 1. Project in One Minute

- **Repo root** `C:\github_harelsh\volumio-CoreZoneDisplay` — a Volumio 3 `user_interface` plugin.
- [`index.js`](../index.js) runs Express on **port 4004**: serves the display ([`public/`](../public/)), the clocks (`/clocks` → [`submodule/clocks`](../submodule/clocks/)) and `/api/*`. It also builds and saves the Volumio settings page ([`UIConfig.json`](../UIConfig.json) + [`i18n/strings_en.json`](../i18n/strings_en.json)).
- [`public/app.js`](../public/app.js) is the display: player menu, Volumio socket (port 3000), idle-clock timer, in-app settings, live settings sync.
- [`submodule/clocks`](../submodule/clocks/) is a **separate git repo** (ClockWeb): `MainClockSelector.html` hub, `CASIO/` analog engine, `digital/` Hebrew digital clock.
- The user communicates in short English (sometimes Hebrew). They test on a Raspberry Pi with Volumio and locally on Windows.

---

## 2. Rules (do not break)

1. **No circle crop on Casio watches.** Never use `border-radius: 50%`, `clip-path: circle()` or circular masks on the watch case.
2. **Don't touch real assets.** Never overwrite, resize or recompress files in `CASIO/Watch/<model>/png/`. Calibrate with CSS/anchor values in `CASIO/app.js`.
3. **Offline only.** No CDN `<link>`/`<script>` (no `fonts.googleapis.com`, `cdnjs`, `unpkg`, `jsdelivr`). Fonts live in `public/fonts/` and `submodule/clocks/assets/fonts/` (Carlito and DSEG7 are embedded in `digital/index.html`). Every `font-family` list must end in a bundled font or a generic family. Volumio boxes often have no internet. Font table: [WIKI.md §7](WIKI.md#7-fonts-100-offline).
4. **Keep the `postMessage` contract** between `MainClockSelector.html` and the clock iframes. Prefer a message over reloading the iframe. Message list: [WIKI.md §6.4](WIKI.md#64-postmessage-messages).
5. **Per-model storage.** Casio alignment/inset are stored per model key (`casio_align_<model>`, `casio_inset_<model>`).
6. **Settings page structure.** One Volumio section per topic, each with its own Save button, plain-language labels — no "Setting 1/2/3" wording and no open/close switch hacks. `saveSettings()` must update **only the keys it receives**, because each section sends only its own fields.
7. **Every saveable field must be in its section's `saveButton.data`**, or Volumio will never send it (this bug happened with `preventScreensaverWhilePlaying`).
8. **Settings must reach the open screen without a reload.** After saving, call `notifySettingsChanged()` on the server; on the display use `applyConfigIfChanged()` (not `applyConfigObject()` directly) so the 5-second poll doesn't disturb the user.
9. **Submodule git order.** Commit and push inside `submodule/clocks` first, then `git add submodule/clocks` and commit in the parent. Check `git status` inside the submodule — it is often on a detached HEAD; put work on `main` before pushing.
10. **Ask before pushing, deleting files or other hard-to-undo actions.**

---

## 3. Where to Change What

| Task | Files |
| :--- | :--- |
| Add/rename a Volumio setting | `UIConfig.json` (field + section `saveButton.data`), `i18n/strings_en.json` (label + doc), `index.js` → `getUIConfig()` (fill value), `saveSettings()` (save it), `getCurrentSettings()` (read with default), `updateConfigFromApi()` (in-app save) |
| Same setting in the in-app Settings view | `public/index.html` (`#view-settings`), `public/app.js` → `populateSettingsForm()`, `handleSaveSettingsFromView()`, `applyConfigObject()` |
| Idle clock behaviour | `public/app.js` → `resetIdleTimer()`, `showScreensaver()`, `hideScreensaver()`, `handlePushState()` (wake on play/stop) |
| Display mode switching | `public/app.js` → `applyDisplayMode()` |
| Server routes / API | `index.js` → `onStart()` |
| Clock list in Volumio | `index.js` → `getAvailableClocks()` (scans `submodule/clocks` for `.html`, adds `CASIO/index.html`, `digital/index.html`) |
| Clock hub UI, registry, presets | `submodule/clocks/MainClockSelector.html` (`CLOCK_REGISTRY`, `DIGITAL_PRESETS`, `renderCards`, `runClock`) |
| Casio alignment | `CASIO/style.css` (stage section), `CASIO/app.js` → `setAlignment()`, `cycleAlignment()`, `setAlignInset()` |
| Casio motion | `CASIO/app.js` → `updateKineticMotion()`, `setMotionSpeed()` |
| Local dev server mock | `win-debug/dev-server.js` (keep its `/api/config` in step with `index.js`) |

---

## 4. Recipes

### A. Add a Volumio setting

1. Add the field to the right section's `content` in `UIConfig.json` and its id to that section's `saveButton.data`.
2. Add `LABEL` and `LABEL_DOC` strings in `i18n/strings_en.json` (clear words, no "Setting N").
3. `index.js`: default constant → `getCurrentSettings()`; fill value in `getUIConfig()`; `if (data.x !== undefined)` block in `saveSettings()`; same in `updateConfigFromApi()`.
4. `public/app.js`: read it in `applyConfigObject()`; add to the in-app form if needed.
5. Run the checks in section 5.

### B. Add a Casio model

1. Create `CASIO/Watch/<MODEL>/png/` (transparent `clock clean*.png`, `hands Hour.png`, `hands Minute.png`, `hands second.png`) and `map/` (same images with green markers RGB 34,177,76).
2. `python CASIO/tools/analyze_markers.py "<MODEL>"` → note center, subdial, date and pivot percentages.
3. Add the key to `WATCH_MODELS` in `CASIO/app.js` (paths, native size, percentages, `align: 'center'`, `alignInset: 2.5`, `particleTheme`).
4. Add an `<option>` in `#model-selector` in `CASIO/index.html`.
5. Add a `CLOCK_REGISTRY` entry in `MainClockSelector.html` (`category: "casio"`, `casioModel`).
Full guide: [`CASIO/ADD_NEW_CLOCK_GUIDE.md`](../submodule/clocks/CASIO/ADD_NEW_CLOCK_GUIDE.md).

### C. Add a digital preset

1. Design it in `digital/settings.html`, **Export JSON**, save as `digital/defult-N.json`.
2. Register in `MainClockSelector.html`: `DIGITAL_PRESETS` and `CLOCK_REGISTRY` (`category: "digital"`, `digitalPreset: "defult-N"`).

---

## 5. Checks Before You Finish

Run from the repo root:

```bash
# JSON + JS syntax for plugin and clocks
node win-debug/validate-all.js

# Plugin files on their own
node --check index.js && node --check public/app.js

# Script blocks inside the clock HTML files
node -e "
const fs = require('fs');
['submodule/clocks/MainClockSelector.html','submodule/clocks/CASIO/index.html','submodule/clocks/digital/settings.html','submodule/clocks/digital/index.html'].forEach(f => {
  const html = fs.readFileSync(f, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) { if (m[1].includes('text/plain') || m[1].includes('src=')) continue; if (m[2].trim()) new Function(m[2]); }
  console.log(f + ': scripts OK');
});"

# What changed (parent and submodule)
git status --short && git -C submodule/clocks status --short
```

To try the display locally: `win-debug\start-local.bat` (or `PORT=4077 node win-debug/dev-server.js`), then open `http://localhost:4004`. The dev server saves to `win-debug/dev-config.json` — undo test changes to that file afterwards.

After changing the settings page, `index.js` or fonts, also run:

```bash
node win-debug/test-volumio-settings.js   # simulated Volumio settings page: translate, save per section, reload (must print ALL PASSED)
node win-debug/check-fonts.js             # offline font audit (must print ALL FONTS STANDALONE)
```

`test-volumio-settings.js` builds the plugin with a mock `coreCommand` (`pluginManager.getConfigurationFile`, `i18nJson`, `pushToastMessage`, `broadcastMessage`) on a temp copy of `config.json`. Extend it when you add a setting. Note: `getUIConfig()` returns a **kew** promise — use `.then`/`.fail`, or wrap it in a native `Promise`.

No Volumio device is reachable from the dev PC (`volumio.local` does not answer), so final confirmation of settings and live updates must be done by the user on the Pi.

---

## 6. Known Quirks

1. **`file:///` and `mask-image`**: Chrome blocks the Casio glass mask when opened as a local file. Always test through a server (`http://localhost:4004/clocks/...`).
2. **Submodule detached HEAD**: normal after `git submodule update`. Before committing, `git checkout main` (or `git branch -f main HEAD` if you already committed) so work isn't lost.
3. **Clock Only mode has no Volumio socket**: it only gets settings through the 5-second `/api/config` poll.
4. **`localStorage` is per browser**: clock hub choices (alignment, theme, rotation, saved clock) are not shared between screens.
5. **High-DPI**: Casio sizing uses viewport units and `dialPixelScale = frameW / dialNativeW`; never use fixed pixel sizes for dial parts.
6. **Preset file names use "defult"** (misspelled) — they are IDs; don't rename them.

---

## 7. Recent Work Log

- **2026-11-19** — Verification: added `win-debug/test-volumio-settings.js` (25 checks, all pass) and `win-debug/check-fonts.js` (all fonts offline). Wiki rebuilt in `wiki/` with relative links.
- **2026-11-19** — Volumio settings page rebuilt into 5 clear sections (Display Mode, Idle Clock, Clock Face, Favorite Radio Stations, Web Addresses); per-section partial saves; `preventScreensaverWhilePlaying` now saved; Web Addresses show the real device IP.
- **2026-11-19** — Live settings sync: server broadcast `pushCoreZoneDisplaySettings` + 5 s `/api/config` poll + `applyConfigIfChanged()`.
- **2026-11-19** — ClockWeb merge: local design work (align/scroll, glass shine, grey light theme in `digital/settings.html`) merged with origin and pushed (`6b64587`).
- Earlier — Casio harmonic 3D motion, full-clock glass shine, Left/Center/Right alignment with scroll, Vector BW strap/dial models, local fonts.
