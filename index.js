'use strict';

var libQ = require('kew');
var express = require('express');
var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');
var urlModule = require('url');
var childProcess = require('child_process');
var util = require('util');

var EXPRESS_PORT = 4004;

function getLocalIpAddress() {
  try {
    var ifaces = require('os').networkInterfaces();
    for (var name in ifaces) {
      var list = ifaces[name] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].family === 'IPv4' || list[i].family === 4) {
          if (!list[i].internal) {
            return list[i].address;
          }
        }
      }
    }
  } catch (e) {}
  return 'localhost';
}
var DEFAULT_DISPLAY_MODE = 'screensaver_only';
var DEFAULT_CLOCK_FILE = 'MainClockSelector.html';
var DEFAULT_IDLE_TIMEOUT_SEC = 60;
var MIN_IDLE_TIMEOUT_SEC = 5;
var DEFAULT_SCREENSAVER_ENABLED = true;

var DISPLAY_MODE_LABELS = {
  screensaver_only: 'Clock Only',
  full_ui: 'Player Menu + Clock When Idle'
};

var DEFAULT_RADIO_PRESETS = [
  {
    name: 'Kan 88',
    url: 'https://27783.live.streamtheworld.com/KAN_88.mp3'
  },
  {
    name: 'Galgalatz',
    url: 'https://glzwizzlv.bynetcdn.com/glglz_mp3'
  },
  {
    name: 'Eco 99 FM',
    url: 'https://eco01.mediacast.co.il/ecolive/99fm_aac/icecast.audio'
  },
  {
    name: 'Radio Paradise',
    url: 'http://stream.radioparadise.com/aac-320'
  },
  {
    name: 'SomaFM Groove Salad',
    url: 'https://ice1.somafm.com/groovesalad-256-mp3'
  }
];

/**
 * Resolves Volumio's built-in v-conf module reliably whether installed in
 * plugin node_modules, /volumio/node_modules/v-conf, or standalone fallback.
 */
function createVConf() {
  try {
    return new (require('v-conf'))();
  } catch (e1) {
    try {
      return new (require('/volumio/node_modules/v-conf'))();
    } catch (e2) {
      // Built-in v-conf compatible JSON store fallback so plugin never crashes if v-conf isn't in local node_modules
      return {
        _filePath: null,
        _data: {},
        loadFile: function (filePath) {
          this._filePath = filePath;
          try {
            if (fs.existsSync(filePath)) {
              this._data = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
            }
          } catch (err) {
            this._data = {};
          }
        },
        save: function () {
          if (this._filePath && this._data) {
            try {
              var dir = path.dirname(this._filePath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              fs.writeFileSync(this._filePath, JSON.stringify(this._data, null, 2), 'utf8');
            } catch (err) {
              // Ignore write error
            }
          }
        },
        get: function (key) {
          if (this._data && this._data[key] !== undefined) {
            return this._data[key].value !== undefined ? this._data[key].value : this._data[key];
          }
          return undefined;
        },
        set: function (key, val) {
          var valType = typeof val;
          if (!this._data) {
            this._data = {};
          }
          this._data[key] = {
            type: valType === 'boolean' || valType === 'number' ? valType : 'string',
            value: val
          };
          if (this._filePath) {
            try {
              var dir = path.dirname(this._filePath);
              if (fs.existsSync(dir)) {
                fs.writeFileSync(this._filePath, JSON.stringify(this._data, null, 2), 'utf8');
              }
            } catch (err) {
              // Ignore write error
            }
          }
        }
      };
    }
  }
}

/**
 * Unwraps Volumio select objects { value: ..., label: ... } and returns raw key-value mapping.
 * Matches volumio-now-playing's parseConfigSaveData pattern.
 */
function parseConfigSaveData(data) {
  var apply = {};
  if (!data || typeof data !== 'object') {
    return apply;
  }
  for (var key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      var val = data[key];
      if (val !== null && typeof val === 'object' && val.value !== undefined) {
        apply[key] = val.value;
      } else {
        apply[key] = val;
      }
    }
  }
  return apply;
}

/**
 * Robust boolean parser handling true/false, "true"/"false", { value: boolean }, 1/0
 */
function parseBoolean(val, fallback) {
  if (val === undefined || val === null) {
    return fallback !== undefined ? fallback : false;
  }
  if (typeof val === 'object' && val !== null && val.value !== undefined) {
    val = val.value;
  }
  if (typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'string') {
    var lower = val.trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on') {
      return true;
    }
    if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'off') {
      return false;
    }
  }
  if (typeof val === 'number') {
    return val !== 0;
  }
  return Boolean(val);
}

/**
 * Raw key/value store behind v-conf. Real v-conf keeps it in .data, the built-in
 * stand-in (see createVConf) keeps it in ._data.
 */
function getConfigStore(config) {
  if (!config) {
    return null;
  }
  return config.data || config._data || null;
}

/**
 * v-conf stores every setting as { type: 'number', value: 5 }. Anything else (for example a
 * plain 60 written by hand or by an older version) is silently ignored by v-conf's set().
 */
function isTypedEntry(entry) {
  return Boolean(
    entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      typeof entry.type === 'string' &&
      entry.value !== undefined
  );
}

/**
 * Plain value of a stored entry, whatever shape it has.
 */
function entryValue(entry) {
  return entry && typeof entry === 'object' && entry.value !== undefined ? entry.value : entry;
}

/**
 * Whole seconds (at least MIN_IDLE_TIMEOUT_SEC) from whatever Volumio's number box sent,
 * or null when the input cannot be used (empty, text, too small).
 */
