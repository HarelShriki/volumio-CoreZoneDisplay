# Casio & Luxury Timepiece Web Framework: Engineering & Methodology Manual

> **A Complete Blueprint for Building Authentic, High-Precision, Responsive Analog Timepieces and Screensavers from Photo Assets.**
> 
> *Save, copy, and adapt this framework for any future watch, clock, smartwatch, or screensaver project.*

---

## 1. Architectural Philosophy & Principles

When converting physical timepieces into high-end interactive digital screensavers, generic clock implementations often suffer from common flaws:
- Forcing square watches or cropping authentic cases into a circular clipping mask (`border-radius: 50%`), destroying bezel geometry, lugs, and straps.
- Hardcoded absolute pixel coordinates that misalign or distort when viewed on different monitor sizes or resolutions.
- Flat linear date windows that ignore the circular geometry of internal date discs.
- Repetitive, robotic CSS animations that look unnatural rather than organically floating.

### The 5 Core Principles of this Framework:
1. **Preserve Authentic Case Geometry**: The watch case (with lugs, straps, and octagonal/rectangular bezels) is preserved in full without circular cropping.
2. **Direct Transparent Asset Rendering**: Authentic transparent PNG components are loaded directly without degrading photo quality.
3. **Automated Marker Calibration**: Pivots and centers are programmatically extracted from green marker calibration reference images using 8-way flood fill clustering.
4. **Responsive Percentage-to-Pixel Projection**: Pinion centers, subdials, and date apertures are mapped as scale-invariant percentages, while hand dimensions project dynamically based on dial pixel scale.
5. **Circular Date Disc Physics**: The 3-day date aperture follows the circular radial curvature of the internal rotating date wheel.

---

## 2. Standardized Directory Contract

To onboard any new timepiece model, organize assets in the following hierarchy:

```text
Watch/
└── <MODEL_NAME>/
    ├── clock clean.webp          # High-resolution original photo (optional backup)
    ├── clock full.jpg            # Complete assembled watch photo for visual reference
    ├── png/                      # AUTHENTIC TRANSPARENT ASSETS (Loaded by DOM/Canvas)
    │   ├── clock clean.png       # Dial & case with transparent center hole, date & subdial
    │   ├── hands Hour.png        # Transparent hour hand
    │   ├── hands Minute.png      # Transparent minute hand
    │   └── hands second.png      # Transparent small seconds / subdial hand
    └── map/                      # CALIBRATION MARKER IMAGES
        ├── center color.png      # Swatch containing the marker color (e.g., RGB 34, 177, 76)
        ├── clock clean.png       # Dial with colored marker circles placed on center, subdials, date
        ├── hands Hour.jpg        # Hour hand with marker circle over its rotation pivot
        ├── hands Minute.jpg      # Minute hand with marker circle over its rotation pivot
        └── hands second.jpg      # Second hand with marker circle over its rotation pivot
```

> [!IMPORTANT]
> - Never overwrite or modify the user's authentic assets in `png/`. Take the photos as-is.
> - Never add synthetic dots over the dial center pinion; authentic watch photos already feature authentic metal pinion caps and rivets.

---

## 3. Automated Marker Calibration Pipeline (`tools/analyze_markers.py`)

Rather than manually guessing pixel coordinates in Photoshop or DevTools, the calibration utility automatically calculates exact pivot centers:

```bash
python tools/analyze_markers.py "<MODEL_NAME>"
```

### Algorithm:
1. **Dynamic Color Detection**: Reads `center color.png` from the model's `map/` folder, sampling the center pixel:
   $$\text{target\_rgb} = \text{im.getpixel}((W/2, H/2))$$
2. **Threshold Filtering**: Scans every pixel $(x, y)$ in the target image. A pixel matches if:
   $$|R - R_t| \le 35 \quad \land \quad |G - G_t| \le 35 \quad \land \quad |B - B_t| \le 35$$
3. **8-Way Connected Component Clustering (BFS)**:
   Groups contiguous matching pixels into discrete clusters representing marker circles.
