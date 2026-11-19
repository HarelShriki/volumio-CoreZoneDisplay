# Casio Watch Project — Guide: Adding a New Clock Model

This guide documents the standardized architecture and automated pipeline for adding any new Casio G-Shock timepiece model to this repository.

---

## 1. Directory Structure

Each watch model lives inside its own folder under [Watch/](file:///C:/github_harelsh/ClockWeb/CASIO/Watch/):

```text
Watch/
└── <MODEL_NAME>/
    ├── clock clean.webp          # (Optional) High-res reference photo
    ├── png/                      # AUTHENTIC TRANSPARENT ASSETS (Used by HTML/Canvas)
    │   ├── clock clean.png       # Dial & case with transparent center hole, date & subdial
    │   ├── hands Hour.png        # Transparent hour hand
    │   ├── hands Minute.png      # Transparent minute hand
    │   └── hands second.png      # Transparent subdial second hand
    └── map/                      # CALIBRATION MARKER IMAGES
        ├── center color.png      # 1x1 or sample swatch of marker color (RGB 34, 177, 76)
        ├── clock clean.png       # Dial with green calibration circles overlaid
        ├── hands Hour.jpg        # Hour hand with green pivot center circle
        ├── hands Minute.jpg      # Minute hand with green pivot center circle
        └── hands second.jpg      # Second hand with green pivot center circle
```

> **Rules for Assets**:
> - **Never crop the dial into a circle** (`border-radius: 50%` is prohibited). Full natural case geometry and straps are preserved.
> - **Never overwrite or alter the authentic PNG assets** in `png/`. Take the photos as-is.

---

## 2. Automated Marker Center Extraction

To calibrate the center pinion, subdial, date aperture, and hand pivots, run the automated marker analyzer:

```bash
python tools/analyze_markers.py "<MODEL_NAME>"
```

### What `analyze_markers.py` Does:
1. Samples `center color.png` to dynamically detect the marker RGB (defaults to `RGB(34, 177, 76)`).
2. Performs 8-way flood fill clustering across every image in `map/`.
3. Outputs exact center coordinates $(X, Y)$ in both pixels and percentages (`pct_x`, `pct_y`), plus bounding box dimensions.

### Output Mapping:
| Image | Target Component | Coordinate Property |
| :--- | :--- | :--- |
| `clock clean.png` | Center Pinion | `centerX`, `centerY` |
| `clock clean.png` | 9 O'clock Subdial | `subdialX`, `subdialY` |
| `clock clean.png` | 3 O'clock Date Window | `dateX`, `dateY`, `dateW`, `dateH` |
| `hands Hour.*` | Hour Hand Pivot | `hourPivotX`, `hourPivotY` |
| `hands Minute.*` | Minute Hand Pivot | `minPivotX`, `minPivotY` |
| `hands second.*` | Second Hand Pivot | `secPivotX`, `secPivotY` |

> **Motion & Speed Note**: Watches support organic randomized 3D kinetic vector drift. Users can turn motion on/off with the `3D Motion` checkbox toggle (marked with "V" when on) and adjust speed with the interactive segmented speed bars (`SPEED [ ▂▃▄ ]` for 0.5x, 0.8x, 1.2x, 2.0x) or keyboard shortcuts (<kbd>[</kbd> and <kbd>]</kbd>).

> **Circular Date Disc Curvature**: The 3-day date window follows the circular radius of the date wheel ring. The previous day tilts counter-clockwise and curves inwards, while the next day tilts clockwise and curves inwards. Tweak via `dateArcAngle` or the Calibration Drawer slider.

> **Screen Coverage, Zoom (>100%) & Fullscreen**: Watches automatically scale to cover from upper to bottom of the screen (98% to 100% height) across any resolution and in fullscreen mode. Users can modify the screen size and zoom beyond 100% (from 40% up to 200% to deeply focus on dial details) using the `Screen: 98%` cycle button in the header bar, keyboard shortcuts (<kbd>+</kbd> / <kbd>-</kbd> / <kbd>0</kbd>), or the Screen Coverage slider in the calibration drawer.

> **Horizontal Alignment (Left / Center / Right)**: Timepieces support positioning on the Left, Center, or Right side of the viewport (`align: 'left' | 'center' | 'right'`). This enables side-by-side display with media players and now-playing metadata in Volumio CoreZoneDisplay. Tweak via the header button (`Align: Center`), Calibration Drawer Section 8 (with edge margin slider), keyboard hotkeys (<kbd>A</kbd>, <kbd>L</kbd>, <kbd>R</kbd>, <kbd>C</kbd>), URL param `?align=left|right|center`, or postMessage `CLOCKWEB_SET_ALIGN`. Persists per model in `localStorage`.

---

## 3. Register the Model in `app.js`

Add an entry to `WATCH_MODELS` in [app.js](file:///C:/github_harelsh/ClockWeb/CASIO/app.js):

```javascript
'MY-MODEL-KEY': {
  name: 'GAC-2500 Model Name',
  folder: 'Watch/MY-MODEL-FOLDER',
  dialPng: 'Watch/MY-MODEL-FOLDER/png/clock clean.png',
  dialWebp: 'Watch/MY-MODEL-FOLDER/clock clean.webp',
  dialMap: 'Watch/MY-MODEL-FOLDER/map/clock clean.png',
  handHour: 'Watch/MY-MODEL-FOLDER/png/hands Hour.png',
  handMinute: 'Watch/MY-MODEL-FOLDER/png/hands Minute.png',
  handSecond: 'Watch/MY-MODEL-FOLDER/png/hands second.png',
  dialNativeW: 1024,
  dialNativeH: 1024,
  aspectRatio: 1024 / 1024, // dialNativeW / dialNativeH
  centerX: 50.10,
  centerY: 48.68,
  subdialX: 31.45,
  subdialY: 49.13,
  dateX: 77.83,
  dateY: 49.90,
  dateW: 5.37,
  dateH: 12.60,
  dateArcAngle: 8.5, // Circular date disc radius arc curvature angle (deg)
  hourNativeW: 215,
  hourNativeH: 854,
  hourPivotX: 51.16,
  hourPivotY: 70.91,
  hourScale: 0.395,
  hourRotOffset: 0,
  minNativeW: 205,
  minNativeH: 1058,
  minPivotX: 49.50,
  minPivotY: 80.96,
  minScale: 0.395,
  minRotOffset: 0,
  secNativeW: 131,
  secNativeH: 584,
  secPivotX: 46.97,
  secPivotY: 58.06,
  secScale: 0.258,
  secRotOffset: 0, // Set to 180 if hand pointer tip points down in raw PNG
  particleTheme: 'green' // 'green' | 'mono' | 'cyber' | 'gold'
}
```

---

## 4. Add Model to UI Selector in `index.html`

In [index.html](file:///C:/github_harelsh/ClockWeb/CASIO/index.html), add the `<option>` into `<select id="model-selector">`:

```html
<select id="model-selector" class="model-select">
  <option value="CASIO-GAC-2500-3A-VECTOR-BW-STRAP">GAC-2500-3A Vector BW (With Strap)</option>
  <option value="CASIO-GAC-2500-3A-VECTOR-BW-DIAL">GAC-2500-3A Vector BW (Dial Only)</option>
  <option value="MY-MODEL-KEY">Your Model Name Here</option>
</select>
```

---

## 5. Visual Real-time Calibration & Testing

1. Open `index.html` in the browser.
2. Select your new model from the dropdown.
3. Click the **Calibrate Circles** button in the header bar.
4. Verify alignment:
   - Red crosshair matches the center pinion.
   - Cyan crosshair matches the 9h subdial.
   - Yellow box fits the 3h date aperture.
5. If fine-tuning is required, adjust the live sliders in the drawer.
6. Click **Copy Config JSON** to export your calibrated parameters directly back to `WATCH_MODELS`.