function parseIdleTimeoutSec(raw) {
  if (raw === undefined || raw === null || typeof raw === 'boolean') {
    return null;
  }
  if (typeof raw === 'string' && !raw.trim()) {
    return null;
  }
  var seconds = Math.round(Number(raw));
  return isFinite(seconds) && seconds >= MIN_IDLE_TIMEOUT_SEC ? seconds : null;
}

function CoreZoneDisplay(context) {
  var self = this;

  self.context = context || {};
  self.commandRouter = self.context.coreCommand || null;
  self.logger = self.context.logger || console;
  self.configManager = self.context.configManager || null;
  self.config = null;
  self.configFilePath = null;
  self.app = null;
  self.server = null;
}

/**
 * Helper to resolve config.json file path via Volumio's pluginManager or local directory
 */
CoreZoneDisplay.prototype.getConfigurationFile = function (fileName) {
  var self = this;
  var targetFile = fileName || 'config.json';

  if (
    self.commandRouter &&
    self.commandRouter.pluginManager &&
    typeof self.commandRouter.pluginManager.getConfigurationFile === 'function'
  ) {
    try {
      return self.commandRouter.pluginManager.getConfigurationFile(self.context, targetFile);
    } catch (err) {
      self.logError('CoreZoneDisplay: pluginManager.getConfigurationFile error: ' + err.message);
    }
  }

  return path.join(__dirname, targetFile);
};

/**
 * Volumio lifecycle: triggered when Volumio starts.
 * Initializes this.config = new (require('v-conf'))() and loads config.json.
 */
CoreZoneDisplay.prototype.onVolumioStart = function () {
  var self = this;
  var configFile = self.getConfigurationFile('config.json');
  var defaultConfigFile = path.join(__dirname, 'config.json');

  // If Volumio's /data/configuration/.../config.json does not exist yet, seed it from plugin's config.json
  try {
    var targetDir = path.dirname(configFile);
    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch (mkdirErr) {
        self.logError('CoreZoneDisplay: Failed to create target dir ' + targetDir + ': ' + mkdirErr.message);
      }
    }

    if (!fs.existsSync(configFile) && fs.existsSync(defaultConfigFile)) {
      try {
        fs.copyFileSync(defaultConfigFile, configFile);
      } catch (cpErr) {
        self.logError('CoreZoneDisplay: Failed to seed config.json: ' + cpErr.message);
      }
    }
  } catch (err) {
    self.logError('CoreZoneDisplay: onVolumioStart config resolution error: ' + err.message);
  }

  // If configFile still does not exist on disk, fall back to defaultConfigFile
  if (!fs.existsSync(configFile) && fs.existsSync(defaultConfigFile)) {
    configFile = defaultConfigFile;
  }

  self.configFilePath = configFile;
  self.config = createVConf();
  self.config.loadFile(configFile);

  // Backfill any missing default keys into self.config
  self.backfillDefaultConfig();

  self.logInfo('CoreZoneDisplay: onVolumioStart loaded config from ' + configFile);

  return libQ.resolve();
};

/**
 * Backfills any missing default keys into self.config so upgrades or fresh installs
 * always have all settings populated and available.
 */
CoreZoneDisplay.prototype.backfillDefaultConfig = function () {
  var self = this;
  if (!self.config) {
    return;
  }
  var changed = false;

  if (self.config.get('displayMode') === undefined) {
    self.config.set('displayMode', DEFAULT_DISPLAY_MODE);
    changed = true;
  }
  if (self.config.get('screensaverEnabled') === undefined) {
    self.config.set('screensaverEnabled', DEFAULT_SCREENSAVER_ENABLED);
    changed = true;
  }
  if (self.config.get('preventScreensaverWhilePlaying') === undefined) {
    self.config.set('preventScreensaverWhilePlaying', true);
    changed = true;
  }
  if (self.config.get('idleTimeoutSec') === undefined) {
    self.config.set('idleTimeoutSec', DEFAULT_IDLE_TIMEOUT_SEC);
    changed = true;
  }
  if (self.config.get('selectedClock') === undefined) {
    self.config.set('selectedClock', DEFAULT_CLOCK_FILE);
    changed = true;
  }
  for (var i = 1; i <= 5; i++) {
    var defPreset = DEFAULT_RADIO_PRESETS[i - 1];
    if (self.config.get('radio' + i + 'Name') === undefined) {
      self.config.set('radio' + i + 'Name', defPreset.name);
      changed = true;
    }
    if (self.config.get('radio' + i + 'Url') === undefined) {
      self.config.set('radio' + i + 'Url', defPreset.url);
      changed = true;
    }
  }

  if (changed && typeof self.config.save === 'function') {
    try {
      self.config.save();
    } catch (e) {}
  }
};

/**
 * Volumio configuration files declaration
 */
CoreZoneDisplay.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

/**
 * Ensures self.config is initialized even if onStart or getUIConfig is called directly
 */
CoreZoneDisplay.prototype.ensureConfigLoaded = function () {
  var self = this;
  if (!self.config) {
    self.onVolumioStart();
  }
};

/**
 * Returns the resolved submodule/clocks directory path
 */
CoreZoneDisplay.prototype.getClocksDir = function () {
  return path.join(__dirname, 'submodule', 'clocks');
};

/**
 * Scans submodule/clocks for .html files, ensuring MainClockSelector.html
 * is always listed and set as default.
 */