4. **Centroid & Bounding Box Calculation**:
   $$\bar{X} = \frac{1}{N}\sum x_i, \quad \bar{Y} = \frac{1}{N}\sum y_i$$
   $$\text{pct}_X = \frac{\bar{X}}{W_{\text{img}}} \times 100\%, \quad \text{pct}_Y = \frac{\bar{Y}}{H_{\text{img}}} \times 100\%$$

### Extracted Properties:
- **Main Pinion Center**: Centroid of cluster nearest dial center $\to$ `centerX`, `centerY`.
- **Subdial Centers** (e.g. 9h small seconds) $\to$ `subdialX`, `subdialY`.
- **Date Window Aperture**: Bounding box & centroid $\to$ `dateX`, `dateY`, `dateW`, `dateH`.
- **Hand Rotation Pivots**: Centroid of marker on hand image $\to$ `hourPivotX`, `hourPivotY`, `minPivotX`, `minPivotY`, `secPivotX`, `secPivotY`.

---

## 4. Coordinate & Sizing Mathematics

### Aspect Ratio Preservation
Watches have varying proportions (e.g. dial only $1072 \times 963$ vs watch with strap $1088 \times 1552$).
$$\text{Aspect Ratio } AR = \frac{W_{\text{dialNative}}}{H_{\text{dialNative}}}$$

### Responsive Frame Sizing (Upper-to-Bottom Coverage & Beyond-100% Zoom)
Let $S_{\text{screen}} \in [0.40, 2.00]$ be the user's selected screen coverage factor (default $0.98$ for upper-to-bottom fit, with options up to $2.00$ / $200\%$ to focus deeply on dial details):
$$\text{maxH} = H_{\text{viewport}} \times S_{\text{screen}}, \quad \text{maxW} = W_{\text{viewport}} \times S_{\text{screen}}$$

For tall watches ($AR \le 1.0$):
$$\text{frameH} = \text{maxH}, \quad \text{frameW} = \text{frameH} \times AR$$
$$\text{If } \text{frameW} > \text{maxW}: \quad \text{frameW} = \text{maxW}, \quad \text{frameH} = \frac{\text{frameW}}{AR}$$

### Horizontal Viewport Alignment (Left / Center / Right)
To support multi-zone and split-screen dashboards (such as Volumio CoreZoneDisplay where audio player metadata, album art, or visualizers require viewport space beside the timepiece), the stage container supports configurable horizontal alignment:
$$\text{align} \in \{\text{left}, \text{center}, \text{right}\}$$

In CSS Flexbox:
```css
.screensaver-stage.align-left   { justify-content: flex-start; }
.screensaver-stage.align-center { justify-content: center; }
.screensaver-stage.align-right  { justify-content: flex-end; }
```
An edge margin inset $\text{pad}_X \in [0\%, 25\%]$ (default $2.5\%$) prevents the watch bezel from clipping viewport boundaries:
```css
padding-left: var(--stage-pad-x, clamp(1rem, 2.5vw, 3rem));
padding-right: var(--stage-pad-x, clamp(1rem, 2.5vw, 3rem));
```
Kinetic 3D drift applies smoothly as local relative vector translations $\vec{T} = (\Delta x, \Delta y)$ on `.watch-frame`, preserving organic motion regardless of whether the watch sits on the left, right, or center.

### Dynamic Hand Scaling & Concentricity
Let $S_{\text{pixel}}$ be the scale factor from native image pixels to CSS rendered pixels:
$$S_{\text{pixel}} = \frac{\text{frameW}}{W_{\text{dialNative}}}$$

For any hand with native dimensions $W_h \times H_h$ and scale factor $\sigma$:
$$W_{\text{render}} = W_h \times \sigma \times S_{\text{pixel}}, \quad H_{\text{render}} = H_h \times \sigma \times S_{\text{pixel}}$$
$$\text{pivotX}_{\text{px}} = W_{\text{render}} \times \left(\frac{PX\%}{100}\right), \quad \text{pivotY}_{\text{px}} = H_{\text{render}} \times \left(\frac{PY\%}{100}\right)$$

