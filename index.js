'use strict';

var libQ = require('kew');
var express = require('express');
var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');
var urlModule = require('url');
var childProcess = require('child_process');

var EXPRESS_PORT = 4004;
var DEFAULT_DISPLAY_MODE = 'screensaver_only';
var DEFAULT_CLOCK_FILE = 'MainClockSelector.html';
var DEFAULT_IDLE_TIMEOUT_SEC = 60;
var DEFAULT_SCREENSAVER_ENABLED = true;

var DISPLAY_MODE_LABELS = {
  screensaver_only: 'Screensaver Only (Clock Mode)',
  full_ui: 'Full Menu + Screensaver'
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
    if (
      configFile !== defaultConfigFile &&
      !fs.existsSync(configFile) &&
      fs.existsSync(defaultConfigFile)
    ) {
      var targetDir = path.dirname(configFile);
      if (fs.existsSync(targetDir)) {
        fs.copyFileSync(defaultConfigFile, configFile);
      } else {
        configFile = defaultConfigFile;
      }
    }
  } catch (err) {
    configFile = defaultConfigFile;
  }

  self.configFilePath = configFile;
  self.config = createVConf();
  self.config.loadFile(configFile);
  self.logInfo('CoreZoneDisplay: onVolumioStart loaded config from ' + configFile);

  return libQ.resolve();
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
    idleTimeoutSec: idleTimeoutSec,
    selectedClock: selectedClock,
    availableClocks: self.getAvailableClocks(),
    radioStations: radioStations,
    podcastFeeds: podcastFeeds
  };
};

/**
 * Volumio Settings UI builder: loads UIConfig.json via i18nJson,
 * binds current this.config values to uiconf.sections[0].content,
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

  function populateAndResolve(uiconf) {
    try {
      var settings = self.getCurrentSettings();
      var availableClocks = settings.availableClocks.slice();

      if (availableClocks.indexOf(settings.selectedClock) === -1) {
        availableClocks.push(settings.selectedClock);
      }

      var content = uiconf.sections[0].content;

      // 0: displayMode (select)
      var modeLabel =
        DISPLAY_MODE_LABELS[settings.displayMode] ||
        DISPLAY_MODE_LABELS[DEFAULT_DISPLAY_MODE];
      content[0].value = {
        value: settings.displayMode,
        label: modeLabel
      };

      // 1: screensaverEnabled (switch)
      content[1].value = Boolean(settings.screensaverEnabled);

      // 2: idleTimeoutSec (number)
      content[2].value = Number(settings.idleTimeoutSec);

      // 3: selectedClock (select)
      content[3].options = availableClocks.map(function (clockName) {
        return {
          value: clockName,
          label: clockName
        };
      });
      content[3].value = {
        value: settings.selectedClock,
        label: settings.selectedClock
      };

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
 * Saves settings from Volumio's Settings UI.
 * Correctly extracts .value from Volumio select objects.
 */
CoreZoneDisplay.prototype.saveSettings = function (data) {
  var self = this;
  self.ensureConfigLoaded();

  var rawDisplayMode =
    data && data.displayMode && data.displayMode.value !== undefined
      ? data.displayMode.value
      : data && data.displayMode;
  var displayMode =
    rawDisplayMode === 'full_ui' || rawDisplayMode === 'screensaver_only'
      ? rawDisplayMode
      : DEFAULT_DISPLAY_MODE;

  var screensaverEnabled =
    data && data.screensaverEnabled !== undefined
      ? Boolean(data.screensaverEnabled)
      : DEFAULT_SCREENSAVER_ENABLED;

  var idleTimeoutSec = parseInt(data && data.idleTimeoutSec, 10);
  if (isNaN(idleTimeoutSec) || idleTimeoutSec <= 0) {
    idleTimeoutSec = DEFAULT_IDLE_TIMEOUT_SEC;
  }

  var rawSelectedClock =
    data && data.selectedClock && data.selectedClock.value !== undefined
      ? data.selectedClock.value
      : data && data.selectedClock;
  var selectedClock =
    typeof rawSelectedClock === 'string' && rawSelectedClock.trim()
      ? rawSelectedClock.trim()
      : DEFAULT_CLOCK_FILE;

  self.config.set('displayMode', displayMode);
  self.config.set('screensaverEnabled', screensaverEnabled);
  self.config.set('idleTimeoutSec', idleTimeoutSec);
  self.config.set('selectedClock', selectedClock);

  self.logInfo(
    'CoreZoneDisplay: Saved settings -> displayMode=' +
      displayMode +
      ', screensaverEnabled=' +
      screensaverEnabled +
      ', idleTimeoutSec=' +
      idleTimeoutSec +
      ', selectedClock=' +
      selectedClock
  );

  if (self.commandRouter && typeof self.commandRouter.pushToastMessage === 'function') {
    self.commandRouter.pushToastMessage('success', 'CoreZoneDisplay', 'Settings saved');
  }

  return libQ.resolve();
};

/**
 * Updates configuration from POST /api/config (In-App Settings)
 */
CoreZoneDisplay.prototype.updateConfigFromApi = function (payload) {
  var self = this;
  self.ensureConfigLoaded();

  if (!payload || typeof payload !== 'object') {
    return self.getCurrentSettings();
  }

  if (payload.displayMode !== undefined) {
    var mode =
      payload.displayMode === 'full_ui' || payload.displayMode === 'screensaver_only'
        ? payload.displayMode
        : DEFAULT_DISPLAY_MODE;
    self.config.set('displayMode', mode);
  }

  if (payload.screensaverEnabled !== undefined) {
    self.config.set('screensaverEnabled', Boolean(payload.screensaverEnabled));
  }

  if (payload.idleTimeoutSec !== undefined) {
    var parsedSec = parseInt(payload.idleTimeoutSec, 10);
    if (!isNaN(parsedSec) && parsedSec > 0) {
      self.config.set('idleTimeoutSec', parsedSec);
    }
  }

  if (payload.selectedClock !== undefined) {
    var clockStr = String(payload.selectedClock || '').trim() || DEFAULT_CLOCK_FILE;
    self.config.set('selectedClock', clockStr);
  }

  if (Array.isArray(payload.radioStations)) {
    for (var i = 0; i < 5; i++) {
      var defaultPreset = DEFAULT_RADIO_PRESETS[i];
      var item = payload.radioStations[i];
      var nameVal =
        item && typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : defaultPreset.name;
      var urlVal =
        item && typeof (item.url || item.uri) === 'string' && String(item.url || item.uri).trim()
          ? String(item.url || item.uri).trim()
          : defaultPreset.url;

      self.config.set('radio' + (i + 1) + 'Name', nameVal);
      self.config.set('radio' + (i + 1) + 'Url', urlVal);
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
    self.config.set('podcastFeedsJson', JSON.stringify(sanitizedFeeds));
  }

  return self.getCurrentSettings();
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
    currentConfig: self.getCurrentSettings()
  };
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
        var updated = self.updateConfigFromApi(req.body || {});
        res.json({
          status: 'ok',
          config: updated
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