CoreZoneDisplay.prototype.getAvailableClocks = function () {
  var self = this;
  var clocksDir = self.getClocksDir();
  var clockFiles = [DEFAULT_CLOCK_FILE];

  try {
    if (fs.existsSync(clocksDir)) {
      var entries = fs.readdirSync(clocksDir);
      entries.forEach(function (entry) {
        if (
          typeof entry === 'string' &&
          entry.toLowerCase().endsWith('.html') &&
          clockFiles.indexOf(entry) === -1
        ) {
          clockFiles.push(entry);
        }
      });

      ['CASIO/index.html', 'digital/index.html'].forEach(function (subClock) {
        if (
          fs.existsSync(path.join(clocksDir, subClock)) &&
          clockFiles.indexOf(subClock) === -1
        ) {
          clockFiles.push(subClock);
        }
      });
    }
  } catch (err) {
    self.logError('CoreZoneDisplay: Failed to scan submodule/clocks: ' + err.message);
  }

  return clockFiles;
};

/**
 * Reads current settings from v-conf with safe defaults
 */
CoreZoneDisplay.prototype.getCurrentSettings = function () {
  var self = this;
  self.ensureConfigLoaded();

  var rawMode = self.config.get('displayMode');
  var displayMode =
    rawMode === 'full_ui' || rawMode === 'screensaver_only'
      ? rawMode
      : DEFAULT_DISPLAY_MODE;

  var screensaverEnabled = self.config.get('screensaverEnabled');
  if (screensaverEnabled === undefined || screensaverEnabled === null) {
    screensaverEnabled = DEFAULT_SCREENSAVER_ENABLED;
  } else {
    screensaverEnabled = Boolean(screensaverEnabled);
  }

  var preventScreensaverWhilePlaying = self.config.get('preventScreensaverWhilePlaying');
  if (preventScreensaverWhilePlaying === undefined || preventScreensaverWhilePlaying === null) {
    preventScreensaverWhilePlaying = true;
  } else {
    preventScreensaverWhilePlaying = Boolean(preventScreensaverWhilePlaying);
  }

  var rawTimeout = self.config.get('idleTimeoutSec');
  var idleTimeoutSec = parseInt(rawTimeout, 10);
  if (isNaN(idleTimeoutSec) || idleTimeoutSec <= 0) {
    idleTimeoutSec = DEFAULT_IDLE_TIMEOUT_SEC;
  }

  var selectedClock = self.config.get('selectedClock');
  if (!selectedClock || typeof selectedClock !== 'string') {
    selectedClock = DEFAULT_CLOCK_FILE;
  }

  var radioStations = [];
  for (var i = 1; i <= 5; i++) {
    var defaultPreset = DEFAULT_RADIO_PRESETS[i - 1];
    var rawName = self.config.get('radio' + i + 'Name');
    var rawUrl = self.config.get('radio' + i + 'Url');

    var stationName =
      typeof rawName === 'string' && rawName.trim()
        ? rawName.trim()
        : defaultPreset.name;

    var stationUrl =
      typeof rawUrl === 'string' && rawUrl.trim()
        ? rawUrl.trim()
        : defaultPreset.url;

    radioStations.push({
      id: i,
      name: stationName,
      url: stationUrl,
      uri: stationUrl
    });
  }

  var podcastFeeds = [];
  var rawPodcasts = self.config.get('podcastFeedsJson');
  if (typeof rawPodcasts === 'string' && rawPodcasts.trim()) {
    try {
      var parsedFeeds = JSON.parse(rawPodcasts);
      if (Array.isArray(parsedFeeds)) {
        parsedFeeds.forEach(function (feed, idx) {
          if (feed && feed.name && feed.rssUrl) {
            podcastFeeds.push({
              id: idx + 1,
              name: String(feed.name).trim(),
              rssUrl: String(feed.rssUrl).trim()
            });
          }
        });
      }
    } catch (e) {
      // Ignore malformed JSON
    }
  }

  return {
    displayMode: displayMode,
    screensaverEnabled: screensaverEnabled,
    preventScreensaverWhilePlaying: preventScreensaverWhilePlaying,
    idleTimeoutSec: idleTimeoutSec,
    selectedClock: selectedClock,
    availableClocks: self.getAvailableClocks(),
    radioStations: radioStations,
    podcastFeeds: podcastFeeds
  };
};

/**
 * Volumio Settings UI builder: loads UIConfig.json via i18nJson,
 * binds current this.config values to the fields of every section,
 * populates selectedClock options, and resolves defer.resolve(uiconf).
 */
