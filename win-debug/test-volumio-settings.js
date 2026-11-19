// Simulated Volumio settings test for CoreZoneDisplay (no Volumio needed).
// Flow: i18nJson translation -> getUIConfig -> save each section like Volumio does
// -> getUIConfig again -> check config on disk, broadcast and /api/config values.
// Works on a temp copy of config.json. Usage (from repo root): node win-debug/test-volumio-settings.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const root = path.resolve(__dirname, '..');
const libQ = require(path.join(root, 'node_modules', 'kew'));
const Plugin = require(path.join(root, 'index.js'));

let fails = 0;
const check = (name, ok, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };

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
const router = {
  pluginManager: { getConfigurationFile: () => cfgFile },
  pushToastMessage: (t, a, b) => toasts.push(t + ':' + b),
  broadcastMessage: (m, d) => broadcasts.push({ m, d }),
  sharedVars: { get: () => 'en' },
  i18nJson
};
const p = new Plugin({ coreCommand: router, logger: { info() {}, error: console.error, warn() {} } });
p.onVolumioStart && p.onVolumioStart();

const getUI = () => new Promise((res, rej) => p.getUIConfig().then(res).fail(rej));
const field = (ui, id) => ui.sections.flatMap((s) => s.content).find((c) => c.id === id);

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
    if (s.saveButton) check(`${s.id} has onSave -> saveSettings`, s.onSave && s.onSave.method === 'saveSettings' && s.onSave.endpoint === 'user_interface/core_zone_display');
  });
  check('endpoint matches package name', require(path.join(root, 'package.json')).name === 'core_zone_display');
  check('clock list scanned from submodule', field(ui, 'selectedClock').options.length >= 3, field(ui, 'selectedClock').options.map((o) => o.value).join(', '));

  // Simulate the user saving each section exactly as Volumio sends it (only saveButton.data fields)
  const send = (sectionId, values) => {
    const s = ui.sections.find((x) => x.id === sectionId);
    const data = {};
    s.saveButton.data.forEach((id) => { data[id] = values[id] !== undefined ? values[id] : field(ui, id).value; });
    return p.saveSettings(data);
  };
  send('section_display', { displayMode: { value: 'full_ui', label: 'Player Menu + Clock When Idle' } });
  send('section_screensaver', { screensaverEnabled: true, preventScreensaverWhilePlaying: false, idleTimeoutSec: '25' });
  send('section_clock', { selectedClock: { value: 'digital/index.html', label: 'digital/index.html' } });
  send('section_radio', { radio3Name: 'My Station', radio3Url: 'http://example.invalid/stream' });

  const ui2 = await getUI();
  check('display mode persisted', field(ui2, 'displayMode').value.value === 'full_ui', JSON.stringify(field(ui2, 'displayMode').value));
  check('idle settings persisted', field(ui2, 'idleTimeoutSec').value === 25 && field(ui2, 'preventScreensaverWhilePlaying').value === false && field(ui2, 'screensaverEnabled').value === true);
  check('clock persisted', field(ui2, 'selectedClock').value.value === 'digital/index.html');
  check('radio persisted, others kept', field(ui2, 'radio3Name').value === 'My Station' && field(ui2, 'radio1Name').value === 'Kan 88');
  check('every save showed a success toast', toasts.length === 4 && toasts.every((t) => t.startsWith('success')));
  check('every save broadcast to screens', broadcasts.length === 4 && broadcasts.every((b) => b.m === 'pushCoreZoneDisplaySettings'));
  const last = broadcasts[broadcasts.length - 1].d;
  check('broadcast carries current settings', last.displayMode === 'full_ui' && last.idleTimeoutSec === 25 && last.radioStations[2].name === 'My Station');

  // Same values must be what the display gets from GET /api/config
  const apiCfg = p.getCurrentSettings();
  check('/api/config matches Volumio page', apiCfg.selectedClock === 'digital/index.html' && apiCfg.preventScreensaverWhilePlaying === false);

  // In-app save path also broadcasts and keeps other fields
  p.updateConfigFromApi({ idleTimeoutSec: 40 });
  check('in-app partial save keeps others', p.getCurrentSettings().displayMode === 'full_ui' && p.getCurrentSettings().idleTimeoutSec === 40);

  await new Promise((r) => setTimeout(r, 1500)); // let v-conf flush to disk
  const onDisk = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  check('config written to disk', onDisk.displayMode && onDisk.displayMode.value === 'full_ui', 'idleTimeoutSec on disk = ' + (onDisk.idleTimeoutSec && onDisk.idleTimeoutSec.value));
})().catch((e) => { console.error('ERROR', e); fails++; }).finally(() => {
  console.log('\n' + (fails ? fails + ' FAILED' : 'ALL PASSED'));
  process.exitCode = fails ? 1 : 0;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(process.exitCode);
});