In CSS, the hand is positioned relative to its anchor:
```css
left: -pivotX_px;
top: -pivotY_px;
width: W_render;
height: H_render;
transform-origin: PX% PY%;
```
**Why this works**: The hand's pivot point $(PX_{\text{px}}, PY_{\text{px}})$ is placed precisely at $(0, 0)$ of the anchor (`main-pinion-anchor`). When CSS applies `transform: rotate(...)`, the hand rotates around its pivot, maintaining concentric alignment at any window size.

---

## 5. Circular Date Disc Radius Curvature Physics

### The Problem with Linear Columns
On real mechanical and quartz watches, the date wheel is a circular ring rotating around the center of the movement. Because the date aperture is at 3 o'clock:
- The current day (today) is at the apex ($\theta = 0^\circ$).
- The day before (yesterday, above 3 o'clock) lies along the circular arc tilting counter-clockwise ($\theta < 0^\circ$).
- The day after (tomorrow, below 3 o'clock) lies along the circular arc tilting clockwise ($\theta > 0^\circ$).

### Curvature Formulas
Let $R$ be the radius from dial center to the date window:
$$R_{\text{px}} = \left(\frac{\text{dateX} - \text{centerX}}{100}\right) \times \text{frameW}$$
Let $\theta_{\text{arc}} \approx 8.5^\circ - 9.0^\circ$ be the angular step for one day on a 31-day disc ($\frac{360^\circ}{31} \approx 11.6^\circ$, optical aperture aperture $\approx 8.5^\circ$).
The inward chord shift $\Delta x$ toward dial center is:
$$\Delta x = R_{\text{px}} \times (1 - \cos \theta_{\text{arc}})$$

### CSS Implementation:
```css
/* Yesterday (Top): Shift left toward center + tilt CCW */
.date-window .date-prev {
  transform: translateX(var(--date-curve-shift, -4.5px)) rotate(calc(-1 * var(--date-curve-angle, 8.5deg)));
  transform-origin: 85% center;
}

/* Today (Center): Apex of the circle arc */
.date-window .date-curr {
  transform: translateX(0px) rotate(0deg);
  transform-origin: center center;
}

/* Tomorrow (Bottom): Shift left toward center + tilt CW */
.date-window .date-next {
  transform: translateX(var(--date-curve-shift, -4.5px)) rotate(var(--date-curve-angle, 8.5deg));
  transform-origin: 85% center;
}
```

---

## 6. Kinetic Randomized Vector Motion Engine

Instead of predictable canned CSS keyframe loops, the framework uses an organic **Kinetic Vector Drift Engine** driven by `requestAnimationFrame`:

### Drift Attractor Mathematics
Every interval $T = \frac{2800\text{ms}}{\text{speedFactor}}$, a new randomized 3D wander target vector is chosen:
$$\mathbf{T} = \begin{pmatrix} r_x \cdot 12\text{px} \\ r_y \cdot 9\text{px} \\ r_{\theta x} \cdot 3.6^\circ \\ r_{\theta y} \cdot 4.6^\circ \\ r_{\theta z} \cdot 1.2^\circ \end{pmatrix}, \quad r_i \in [-1, 1]$$

In each frame (with delta time $dt$):
$$\mathbf{C}_{t} = \mathbf{C}_{t-1} + (\mathbf{T} - \mathbf{C}_{t-1}) \cdot \min(1.0, dt \times 1.7 \times \text{speedFactor})$$

When the user moves their cursor, interactive parallax is blended on top:
$$\text{rotX}_{\text{total}} = \mathbf{C}_{\theta x} + \text{mouseTilt}_X, \quad \text{rotY}_{\text{total}} = \mathbf{C}_{\theta y} + \text{mouseTilt}_Y$$

### Default-Off State with "V" Checkmark
- Motion is strictly **OFF by default** (`this.motionActive = false`), ensuring a rock-solid, static timepiece upon loading.
- Activated only when the user checks the `3D Motion` button, which displays a vivid **"✓" (V)** checkmark.
- When toggled off, the engine critically damps back to $(0, 0, 0)$ smoothly without snapping.

### Segmented Speed Bars (`SPEED [ ▂▃▄ ]`)
Inspired by classic Casio LCD signal/battery indicators:
| Level | Factor | Speed Label | Active Bars |
| :---: | :---: | :--- | :--- |
| **1** | `0.5x` | Ultra Slow / Ambient | 1 bar |
| **2** | `0.8x` | Gentle / Meditative | 2 bars |
| **3** | `1.2x` | Active / Natural *(Default)* | 3 bars |
| **4** | `2.0x` | Fast / Dynamic | 4 bars |

---

## 7. Synthesized Mechanical Quartz Audio

Ticks are synthesized live in the browser using the Web Audio API without requiring external audio files:
1. **Dual-Oscillator Impulse**: Triangle wave starting at $1350\text{Hz}$ with an exponential pitch drop to $140\text{Hz}$ in $18\text{ms}$.
2. **Bandpass Resonance**: $Q = 7$ filter centered at $2000\text{Hz}$ simulating the mechanical escapement click.
3. **Envelope**: Exponential gain decay to $0.0001$ over $22\text{ms}$.

---

## 8. Interactive Celestial Particle Web

An ambient canvas background engine ([particles.js](file:///C:/github_harelsh/ClockWeb/CASIO/particles.js)) connects particles via dynamic proximity distance webs:
- **Repulsion/Attraction**: Cursor pushes and interacts with floating nodes.
- **Theme Adaptation**: Automatically shifts color themes based on the active watch model:
  - Vector Monochrome (`CASIO-GAC-2500-3A - VECTOR BW`): Silver Graphite `rgba(220, 225, 230, ...)`.
- **Shockwave Tick Pulse**: On every second change, an expanding radial shockwave propagates through the particle field.

---

## 9. Registering a New Watch Model (`WATCH_MODELS` Schema)

To add any timepiece to [app.js](file:///C:/github_harelsh/ClockWeb/CASIO/app.js):

```javascript
'MODEL-KEY': {
  name: 'Display Name',
  folder: 'Watch/<MODEL_FOLDER>',
  dialPng: 'Watch/<MODEL_FOLDER>/png/clock clean.png',
  dialWebp: 'Watch/<MODEL_FOLDER>/clock clean.webp',
  dialMap: 'Watch/<MODEL_FOLDER>/map/clock clean.png',
  handHour: 'Watch/<MODEL_FOLDER>/png/hands Hour.png',
  handMinute: 'Watch/<MODEL_FOLDER>/png/hands Minute.png',
  handSecond: 'Watch/<MODEL_FOLDER>/png/hands second.png',
  dialNativeW: 1024,
  dialNativeH: 1024,
  aspectRatio: 1.0, // dialNativeW / dialNativeH
  centerX: 50.10,   // % from analyze_markers.py
  centerY: 48.68,
  subdialX: 31.45,
  subdialY: 49.13,
  dateX: 77.83,
  dateY: 49.90,
  dateW: 5.37,
  dateH: 12.60,
  dateArcAngle: 8.5, // Curvature arc angle (deg)
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
  secRotOffset: 0, // Set to 180 if hand tip points down in raw PNG
  particleTheme: 'green' // 'green' | 'mono' | 'cyber' | 'gold'
}
```

---

## 10. Blueprint for Porting to Another Project

Follow this step-by-step checklist to port this framework into another repository:

1. **Copy Core Engine Files**:
   - `index.html`, `style.css`, `app.js`, `particles.js`.
   - `tools/analyze_markers.py`.
2. **Prepare Asset Folders**:
   - Place transparent watch elements in `Watch/<MODEL>/png/`.
   - Place marker calibration references in `Watch/<MODEL>/map/`.
3. **Run Marker Calibration**:
   ```bash
   python tools/analyze_markers.py "<MODEL>"
   ```
4. **Paste Configuration**:
   - Add model entry into `WATCH_MODELS` in `app.js`.
   - Add `<option value="MODEL">Name</option>` in `index.html`.
5. **Verify Live**:
   - Open browser, switch to the model, and click **Calibrate Circles**.
   - Verify alignment crosshairs; fine-tune sliders if necessary.
   - Click **Copy Config JSON** to persist updates directly to source.