CoreZoneDisplay.prototype.getUIConfig = function () {
  var self = this;
  var defer = libQ.defer();

  self.ensureConfigLoaded();

  var lang_code = 'en';
  if (
    self.commandRouter &&
    self.commandRouter.sharedVars &&
    typeof self.commandRouter.sharedVars.get === 'function'
  ) {
    lang_code = self.commandRouter.sharedVars.get('language_code') || 'en';
  }

  var langFile = __dirname + '/i18n/strings_' + lang_code + '.json';
  var defaultLangFile = __dirname + '/i18n/strings_en.json';
  var uiConfigFile = __dirname + '/UIConfig.json';

  if (!fs.existsSync(langFile)) {
    langFile = defaultLangFile;
  }

  function findContentItem(contentArr, itemId) {
    if (!Array.isArray(contentArr)) {
      return null;
    }
    for (var i = 0; i < contentArr.length; i++) {
      if (contentArr[i] && contentArr[i].id === itemId) {
        return contentArr[i];
      }
    }
    return null;
  }

  function populateAndResolve(uiconf) {
    try {
      var settings = self.getCurrentSettings();
      var availableClocks = settings.availableClocks.slice();

      if (availableClocks.indexOf(settings.selectedClock) === -1) {
        availableClocks.push(settings.selectedClock);
      }

      // Fields are spread across several sections; flatten them for lookup
      var content = [];
      (uiconf.sections || []).forEach(function (section) {
        if (section && Array.isArray(section.content)) {
          content = content.concat(section.content);
        }
      });

      var modeLabel =
        DISPLAY_MODE_LABELS[settings.displayMode] ||
        DISPLAY_MODE_LABELS[DEFAULT_DISPLAY_MODE];

      var displayModeEl = findContentItem(content, 'displayMode');
      if (displayModeEl) {
        displayModeEl.value = {
          value: settings.displayMode,
          label: modeLabel
        };
      }

      var ssEnabledEl = findContentItem(content, 'screensaverEnabled');
      if (ssEnabledEl) {
        ssEnabledEl.value = Boolean(settings.screensaverEnabled);
      }

      var preventEl = findContentItem(content, 'preventScreensaverWhilePlaying');
      if (preventEl) {
        preventEl.value = Boolean(settings.preventScreensaverWhilePlaying);
      }

      var timeoutEl = findContentItem(content, 'idleTimeoutSec');
      if (timeoutEl) {
        timeoutEl.value = Number(settings.idleTimeoutSec);
      }

      var clockEl = findContentItem(content, 'selectedClock');
      if (clockEl) {
        clockEl.options = availableClocks.map(function (clockName) {
          return {
            value: clockName,
            label: clockName
          };
        });
        clockEl.value = {
          value: settings.selectedClock,
          label: settings.selectedClock
        };
      }

      for (var r = 1; r <= 5; r++) {
        var presetObj = settings.radioStations[r - 1] || DEFAULT_RADIO_PRESETS[r - 1];
        var rNameEl = findContentItem(content, 'radio' + r + 'Name');
        var rUrlEl = findContentItem(content, 'radio' + r + 'Url');
        if (rNameEl) {
          rNameEl.value = presetObj.name;
        }
        if (rUrlEl) {
          rUrlEl.value = presetObj.url;
        }
      }

      // Show real, clickable addresses for this device
      var hostForLinks = getLocalIpAddress();
      var displayUrlEl = findContentItem(content, 'displayUrl');
      if (displayUrlEl) {
        displayUrlEl.value = 'http://' + hostForLinks + ':' + EXPRESS_PORT;
      }
      var clockSettingsUrlEl = findContentItem(content, 'clockSettingsUrl');
      if (clockSettingsUrlEl) {
        clockSettingsUrlEl.value =
          'http://' + hostForLinks + ':' + EXPRESS_PORT + '/clocks/digital/settings.html';
      }

      defer.resolve(uiconf);
    } catch (err) {
      self.logError('CoreZoneDisplay: Error populating UIConfig: ' + err.message);
      defer.reject(new Error());
    }
  }

  if (self.commandRouter && typeof self.commandRouter.i18nJson === 'function') {
    self.commandRouter
      .i18nJson(langFile, defaultLangFile, uiConfigFile)
      .then(function (uiconf) {
        populateAndResolve(uiconf);
      })
      .fail(function (err) {
        self.logError('CoreZoneDisplay: i18nJson error, using fallback parser: ' + err);
        try {
          var rawUi = JSON.parse(fs.readFileSync(uiConfigFile, 'utf8'));
          populateAndResolve(rawUi);
        } catch (e) {
          defer.reject(new Error());
        }
      });
  } else {
    try {
      var rawUiConf = JSON.parse(fs.readFileSync(uiConfigFile, 'utf8'));
      populateAndResolve(rawUiConf);
    } catch (e) {
      defer.reject(new Error());
    }
  }

  return defer.promise;
};

/**
 * Looks up a text in i18n/strings_<language>.json, falling back to English and then to the
 * key itself (same approach as volumio-now-playing). Extra arguments fill %s placeholders.
 */
CoreZoneDisplay.prototype.getText = function (key) {
  var self = this;
  var values = Array.prototype.slice.call(arguments, 1);
  var i18nDir = path.join(__dirname, 'i18n');
  var defaults = {};
  var strings = {};

  try {
    defaults = JSON.parse(fs.readFileSync(path.join(i18nDir, 'strings_en.json'), 'utf8'));
  } catch (err) {
    defaults = {};
  }

  try {
    var lang = null;
    if (
      self.commandRouter &&
      self.commandRouter.sharedVars &&
      typeof self.commandRouter.sharedVars.get === 'function'
    ) {
      lang = self.commandRouter.sharedVars.get('language_code');
    }
    lang = String(lang || 'en').replace(/[^A-Za-z_-]/g, '');
    if (lang && lang !== 'en') {
      strings = JSON.parse(fs.readFileSync(path.join(i18nDir, 'strings_' + lang + '.json'), 'utf8'));
    }
  } catch (err) {
    strings = {};
  }

  var text = strings[key] || defaults[key] || key;
  return values.length ? util.format.apply(util, [text].concat(values)) : text;
};

/**
 * Shows a toast message in Volumio's UI.
 */
CoreZoneDisplay.prototype.toast = function (type, message) {
  var self = this;
  try {
    if (self.commandRouter && typeof self.commandRouter.pushToastMessage === 'function') {
      self.commandRouter.pushToastMessage(type, 'CoreZoneDisplay', message);
    }
  } catch (err) {
    self.logError('CoreZoneDisplay: toast error: ' + err.message);
  }
};

/**
 * Stores one value in the plugin config and makes sure it really sticks.
 * v-conf quietly ignores set() when the stored entry is not shaped like { type, value } and
 * throws when the stored type does not fit, so such an entry is replaced first.
 */
