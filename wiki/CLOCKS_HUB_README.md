# Volumio CoreZoneDisplay — Unified Clocks Hub & Timepiece Framework

A standalone, 100% offline, zero-CDN web clock suite designed as the screensaver and timepiece engine for **Volumio CoreZoneDisplay** as well as independent browser/kiosk screensavers.

---

## 📚 Essential Documentation

| Document | Purpose | Target Audience |
| :--- | :--- | :--- |
| **[WIKI.md](file:///C:/github_harelsh/volumio-CoreZoneDisplay/submodule/clocks/WIKI.md)** | Full architectural wiki, mathematics, component specs, and integration details | Developers, Integrators, Users |
| **[AI_MANUAL.md](file:///C:/github_harelsh/volumio-CoreZoneDisplay/submodule/clocks/AI_MANUAL.md)** | Operational guidelines, golden rules, code recipes, and continuity state for subsequent AI sessions | Future AI Sessions & Maintainers |
| **[CASIO/README.md](file:///C:/github_harelsh/volumio-CoreZoneDisplay/submodule/clocks/CASIO/README.md)** | Casio analog timepiece engine overview, features, and keyboard shortcuts | Casio Clock Users |
| **[CASIO/TIMEPIECE_ENGINEERING_MANUAL.md](file:///C:/github_harelsh/volumio-CoreZoneDisplay/submodule/clocks/CASIO/TIMEPIECE_ENGINEERING_MANUAL.md)** | Deep mathematical formulas, marker extraction algorithms, and physics engine | Graphics & Physics Developers |
| **[CASIO/ADD_NEW_CLOCK_GUIDE.md](file:///C:/github_harelsh/volumio-CoreZoneDisplay/submodule/clocks/CASIO/ADD_NEW_CLOCK_GUIDE.md)** | Step-by-step onboarding pipeline for adding new watch models | Model Creators |

---

## 🌟 Key Subsystems

```text
submodule/clocks/
├── MainClockSelector.html        # Unified hub, master iframe switcher & card gallery
├── assets/
│   └── fonts/                    # 100% local offline fonts (Google Sans, Press Start 2P)
├── CASIO/                        # Authentic Casio G-Shock analog timepiece engine
│   ├── index.html                # Analog screensaver application
│   ├── style.css                 # 3D perspective, flexbox alignment & glare styles
│   ├── app.js                    # Core watch engine, harmonic 3D drift & glare physics
│   ├── particles.js              # Celestial background particle web
│   └── Watch/                    # Modular watch models repository
│       └── CASIO-GAC-2500-3A - VECTOR BW/  # Vector BW model (Strap & Dial variants)
└── digital/                      # Minimal Jewish/Hebrew digital calendar timepiece
    ├── index.html                # Digital clock with Zmanim, Shabbat times & sun events
    ├── settings.html             # Visual real-time customizer with dark/light themes
    └── defult-*.json             # Pre-configured digital design profiles
```

---

## ⚡ Core Highlights

1. **Main Clock Selector Hub ([MainClockSelector.html](file:///C:/github_harelsh/volumio-CoreZoneDisplay/submodule/clocks/MainClockSelector.html))**:
   - Central control hub managing both Casio analog and digital clocks.
   - Zero-flicker iframe hot-switching via bi-directional `postMessage` protocols.
   - Built-in screen rotation ($0^\circ, 90^\circ, 180^\circ, 270^\circ$), auto-roll carousel timer, and theme synchronizer.

2. **Casio G-Shock Analog Framework ([CASIO/](file:///C:/github_harelsh/volumio-CoreZoneDisplay/submodule/clocks/CASIO/))**:
   - **Zero Circular Crop Policy**: Preserves authentic full rectangular and octagonal watch cases and resin straps without artificial `border-radius: 50%` mutilation.
   - **Horizontal Alignment (Left / Center / Right)**: Allows shifting the clock to either side of the display with adjustable edge margins, freeing up screen space for Volumio now-playing metadata, album artwork, or VU meters.
   - **Harmonic Continuous 3D Motion**: Organic vector wandering powered by layered incommensurate sine waves and frame-rate-independent exponential smoothing.
   - **Full-Clock Specular Glass Glare**: Realistic light sheen sweeping across the entire watch silhouette, dynamically tracking tilt and customizable by light source side and intensity.
   - **Circular Date Disc Curvature**: Curvature mathematics simulating genuine internal rotating 31-day date discs.
   - **Center Circles Calibration Drawer**: Real-time 8-section tuning drawer with SVG crosshairs and one-click JSON export.

3. **Digital Hebrew & Gregorian Timepiece ([digital/](file:///C:/github_harelsh/volumio-CoreZoneDisplay/submodule/clocks/digital/))**:
   - Comprehensive zmanim, Shabbat candle-lighting and havdalah times, weekly Parashah, and astronomical sun events.
   - Interactive live settings customizer ([digital/settings.html](file:///C:/github_harelsh/volumio-CoreZoneDisplay/submodule/clocks/digital/settings.html)) with high-contrast black typography in light mode and comfortable grey backgrounds.

4. **100% Offline Standalone Guarantee**:
   - Zero external CDN dependencies (all Google fonts, web fonts, and libraries are locally bundled in [assets/fonts/](file:///C:/github_harelsh/volumio-CoreZoneDisplay/submodule/clocks/assets/fonts/)).

---

## ⌨️ Global Hotkeys Quick Reference

| Key | Context | Action |
| :--- | :--- | :--- |
| <kbd>M</kbd> or <kbd>Esc</kbd> | Main Hub | Toggle Clock Selector Overlay Menu |
| <kbd>A</kbd> | Casio Analog | Cycle Screen Alignment (Center → Left → Right) |
| <kbd>L</kbd> | Casio Analog | Align Clock to Left |
| <kbd>R</kbd> | Casio Analog | Align Clock to Right |
| <kbd>C</kbd> | Casio Analog | Align Clock to Center |
| <kbd>F</kbd> | Everywhere | Toggle Fullscreen Mode |
| <kbd>+</kbd> / <kbd>-</kbd> | Casio Analog | Zoom Clock Size ($\pm 2\%$, from 40% up to 200%) |
| <kbd>0</kbd> | Casio Analog | Reset Clock Size to Default 98% |
| <kbd>[</kbd> / <kbd>]</kbd> | Casio Analog | Decrease / Increase 3D Motion Speed |
