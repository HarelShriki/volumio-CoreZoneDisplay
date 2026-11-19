# CoreZoneDisplay Wiki

Documentation for the **Volumio CoreZoneDisplay** plugin and its **clocks** submodule.

| File | What's inside |
| :--- | :--- |
| **[project_wiki_and_ai_manual.md](project_wiki_and_ai_manual.md)** | **Master Consolidated Manual**: Full system architecture, Express/Socket.io specs, Apple HIG design, Clocks engine, postMessage contracts, offline fonts, and AI invariants |
| **[WIKI.md](WIKI.md)** | The full wiki: architecture, display modes and idle clock, Volumio and in-app settings, live settings sync, HTTP API, clocks submodule (hub, Casio, digital, messages, storage keys), offline fonts, verification tests, install and local development |
| **[AI_MANUAL.md](AI_MANUAL.md)** | For AI agents and maintainers: rules, where to change what, recipes, checks to run, known quirks, work log |
| **[VOLUMIO_PLUGIN_SETTINGS_GUIDE.md](VOLUMIO_PLUGIN_SETTINGS_GUIDE.md)** | How Volumio plugin settings work (learned from volumio-now-playing): what happens on Save, `UIConfig.json` rules, how v-conf stores values and how a save can silently fail, and a checklist for a setting that does not stick on the Pi |
| [TIMEPIECE_ENGINEERING_MANUAL.md](TIMEPIECE_ENGINEERING_MANUAL.md) | Casio engine math (copy of [`submodule/clocks/CASIO/TIMEPIECE_ENGINEERING_MANUAL.md`](../submodule/clocks/CASIO/TIMEPIECE_ENGINEERING_MANUAL.md)) |
| [ADD_NEW_CLOCK_GUIDE.md](ADD_NEW_CLOCK_GUIDE.md) | Adding a Casio model (copy of [`submodule/clocks/CASIO/ADD_NEW_CLOCK_GUIDE.md`](../submodule/clocks/CASIO/ADD_NEW_CLOCK_GUIDE.md)) |

The two Casio files are copies; the originals in `submodule/clocks/CASIO/` are the ones to edit.