CoreZoneDisplay.prototype.setConfigValue = function (key, value) {
  var self = this;
  var type = typeof value === 'number' || typeof value === 'boolean' ? typeof value : 'string';
  var store = getConfigStore(self.config);

  if (
    store &&
    store[key] !== undefined &&
    (!isTypedEntry(store[key]) || store[key].type !== type)
  ) {
    self.logInfo(
      'CoreZoneDisplay: repairing stored setting "' + key + '" (was ' + JSON.stringify(store[key]) + ')'
    );
    store[key] = { type: type, value: value };
  }

  self.config.set(key, value);
};

/**
 * Reads config.json back from disk and checks it holds the expected values.
 * expected: { key: value }. Returns { ok, error }.
 */
CoreZoneDisplay.prototype.verifyConfigOnDisk = function (expected) {
  var self = this;
  var file = self.configFilePath;
  var onDisk;

  try {
    onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ok: false, error: 'cannot read ' + file + ' (' + err.message + ')' };
  }
  if (!onDisk || typeof onDisk !== 'object') {
    return { ok: false, error: file + ' does not contain a settings object' };
  }

  var wrong = Object.keys(expected || {}).filter(function (key) {
    return String(entryValue(onDisk[key])) !== String(expected[key]);
  });
  return wrong.length
    ? { ok: false, error: 'the file does not contain the new value of ' + wrong.join(', ') }
    : { ok: true };
};

/**
 * Writes the config to disk and verifies the result.
 * v-conf's own save() only prints write errors to the console, so the file is read back;
 * if it is not right the file is written directly, which also reveals the real error.
 * Returns { ok, file, error }.
 */
CoreZoneDisplay.prototype.persistConfig = function (expected) {
  var self = this;
  var file = self.configFilePath;

  try {
    if (typeof self.config.save === 'function') {
      self.config.save();
    }
  } catch (err) {
    self.logError('CoreZoneDisplay: config.save() error: ' + err.message);
  }

  var result = self.verifyConfigOnDisk(expected);

  if (!result.ok) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(getConfigStore(self.config) || {}, null, 2), 'utf8');
    } catch (err) {
      return { ok: false, file: file, error: err.message };
    }
    result = self.verifyConfigOnDisk(expected);
  }

  return { ok: result.ok, file: file, error: result.ok ? null : result.error };
};

/**
 * Saves settings sent by one of Volumio's section Save buttons (see the configSave* methods).
 * - Only the settings present in the request change (each section sends only its own fields).
 * - Invalid input is rejected with an error message and nothing is changed.
 * - The result is checked on disk, so "Settings saved" is only shown when it really is saved.
 */
CoreZoneDisplay.prototype.saveSettings = function (data, source) {
  var self = this;
  self.ensureConfigLoaded();
  source = source || 'saveSettings';
  self.logInfo('CoreZoneDisplay: ' + source + ' received ' + JSON.stringify(data || {}));

  var cleanData = parseConfigSaveData(data || {});
  var changes = {};

  if (cleanData.displayMode !== undefined) {
    changes.displayMode =
      cleanData.displayMode === 'full_ui' || cleanData.displayMode === 'screensaver_only'
        ? cleanData.displayMode
        : DEFAULT_DISPLAY_MODE;
  }

  if (cleanData.screensaverEnabled !== undefined) {
    changes.screensaverEnabled = parseBoolean(
      cleanData.screensaverEnabled,
      DEFAULT_SCREENSAVER_ENABLED
    );
  }

  if (cleanData.preventScreensaverWhilePlaying !== undefined) {
    changes.preventScreensaverWhilePlaying = parseBoolean(
      cleanData.preventScreensaverWhilePlaying,
      true
    );
  }

  if (cleanData.idleTimeoutSec !== undefined) {
    var idleTimeoutSec = parseIdleTimeoutSec(cleanData.idleTimeoutSec);
    if (idleTimeoutSec === null) {
      self.logError(
        'CoreZoneDisplay: ' + source + ' rejected wait time ' + JSON.stringify(cleanData.idleTimeoutSec)
      );
      self.toast('error', self.getText('ERR_IDLE_TIMEOUT', MIN_IDLE_TIMEOUT_SEC));
      return libQ.resolve();
    }
    changes.idleTimeoutSec = idleTimeoutSec;
  }

  if (cleanData.selectedClock !== undefined) {
    changes.selectedClock =
      typeof cleanData.selectedClock === 'string' && cleanData.selectedClock.trim()
        ? cleanData.selectedClock.trim()
        : DEFAULT_CLOCK_FILE;
  }

  for (var i = 1; i <= 5; i++) {
    var defPreset = DEFAULT_RADIO_PRESETS[i - 1];
    if (cleanData['radio' + i + 'Name'] !== undefined) {
      changes['radio' + i + 'Name'] =
        String(cleanData['radio' + i + 'Name'] || '').trim() || defPreset.name;
    }
    if (cleanData['radio' + i + 'Url'] !== undefined) {
      changes['radio' + i + 'Url'] =
        String(cleanData['radio' + i + 'Url'] || '').trim() || defPreset.url;
    }
  }

  Object.keys(changes).forEach(function (key) {
    self.setConfigValue(key, changes[key]);
  });

  var result = self.persistConfig(changes);
  self.lastSave = {
    at: new Date().toISOString(),
    source: source,
    ok: result.ok,
    error: result.error,
    changes: changes
  };

  if (result.ok) {
    self.logInfo(
      'CoreZoneDisplay: ' + source + ' saved to ' + result.file + ' -> ' + JSON.stringify(changes)
    );
    self.toast('success', self.getText('SETTINGS_SAVED'));
  } else {
    self.logError(
      'CoreZoneDisplay: ' + source + ' could NOT save to ' + result.file + ': ' + result.error
    );
    self.toast('error', self.getText('ERR_SAVE_FAILED', result.file, result.error));
  }

  // Broadcast settings to active player screens
  self.notifySettingsChanged();

  // Push updated UIConfig back to Volumio UI so the form shows the stored values
  self.refreshUIConfig();

  return libQ.resolve();
};

