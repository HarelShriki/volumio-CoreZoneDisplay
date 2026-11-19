# Volumio CoreZoneDisplay — Minimal & Focused Volumio Display

A focused, elegant, multi-zone web display and screensaver suite for **Volumio 3**, running on Raspberry Pi touchscreens, HDMI displays, TVs, and remote kiosks.

---

## 📖 Complete Documentation

| Document | Description |
| :--- | :--- |
| **[wiki/project_wiki_and_ai_manual.md](wiki/project_wiki_and_ai_manual.md)** | **Master Consolidated Manual**: Plugin architecture, Clocks framework, UI/UX specs, postMessage API & AI session guide |
| **[wiki/WIKI.md](wiki/WIKI.md)** | Full wiki: plugin architecture, settings, API, clocks submodule, install and local development |
| **[wiki/AI_MANUAL.md](wiki/AI_MANUAL.md)** | Rules, recipes and checks for AI agents and maintainers |
| **[wiki/README.md](wiki/README.md)** | Wiki index |

---

## 🚀 Overview & Capabilities

- **Display Modes**:
  - `screensaver_only`: Fullscreen dedicated timepiece clock display.
  - `full_ui`: Multi-zone audio playback interface with auto-activating screensaver clock upon idle timeout.
- **Express Static & API Server**: Runs on port `4004` (e.g. `http://<volumio-ip>:4004`), hosting both the player frontend and the `/clocks/` submodule.
- **Clocks Submodule ([submodule/clocks](submodule/clocks/))**:
  - **[MainClockSelector.html](submodule/clocks/MainClockSelector.html)**: Master clock hub with zero-flicker iframe hot-switching, display orientation rotations ($0^\circ, 90^\circ, 180^\circ, 270^\circ$), and auto-roll carousel.
  - **Casio G-Shock Analog Framework ([CASIO/](submodule/clocks/CASIO/))**: Natural case presentation (no circular crop), dual Vector BW models (Full Strap & Dial Only), continuous harmonic 3D drift, specular glass glare, Left/Center/Right alignment for split-screen layouts, and an 8-section center calibration drawer.
  - **Minimal Digital Jewish/Hebrew Clock ([digital/](submodule/clocks/digital/))**: Gregorian & Hebrew dates, Zmanim, Shabbat times, weekly Parashah, astronomical sun tracking, and interactive visual customizer.
- **100% Offline Standalone**: All fonts (Google Sans, Press Start 2P) and scripts are locally bundled. Zero external CDN dependencies.
