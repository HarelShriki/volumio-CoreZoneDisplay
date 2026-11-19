// Simulated Volumio settings test for CoreZoneDisplay (no Volumio needed).
// Flow: i18nJson translation -> getUIConfig -> save each section via onSave method
// -> getUIConfig again -> check config on disk, broadcasts, pushUiConfig and /api/config values.
// Works on a temp copy of config.json. Usage (from repo root): node win-debug/test-volumio-settings.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const root = path.resolve(__dirname, '..');
const libQ = require(path.join(root, 'node_modules', 'kew'));
const Plugin = require(path.join(root, 'index.js'));

let fails = 0;
const check = (name, ok, extra) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!ok) fails++;
};

// Volumio's i18nJson: replaces every "TRANSLATE.KEY" string with strings_xx[KEY], falling back to en.
function i18nJson(langFile, defaultFile, uiFile) {
  const d = libQ.defer();
  const lang = JSON.parse(fs.readFileSync(langFile, 'utf8'));
  const def = JSON.parse(fs.readFileSync(defaultFile, 'utf8'));
  const ui = JSON.parse(fs.readFileSync(uiFile, 'utf8'));
  const missing = [];
  (function walk(o) {
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'string' && o[k].startsWith('TRANSLATE.')) {
        const key = o[k].slice(10);
        if (lang[key] !== undefined) o[k] = lang[key];
        else if (def[key] !== undefined) o[k] = def[key];
        else missing.push(key);
      } else if (o[k] && typeof o[k] === 'object') walk(o[k]);
    }
  })(ui);
  check('all TRANSLATE keys exist in strings_en.json', missing.length === 0, missing.join(','));
  d.resolve(ui);
  return d.promise;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'czd-'));
const cfgFile = path.join(tmp, 'config.json');
fs.copyFileSync(path.join(root, 'config.json'), cfgFile);
const broadcasts = [];
const toasts = [];

let mockPluginInstance = null;

const router = {
  pluginManager: { getConfigurationFile: () => cfgFile },
  pushToastMessage: (t, a, b) => toasts.push(t + ':' + b),
  broadcastMessage: (m, d) => broadcasts.push({ m, d }),
  getUIConfigOnPlugin: (type, name, opts) => {
    if (mockPluginInstance) {
      return mockPluginInstance.getUIConfig();
    }
    return libQ.resolve({});
  },
  sharedVars: { get: () => 'en' },
  i18nJson
};

const p = new Plugin({ coreCommand: router, logger: { info() {}, error: console.error, warn() {} } });
mockPluginInstance = p;
p.onVolumioStart && p.onVolumioStart();

const getUI = () => new Promise((res, rej) => p.getUIConfig().then(res).fail(rej));
const field = (ui, id) => ui.sections.flatMap((s) => s.content).find((c) => c.id === id);

// ---------------------------------------------------------------------------
// Robustness rig: a fresh plugin instance on its own config file, so that the
// ways "60 -> 5" can fail to stick are tested for real (see wiki/VOLUMIO_PLUGIN_SETTINGS_GUIDE.md).
// ---------------------------------------------------------------------------
const extraDirs = [];
function makeRig(configText, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'czd-r-'));
  extraDirs.push(dir);
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, configText);
  if (opts.readOnly) fs.chmodSync(file, 0o444);
  const rig = { dir, file, toasts: [], broadcasts: [] };
  const rigRouter = {
    pluginManager: { getConfigurationFile: () => file },
    pushToastMessage: (type, title, msg) => rig.toasts.push({ type, msg }),
    broadcastMessage: (m, d) => rig.broadcasts.push({ m, d }),
    getUIConfigOnPlugin: () => libQ.resolve({}),
    sharedVars: { get: () => 'en' },
    i18nJson
  };
  rig.plugin = new Plugin({ coreCommand: rigRouter, logger: { info() {}, error() {}, warn() {} } });
  rig.plugin.onVolumioStart();
  rig.idle = () => rig.plugin.getCurrentSettings().idleTimeoutSec;
  rig.disk = (key) => {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return j[key];
  };
  rig.saveIdle = (value) =>
    rig.plugin.configSaveScreensaver({ screensaverEnabled: true, preventScreensaverWhilePlaying: true, idleTimeoutSec: value });
  rig.lastToast = () => rig.toasts[rig.toasts.length - 1] || { type: 'none', msg: '' };
  return rig;
}