/**
 * Section-specific save handlers called by Volumio's section Save buttons
 * (Matches volumio-now-playing's configSave* architecture)
 */
CoreZoneDisplay.prototype.configSaveDisplay = function (data) {
  return this.saveSettings(data, 'configSaveDisplay');
};

CoreZoneDisplay.prototype.configSaveScreensaver = function (data) {
  return this.saveSettings(data, 'configSaveScreensaver');
};

CoreZoneDisplay.prototype.configSaveClock = function (data) {
  return this.saveSettings(data, 'configSaveClock');
};

CoreZoneDisplay.prototype.configSaveRadio = function (data) {
  return this.saveSettings(data, 'configSaveRadio');
};

/**
 * Refreshes UIConfig on Volumio's admin UI by pushing pushUiConfig
 * Matches volumio-now-playing's refreshUIConfig implementation.
 */
CoreZoneDisplay.prototype.refreshUIConfig = function () {
  var self = this;
  try {
    if (
      self.commandRouter &&
      typeof self.commandRouter.getUIConfigOnPlugin === 'function' &&
      typeof self.commandRouter.broadcastMessage === 'function'
    ) {
      self.commandRouter
        .getUIConfigOnPlugin('user_interface', 'core_zone_display', {})
        .then(function (config) {
          self.commandRouter.broadcastMessage('pushUiConfig', config);
        })
        .fail(function (err) {
          self.logError('CoreZoneDisplay: refreshUIConfig failed: ' + err);
        });
    }
  } catch (err) {
    self.logError('CoreZoneDisplay: refreshUIConfig error: ' + err.message);
  }
};

/**
 * Pushes the current settings to every open screen over Volumio's socket
 * (same approach as volumio-now-playing's 'nowPlayingPushSettings'), so changes
 * apply immediately without reloading the display. Screens that are not
 * connected to the socket pick the change up by polling GET /api/config.
 */
CoreZoneDisplay.prototype.notifySettingsChanged = function () {
  var self = this;
  try {
    if (self.commandRouter && typeof self.commandRouter.broadcastMessage === 'function') {
      self.commandRouter.broadcastMessage('pushCoreZoneDisplaySettings', self.getCurrentSettings());
    }
  } catch (err) {
    self.logError('CoreZoneDisplay: broadcast settings error: ' + err.message);
  }
};

/**
 * Applies a settings update coming from POST /api/config (in-app Settings).
 * Returns { settings, save } where save tells whether the change reached the disk.
 */
CoreZoneDisplay.prototype.applyApiUpdate = function (payload) {
  var self = this;
  self.ensureConfigLoaded();

  var save = { ok: true, file: self.configFilePath, error: null };

  if (!payload || typeof payload !== 'object') {
    return { settings: self.getCurrentSettings(), save: save };
  }

  var changes = {};

  if (payload.displayMode !== undefined) {
    changes.displayMode =
      payload.displayMode === 'full_ui' || payload.displayMode === 'screensaver_only'
        ? payload.displayMode
        : DEFAULT_DISPLAY_MODE;
  }

  if (payload.screensaverEnabled !== undefined) {
    changes.screensaverEnabled = Boolean(payload.screensaverEnabled);
  }

  if (payload.preventScreensaverWhilePlaying !== undefined) {
    changes.preventScreensaverWhilePlaying = Boolean(payload.preventScreensaverWhilePlaying);
  }

  if (payload.idleTimeoutSec !== undefined) {
    var parsedSec = parseIdleTimeoutSec(payload.idleTimeoutSec);
    if (parsedSec !== null) {
      changes.idleTimeoutSec = parsedSec;
    }
  }

  if (payload.selectedClock !== undefined) {
    changes.selectedClock = String(payload.selectedClock || '').trim() || DEFAULT_CLOCK_FILE;
  }

  if (Array.isArray(payload.radioStations)) {
    for (var i = 0; i < 5; i++) {
      var defaultPreset = DEFAULT_RADIO_PRESETS[i];
      var item = payload.radioStations[i];
      changes['radio' + (i + 1) + 'Name'] =
        item && typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : defaultPreset.name;
      changes['radio' + (i + 1) + 'Url'] =
        item && typeof (item.url || item.uri) === 'string' && String(item.url || item.uri).trim()
          ? String(item.url || item.uri).trim()
          : defaultPreset.url;
    }
  }

  if (Array.isArray(payload.podcastFeeds)) {
    var sanitizedFeeds = payload.podcastFeeds
      .map(function (f) {
        return {
          name: String((f && f.name) || 'Podcast').trim(),
          rssUrl: String((f && f.rssUrl) || '').trim()
        };
      })
      .filter(function (f) {
        return Boolean(f.rssUrl);
      });
    changes.podcastFeedsJson = JSON.stringify(sanitizedFeeds);
  }

  if (Object.keys(changes).length) {
    Object.keys(changes).forEach(function (key) {
      self.setConfigValue(key, changes[key]);
    });

    save = self.persistConfig(changes);
    self.lastSave = {
      at: new Date().toISOString(),
      source: 'POST /api/config',
      ok: save.ok,
      error: save.error,
      changes: changes
    };
    if (!save.ok) {
      self.logError('CoreZoneDisplay: POST /api/config could NOT save to ' + save.file + ': ' + save.error);
    }
  }

  return { settings: self.getCurrentSettings(), save: save };
};

/**
 * Updates configuration from POST /api/config (In-App Settings). Returns the current settings.
 */
CoreZoneDisplay.prototype.updateConfigFromApi = function (payload) {
  return this.applyApiUpdate(payload).settings;
};

/**
 * Builds diagnostic object for GET /api/debug and journal logging
 */
CoreZoneDisplay.prototype.getDebugDiagnostics = function () {
  var self = this;
  var clocksDir = self.getClocksDir();
  var clocksDirExists = false;
  var filesInClocksDir = [];

  try {
    clocksDirExists = fs.existsSync(clocksDir);
    if (clocksDirExists) {
      filesInClocksDir = fs.readdirSync(clocksDir);
    }
  } catch (err) {
    self.logError('CoreZoneDisplay: Error inspecting clocksDir: ' + err.message);
  }

  return {
    __dirname: __dirname,
    clocksDir: clocksDir,
    clocksDirExists: clocksDirExists,
    filesInClocksDir: filesInClocksDir,
    currentConfig: self.getCurrentSettings(),
    configFile: self.getConfigDiagnostics()
  };
};

/**
 * Where the settings are stored and whether they can be saved - shown by GET /api/debug
 * so a failing save on the device can be explained without guessing.
 */
CoreZoneDisplay.prototype.getConfigDiagnostics = function () {
  var self = this;
  var file = self.configFilePath || null;
  var info = {
    file: file,
    store: self.config && self.config._data ? 'built-in fallback' : 'v-conf',
    exists: false,
    writable: false,
    validJson: false,
    idleTimeoutSecInMemory: null,
    idleTimeoutSecOnDisk: null,
    lastSave: self.lastSave || null
  };

  try {
    if (self.config) {
      info.idleTimeoutSecInMemory = self.config.get('idleTimeoutSec');
    }
  } catch (err) {
    info.idleTimeoutSecInMemory = 'error: ' + err.message;
  }

  if (file) {
    try {
      info.exists = fs.existsSync(file);
    } catch (err) {
      // leave false
    }
    try {
      fs.accessSync(file, fs.constants.W_OK);
      info.writable = true;
    } catch (err) {
      info.writeError = err.code || err.message;
    }
    try {
      var parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      info.validJson = true;
      info.idleTimeoutSecOnDisk = entryValue(parsed.idleTimeoutSec);
    } catch (err) {
      // leave defaults
    }
  }

  return info;
};

/**
 * Helper: Fetches an HTTP/HTTPS URL with redirect support
 */