function robustnessChecks() {
  const typedDefaults = fs.readFileSync(path.join(root, 'config.json'), 'utf8');
  const strings = JSON.parse(fs.readFileSync(path.join(root, 'i18n/strings_en.json'), 'utf8'));
  console.log('\n  --- 60 -> 5 and other ways saving can fail ---');

  // 1. The reported case: 60 -> 5, as a number and as the text Volumio may send
  [5, '5'].forEach((value) => {
    const r = makeRig(typedDefaults);
    check('start value is 60', r.idle() === 60);
    r.saveIdle(value);
    check(`60 -> ${JSON.stringify(value)} is kept in memory`, r.idle() === 5);
    check(`60 -> ${JSON.stringify(value)} is written to disk as a number entry`, r.disk('idleTimeoutSec').value === 5 && r.disk('idleTimeoutSec').type === 'number');
    check(`60 -> ${JSON.stringify(value)} shows the success message`, r.lastToast().type === 'success' && r.lastToast().msg === strings.SETTINGS_SAVED);
  });

  // 2. Survives a Volumio restart (a new plugin instance reads the same file)
  let r = makeRig(typedDefaults);
  r.saveIdle(5);
  const restarted = new Plugin({
    coreCommand: { pluginManager: { getConfigurationFile: () => r.file }, pushToastMessage() {}, broadcastMessage() {}, sharedVars: { get: () => 'en' }, i18nJson },
    logger: { info() {}, error() {}, warn() {} }
  });
  restarted.onVolumioStart();
  check('5 survives a restart (new instance reads the file)', restarted.getCurrentSettings().idleTimeoutSec === 5);

  // 3. Stored entry in the wrong shape: v-conf alone silently ignores the new value
  const flat = JSON.parse(typedDefaults);
  flat.idleTimeoutSec = 60;
  r = makeRig(JSON.stringify(flat));
  r.saveIdle(5);
  check('plain stored number (wrong shape) is repaired and 5 sticks', r.idle() === 5 && r.disk('idleTimeoutSec').value === 5);

  const wrongType = JSON.parse(typedDefaults);
  wrongType.idleTimeoutSec = { type: 'string', value: '60' };
  r = makeRig(JSON.stringify(wrongType));
  r.saveIdle(5);
  check('entry stored with the wrong type is replaced by a number entry', r.idle() === 5 && r.disk('idleTimeoutSec').type === 'number' && r.disk('idleTimeoutSec').value === 5);

  // 4. Bad input must be rejected with a clear message and change nothing (it used to reset to 60)
  ['', '   ', 'abc', 0, -3, 4, null, true].forEach((bad) => {
    r = makeRig(typedDefaults);
    r.saveIdle(5);
    const before = r.broadcasts.length;
    r.saveIdle(bad);
    const expectedMsg = strings.ERR_IDLE_TIMEOUT.replace('%s', '5');
    check(`rejects ${JSON.stringify(bad)} with an error message, keeps 5`,
      r.lastToast().type === 'error' && r.lastToast().msg === expectedMsg && r.idle() === 5 && r.disk('idleTimeoutSec').value === 5 && r.broadcasts.length === before);
  });
  r = makeRig(typedDefaults);
  r.saveIdle('5.4');
  check('"5.4" is rounded to 5 seconds', r.idle() === 5);
  r.saveIdle(120);
  check('large values are fine (120)', r.idle() === 120);

  // 5. Unwritable config file: never say "saved" when the file does not hold the value
  r = makeRig(typedDefaults, { readOnly: true });
  r.saveIdle(5);
  let onDisk;
  try { onDisk = r.disk('idleTimeoutSec').value; } catch (e) { onDisk = 'unreadable'; }
  const toast = r.lastToast();
  check('success message only when the file really holds the value', toast.type === 'success' ? onDisk === 5 : (toast.type === 'error' && onDisk !== 5));
  console.log('  (read-only config file on this OS -> ' + toast.type + ' message; file holds ' + onDisk + ')');
  if (toast.type === 'error') {
    check('write failure is reported with the file path and reason', toast.msg.includes(r.file) && /could not save/i.test(toast.msg));
    check('write failure is recorded for /api/debug', r.plugin.getDebugDiagnostics().configFile.lastSave.ok === false);
  }

  // 6. A corrupt config file at start (e.g. power cut while writing) must not block saving
  r = makeRig('{"displayMode": {"type":"string","val');
  check('corrupt file at start falls back to the default 60', r.idle() === 60);
  r.saveIdle(5);
  check('saving 5 after a corrupt start works and is on disk', r.idle() === 5 && r.disk('idleTimeoutSec').value === 5);

  // 7. In-app (POST /api/config) path: same checks, and reports failure
  r = makeRig(typedDefaults);
  let applied = r.plugin.applyApiUpdate({ idleTimeoutSec: 7 });
  check('in-app save of 7 is on disk and reported ok', applied.save.ok === true && r.disk('idleTimeoutSec').value === 7 && applied.settings.idleTimeoutSec === 7);
  applied = r.plugin.applyApiUpdate({ idleTimeoutSec: 'abc' });
  check('in-app invalid wait time is ignored (keeps 7)', applied.settings.idleTimeoutSec === 7);

  // 8. Diagnostics for GET /api/debug
  r = makeRig(typedDefaults);
  r.saveIdle(5);
  const diag = r.plugin.getDebugDiagnostics().configFile;
  check('/api/debug shows the config file, memory value and disk value', diag.file === r.file && diag.exists && diag.validJson && diag.idleTimeoutSecInMemory === 5 && diag.idleTimeoutSecOnDisk === 5);
  check('/api/debug shows the last save', diag.lastSave && diag.lastSave.ok === true && diag.lastSave.source === 'configSaveScreensaver' && diag.lastSave.changes.idleTimeoutSec === 5);

  // 9. Every save entry point is named in the log/lastSave
  const names = ['configSaveDisplay', 'configSaveScreensaver', 'configSaveClock', 'configSaveRadio'];
  r = makeRig(typedDefaults);
  r.plugin.configSaveDisplay({ displayMode: { value: 'full_ui', label: 'x' } });
  check('configSaveDisplay is recorded', r.plugin.lastSave.source === 'configSaveDisplay');
  r.plugin.configSaveClock({ selectedClock: { value: 'digital/index.html', label: 'x' } });
  check('configSaveClock is recorded', r.plugin.lastSave.source === 'configSaveClock');
  r.plugin.configSaveRadio({ radio2Name: 'Test FM', radio2Url: 'http://example.invalid/x' });
  check('configSaveRadio is recorded and saved', r.plugin.lastSave.source === 'configSaveRadio' && r.disk('radio2Name').value === 'Test FM');
  check('all four configSave* handlers exist', names.every((n) => typeof r.plugin[n] === 'function'));
}