CoreZoneDisplay.prototype.fetchUrlText = function (targetUrl, redirectCount) {
  var self = this;
  var hops = redirectCount || 0;

  return new Promise(function (resolve, reject) {
    if (hops > 5) {
      return reject(new Error('Too many redirects'));
    }

    var parsed;
    try {
      parsed = new urlModule.URL(targetUrl);
    } catch (err) {
      return reject(new Error('Invalid RSS URL'));
    }

    var client = parsed.protocol === 'https:' ? https : http;
    var req = client.get(
      targetUrl,
      {
        headers: {
          'User-Agent': 'CoreZoneDisplay-Volumio/1.0',
          Accept: 'application/rss+xml, application/xml, text/xml, */*'
        },
        timeout: 10000
      },
      function (res) {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers &&
          res.headers.location
        ) {
          var nextUrl = new urlModule.URL(res.headers.location, targetUrl).toString();
          res.resume();
          return resolve(self.fetchUrlText(nextUrl, hops + 1));
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }

        var chunks = [];
        var totalBytes = 0;
        var maxBytes = 2 * 1024 * 1024;

        res.on('data', function (chunk) {
          totalBytes += chunk.length;
          if (totalBytes <= maxBytes) {
            chunks.push(chunk);
          }
        });

        res.on('end', function () {
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      }
    );

    req.on('timeout', function () {
      req.destroy(new Error('Request timed out'));
    });

    req.on('error', function (err) {
      reject(err);
    });
  });
};

function cleanXmlText(raw) {
  if (!raw || typeof raw !== 'string') {
    return '';
  }
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

CoreZoneDisplay.prototype.parsePodcastRss = function (xmlText) {
  var channelHeader = xmlText.split(/<item[\s>]/i)[0] || '';
  var feedTitleMatch = channelHeader.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  var feedTitle = feedTitleMatch ? cleanXmlText(feedTitleMatch[1]) : 'Podcast Feed';

  var episodes = [];
  var itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  var match;

  while ((match = itemRegex.exec(xmlText)) !== null && episodes.length < 10) {
    var itemBlock = match[1];
    var titleMatch = itemBlock.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var enclosureMatch = itemBlock.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
    var pubDateMatch = itemBlock.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    var durationMatch = itemBlock.match(/<itunes:duration[^>]*>([\s\S]*?)<\/itunes:duration>/i);

    if (enclosureMatch && enclosureMatch[1]) {
      episodes.push({
        title: titleMatch ? cleanXmlText(titleMatch[1]) : 'Episode ' + (episodes.length + 1),
        audioUrl: cleanXmlText(enclosureMatch[1]),
        pubDate: pubDateMatch ? cleanXmlText(pubDateMatch[1]) : '',
        duration: durationMatch ? cleanXmlText(durationMatch[1]) : ''
      });
    }
  }

  return {
    feedTitle: feedTitle,
    episodes: episodes
  };
};

/**
 * Volumio lifecycle: triggered when plugin is started/enabled.
 * Starts Express static + API server on port 4004.
 */
CoreZoneDisplay.prototype.onStart = function () {
  var self = this;
  var defer = libQ.defer();

  try {
    self.ensureConfigLoaded();

    var clocksDir = self.getClocksDir();
    var mainClockFile = path.join(clocksDir, DEFAULT_CLOCK_FILE);

    // If submodule/clocks is empty on the Pi after git pull, attempt automatic git submodule init
    if (!fs.existsSync(mainClockFile) && fs.existsSync(path.join(__dirname, '.git'))) {
      try {
        self.logInfo('CoreZoneDisplay: submodule/clocks empty, running git submodule update --init...');
        childProcess.execSync('git submodule sync --recursive && git submodule update --init --recursive', {
          cwd: __dirname,
          timeout: 20000
        });
      } catch (gitErr) {
        self.logError('CoreZoneDisplay: Automatic git submodule init warning: ' + gitErr.message);
      }
    }

    var diag = self.getDebugDiagnostics();
    self.logInfo(
      'CoreZoneDisplay Diagnostics -> clocksDir=' +
        diag.clocksDir +
        ' | exists=' +
        diag.clocksDirExists +
        ' | files=' +
        JSON.stringify(diag.filesInClocksDir)
    );

    self.app = express();
    self.app.use(express.json());

    var publicDir = path.join(__dirname, 'public');

    // GET /api/config -> Returns displayMode, screensaverEnabled, idleTimeoutSec, selectedClock, availableClocks
    self.app.get('/api/config', function (req, res) {
      res.json(self.getCurrentSettings());
    });

    // POST /api/config -> Saves updated settings
    self.app.post('/api/config', function (req, res) {
      try {
        var applied = self.applyApiUpdate(req.body || {});
        self.notifySettingsChanged();
        self.refreshUIConfig();
        if (!applied.save.ok) {
          return res.status(500).json({
            status: 'error',
            message: 'Could not save settings: ' + applied.save.error,
            config: applied.settings
          });
        }
        res.json({
          status: 'ok',
          config: applied.settings
        });
      } catch (err) {
        self.logError('CoreZoneDisplay: POST /api/config error: ' + err.message);
        res.status(500).json({
          status: 'error',
          message: err.message
        });
      }
    });

    // GET /api/debug -> Returns runtime diagnostics for Raspberry Pi verification
    self.app.get('/api/debug', function (req, res) {
      res.json(self.getDebugDiagnostics());
    });

    // GET /api/podcasts/episodes?url=<rssUrl>
    self.app.get('/api/podcasts/episodes', function (req, res) {
      var rssUrl = req.query && req.query.url ? String(req.query.url).trim() : '';
      if (!rssUrl) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing url query parameter'
        });
      }

      self
        .fetchUrlText(rssUrl, 0)
        .then(function (xmlText) {
          var parsed = self.parsePodcastRss(xmlText);
          res.json({
            status: 'ok',
            feedTitle: parsed.feedTitle,
            episodes: parsed.episodes
          });
        })
        .catch(function (err) {
          self.logError('CoreZoneDisplay: Failed to fetch RSS (' + rssUrl + '): ' + err.message);
          res.status(502).json({
            status: 'error',
            message: 'Could not load RSS feed: ' + err.message
          });
        });
    });

    // Explicitly mount /clocks to path.join(__dirname, 'submodule', 'clocks')
    self.app.use('/clocks', express.static(clocksDir));

    // Return strict 404 for missing /clocks/* files so index.html is never served inside #clock-frame
    self.app.use('/clocks', function (req, res) {
      res.status(404).send('Clock file not found in ' + clocksDir);
    });

    // Serve main public frontend assets
    self.app.use(express.static(publicDir));

    // Fallback route to index.html
    self.app.get('*', function (req, res) {
      res.sendFile(path.join(publicDir, 'index.html'));
    });

    self.server = self.app.listen(EXPRESS_PORT, function () {
      self.logInfo('CoreZoneDisplay UI server listening on port ' + EXPRESS_PORT);
      defer.resolve();
    });

    self.server.on('error', function (err) {
      self.logError('CoreZoneDisplay server error on port ' + EXPRESS_PORT + ': ' + err.message);
      if (err && err.code === 'EADDRINUSE') {
        // Resolve so Volumio still marks the plugin as STARTED and displays the Settings button
        self.logInfo('CoreZoneDisplay: Port ' + EXPRESS_PORT + ' already in use; resolving onStart so Settings UI stays active.');
        defer.resolve();
      } else {
        defer.reject(err);
      }
    });
  } catch (err) {
    self.logError('Failed to start CoreZoneDisplay: ' + err.message);
    defer.reject(err);
  }

  return defer.promise;
};

/**
 * Volumio lifecycle: triggered when plugin is stopped/disabled
 */
CoreZoneDisplay.prototype.onStop = function () {
  var self = this;
  var defer = libQ.defer();

  if (self.server) {
    self.logInfo('Stopping CoreZoneDisplay UI server on port ' + EXPRESS_PORT + '...');
    self.server.close(function (err) {
      if (err) {
        self.logError('Error while closing CoreZoneDisplay server: ' + err.message);
      } else {
        self.logInfo('CoreZoneDisplay UI server stopped cleanly.');
      }
      self.server = null;
      self.app = null;
      defer.resolve();
    });
  } else {
    defer.resolve();
  }

  return defer.promise;
};

/**
 * Internal logger helpers
 */
CoreZoneDisplay.prototype.logInfo = function (message) {
  if (this.logger && typeof this.logger.info === 'function') {
    this.logger.info(message);
  } else {
    console.log(message);
  }
};

CoreZoneDisplay.prototype.logError = function (message) {
  if (this.logger && typeof this.logger.error === 'function') {
    this.logger.error(message);
  } else {
    console.error(message);
  }
};

module.exports = CoreZoneDisplay;