(async () => {
  const ui = await getUI();
  const titles = ui.sections.map((s) => s.label);
  console.log('  Sections: ' + titles.join(' | '));
  check('no section/field label contains "Setting N"', !JSON.stringify(ui).match(/Setting \d/));
  check('no TRANSLATE. left after translation', !JSON.stringify(ui).includes('TRANSLATE.'));

  // Volumio rules: unique ids, visibleIf targets a field in the same section, select values match an option
  const ids = ui.sections.flatMap((s) => s.content.map((c) => c.id));
  check('field ids unique', new Set(ids).size === ids.length);
  ui.sections.forEach((s) => {
    const local = s.content.map((c) => c.id);
    s.content.forEach((c) => {
      if (c.visibleIf) check(`visibleIf of ${c.id} is in same section`, local.includes(c.visibleIf.field));
      if (c.element === 'select') check(`${c.id} value is one of its options`, c.options.some((o) => o.value === c.value.value));
    });
    if (s.saveButton) {
      check(`${s.id} onSave method is callable on plugin`, typeof p[s.onSave.method] === 'function', s.onSave.method);
      check(`${s.id} endpoint matches user_interface/core_zone_display`, s.onSave.endpoint === 'user_interface/core_zone_display');
    }
  });
  check('endpoint matches package name', require(path.join(root, 'package.json')).name === 'core_zone_display');
  check('clock list scanned from submodule', field(ui, 'selectedClock').options.length >= 3, field(ui, 'selectedClock').options.map((o) => o.value).join(', '));

  // Simulate the user saving each section by calling its declared onSave.method directly
  const send = (sectionId, values) => {
    const s = ui.sections.find((x) => x.id === sectionId);
    const data = {};
    s.saveButton.data.forEach((id) => { data[id] = values[id] !== undefined ? values[id] : field(ui, id).value; });
    const method = s.onSave.method;
    return p[method](data);
  };

  send('section_display', { displayMode: { value: 'full_ui', label: 'Player Menu + Clock When Idle' } });
  send('section_screensaver', {
    screensaverEnabled: { value: true },
    preventScreensaverWhilePlaying: { value: false },
    idleTimeoutSec: '25'
  });
  send('section_clock', { selectedClock: { value: 'digital/index.html', label: 'digital/index.html' } });
  send('section_radio', { radio3Name: 'My Station', radio3Url: 'http://example.invalid/stream' });

  const ui2 = await getUI();
  check('display mode persisted', field(ui2, 'displayMode').value.value === 'full_ui', JSON.stringify(field(ui2, 'displayMode').value));
  check('idle settings persisted', field(ui2, 'idleTimeoutSec').value === 25 && field(ui2, 'preventScreensaverWhilePlaying').value === false && field(ui2, 'screensaverEnabled').value === true);
  check('clock persisted', field(ui2, 'selectedClock').value.value === 'digital/index.html');
  check('radio persisted, others kept', field(ui2, 'radio3Name').value === 'My Station' && field(ui2, 'radio1Name').value === 'Kan 88');
  check('every save showed a success toast', toasts.length === 4 && toasts.every((t) => t.startsWith('success')));

  // Check broadcasts: both pushCoreZoneDisplaySettings AND pushUiConfig
  const coreBroadcasts = broadcasts.filter((b) => b.m === 'pushCoreZoneDisplaySettings');
  const uiConfigBroadcasts = broadcasts.filter((b) => b.m === 'pushUiConfig');
  check('every save broadcast to screens (pushCoreZoneDisplaySettings)', coreBroadcasts.length === 4);
  check('every save pushed updated UIConfig to Volumio UI (pushUiConfig)', uiConfigBroadcasts.length === 4);

  const last = coreBroadcasts[coreBroadcasts.length - 1].d;
  check('broadcast carries current settings', last.displayMode === 'full_ui' && last.idleTimeoutSec === 25 && last.radioStations[2].name === 'My Station');

  // Same values must be what the display gets from GET /api/config
  const apiCfg = p.getCurrentSettings();
  check('/api/config matches Volumio page', apiCfg.selectedClock === 'digital/index.html' && apiCfg.preventScreensaverWhilePlaying === false);

  // In-app save path also flushes to disk immediately and keeps other fields
  p.updateConfigFromApi({ idleTimeoutSec: 40 });
  check('in-app partial save keeps others', p.getCurrentSettings().displayMode === 'full_ui' && p.getCurrentSettings().idleTimeoutSec === 40);

  // Check immediate disk persistence without waiting for timer
  const onDisk = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  check('config written immediately to disk', onDisk.displayMode && onDisk.displayMode.value === 'full_ui', 'idleTimeoutSec on disk = ' + (onDisk.idleTimeoutSec && onDisk.idleTimeoutSec.value));

  robustnessChecks();
})().catch((e) => { console.error('ERROR', e); fails++; }).finally(() => {
  console.log('\n' + (fails ? fails + ' FAILED' : 'ALL PASSED'));
  process.exitCode = fails ? 1 : 0;
  [tmp].concat(extraDirs).forEach((dir) => {
    try { fs.chmodSync(path.join(dir, 'config.json'), 0o666); } catch (e) {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  });
  process.exit(process.exitCode);
});
