'use strict';

var libQ = require('kew');
var express = require('express');
var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');
var urlModule = require('url');

var EXPRESS_PORT = 4004;
var DEFAULT_CLOCK_FILE = 'MainClockSelector.html';
var DEFAULT_IDLE_TIMEOUT_SEC = 60;
var DEFAULT_SCREENSAVER_ENABLED = true;

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

function CoreZoneDisplay(context) {
  var self = this;

  self.context = context || {};
  self.commandRouter = self.context.coreCommand || null;
  self.logger = self.context.logger || console;
  self.configManager = self.context.configManager || null;
  self.config = null;
  self.app = null;
  self.server = null;
}

/**
 * Volumio lifecycle: triggered when Volumio starts.
 * Loads config.json using Volumio's built-in v-conf.
 */
CoreZoneDisplay.prototype.onVolumioStart = function () {
  var self = this;
  var configFile = path.join(__dirname, 'config.json');

  if (
    self.commandRouter &&
    self.commandRouter.pluginManager &&
    typeof self.commandRouter.pluginManager.getConfigurationFile === 'function'
  ) {
    configFile = self.commandRouter.pluginManager.getConfigurationFile(self.context, 'config.json');
  }

  self.config = new (require('v-conf'))();
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
    var fallbackConfigFile = path.join(__dirname, 'config.json');
    if (
      self.commandRouter &&
      self.commandRouter.pluginManager &&
      typeof self.commandRouter.pluginManager.getConfigurationFile === 'function'
    ) {
      fallbackConfigFile = self.commandRouter.pluginManager.getConfigurationFile(self.context, 'config.json');
    }
    self.config = new (require('v-conf'))();
    self.config.loadFile(fallbackConfigFile);
  }
};

/**
 * Scans submodule/clocks for .html files, ensuring MainClockSelector.html
 * is always listed and prioritized as the default option.
 */
CoreZoneDisplay.prototype.getAvailableClocks = function () {
  var self = this;
  var candidateDirs = [
    path.join(__dirname, 'submodule', 'clocks'),
    path.join(__dirname, 'public', 'clocks'),
    path.join(__dirname, 'ClockWeb')
  ];
  var clockFiles = [DEFAULT_CLOCK_FILE];

  candidateDirs.forEach(function (clocksDir) {
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
        // Also check known sub-clock entry points
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
      self.logError('CoreZoneDisplay: Failed to scan ' + clocksDir + ': ' + err.message);
    }
  });

  return clockFiles;
};

/**
 * Reads current settings (screensaver, availableClocks, radioStations, podcastFeeds)
 * from v-conf with safe defaults.
 */
CoreZoneDisplay.prototype.getCurrentSettings = function () {
  var self = this;
  self.ensureConfigLoaded();

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

  // Parse any additional radio stations beyond the 5 primary presets
  var rawExtraRadio = self.config.get('extraRadioStationsJson');
  if (typeof rawExtraRadio === 'string' && rawExtraRadio.trim()) {
    try {
      var parsedExtra = JSON.parse(rawExtraRadio);
      if (Array.isArray(parsedExtra)) {
        parsedExtra.forEach(function (st, idx) {
          if (st && st.name && (st.url || st.uri)) {
            var u = String(st.url || st.uri).trim();
            radioStations.push({
              id: 6 + idx,
              name: String(st.name).trim(),
              url: u,
              uri: u
            });
          }
        });
      }
    } catch (e) {
      // Ignore malformed JSON
    }
  }

  // Parse saved custom podcast RSS feeds
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
    screensaverEnabled: screensaverEnabled,
    idleTimeoutSec: idleTimeoutSec,
    selectedClock: selectedClock,
    availableClocks: self.getAvailableClocks(),
    radioStations: radioStations,
    podcastFeeds: podcastFeeds
  };
};

/**
 * Volumio Settings UI builder: scans submodule/clocks for .html files
 * and binds current configuration values to UIConfig.json.
 */
CoreZoneDisplay.prototype.getUIConfig = function () {
  var self = this;
  var defer = libQ.defer();

  var langCode = 'en';
  if (
    self.commandRouter &&
    self.commandRouter.sharedVars &&
    typeof self.commandRouter.sharedVars.get === 'function'
  ) {
    langCode = self.commandRouter.sharedVars.get('language_code') || 'en';
  }

  var i18nFile = path.join(__dirname, 'i18n', 'strings_' + langCode + '.json');
  var defaultI18nFile = path.join(__dirname, 'i18n', 'strings_en.json');
  var uiConfigFile = path.join(__dirname, 'UIConfig.json');

  self.commandRouter
    .i18nJson(i18nFile, defaultI18nFile, uiConfigFile)
    .then(function (uiconf) {
      var settings = self.getCurrentSettings();
      var availableClocks = settings.availableClocks.slice();

      if (availableClocks.indexOf(settings.selectedClock) === -1) {
        availableClocks.push(settings.selectedClock);
      }

      // Section 0: Display & Screensaver Settings
      var displayContent = uiconf.sections[0].content;
      displayContent[0].value = settings.screensaverEnabled;
      displayContent[1].value = settings.idleTimeoutSec;
      displayContent[2].options = availableClocks.map(function (clockName) {
        return {
          value: clockName,
          label: clockName
        };
      });
      displayContent[2].value = {
        value: settings.selectedClock,
        label: settings.selectedClock
      };

      // Section 1: Favorite Radio Stations (5 Presets)
      if (uiconf.sections[1] && Array.isArray(uiconf.sections[1].content)) {
        var radioContent = uiconf.sections[1].content;
        for (var i = 0; i < 5; i++) {
          var station = settings.radioStations[i] || DEFAULT_RADIO_PRESETS[i];
          var nameFieldIndex = i * 2;
          var urlFieldIndex = i * 2 + 1;
          if (radioContent[nameFieldIndex]) {
            radioContent[nameFieldIndex].value = station.name;
          }
          if (radioContent[urlFieldIndex]) {
            radioContent[urlFieldIndex].value = station.url;
          }
        }
      }

      defer.resolve(uiconf);
    })
    .fail(function (err) {
      self.logError('CoreZoneDisplay: Failed to parse UIConfig.json: ' + err);
      defer.reject(new Error());
    });

  return defer.promise;
};

/**
 * Saves Section 1: Display & Screensaver Settings (from Volumio Settings UI)
 */
CoreZoneDisplay.prototype.saveDisplaySettings = function (data) {
  var self = this;
  self.ensureConfigLoaded();

  var screensaverEnabled =
    data && data.screensaverEnabled !== undefined
      ? Boolean(data.screensaverEnabled)
      : DEFAULT_SCREENSAVER_ENABLED;

  var idleTimeoutSec = parseInt(data && data.idleTimeoutSec, 10);
  if (isNaN(idleTimeoutSec) || idleTimeoutSec <= 0) {
    idleTimeoutSec = DEFAULT_IDLE_TIMEOUT_SEC;
  }

  var selectedClock = DEFAULT_CLOCK_FILE;
  if (data && data.selectedClock) {
    if (typeof data.selectedClock === 'object' && data.selectedClock.value) {
      selectedClock = String(data.selectedClock.value).trim();
    } else if (typeof data.selectedClock === 'string') {
      selectedClock = data.selectedClock.trim();
    }
  }
  if (!selectedClock) {
    selectedClock = DEFAULT_CLOCK_FILE;
  }

  self.config.set('screensaverEnabled', screensaverEnabled);
  self.config.set('idleTimeoutSec', idleTimeoutSec);
  self.config.set('selectedClock', selectedClock);

  self.logInfo(
    'CoreZoneDisplay: Saved display settings -> screensaverEnabled=' +
      screensaverEnabled +
      ', idleTimeoutSec=' +
      idleTimeoutSec +
      ', selectedClock=' +
      selectedClock
  );

  if (self.commandRouter && typeof self.commandRouter.pushToastMessage === 'function') {
    self.commandRouter.pushToastMessage(
      'success',
      'CoreZoneDisplay',
      'Display & screensaver settings saved'
    );
  }

  return libQ.resolve();
};

/**
 * Saves Section 2: Favorite Radio Stations (5 Presets) (from Volumio Settings UI)
 */
CoreZoneDisplay.prototype.saveRadioSettings = function (data) {
  var self = this;
  self.ensureConfigLoaded();

  for (var i = 1; i <= 5; i++) {
    var defaultPreset = DEFAULT_RADIO_PRESETS[i - 1];
    var nameKey = 'radio' + i + 'Name';
    var urlKey = 'radio' + i + 'Url';

    var rawName = data && data[nameKey] !== undefined ? String(data[nameKey]).trim() : '';
    var rawUrl = data && data[urlKey] !== undefined ? String(data[urlKey]).trim() : '';

    self.config.set(nameKey, rawName || defaultPreset.name);
    self.config.set(urlKey, rawUrl || defaultPreset.url);
  }

  self.logInfo('CoreZoneDisplay: Saved 5 radio presets.');

  if (self.commandRouter && typeof self.commandRouter.pushToastMessage === 'function') {
    self.commandRouter.pushToastMessage(
      'success',
      'CoreZoneDisplay',
      'Favorite radio stations saved'
    );
  }

  return libQ.resolve();
};

/**
 * Unified saveSettings fallback method
 */
CoreZoneDisplay.prototype.saveSettings = function (data) {
  var self = this;
  if (data && (data.radio1Name !== undefined || data.radio1Url !== undefined)) {
    return self.saveRadioSettings(data);
  }
  return self.saveDisplaySettings(data);
};

/**
 * Updates configuration from POST /api/config (In-App Settings, Radio Quick-Add, Podcast RSS Add)
 * keeping v-conf and Volumio's UIConfig 100% synchronized.
 */
CoreZoneDisplay.prototype.updateConfigFromApi = function (payload) {
  var self = this;
  self.ensureConfigLoaded();

  if (!payload || typeof payload !== 'object') {
    return self.getCurrentSettings();
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

  // Support saving radioStations array or individual radio1Name..radio5Url keys
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

    var extraStations = payload.radioStations.slice(5).map(function (st) {
      return {
        name: String((st && st.name) || 'Station').trim(),
        url: String((st && (st.url || st.uri)) || '').trim()
      };
    }).filter(function (st) {
      return Boolean(st.url);
    });

    self.config.set('extraRadioStationsJson', JSON.stringify(extraStations));
  } else {
    for (var j = 1; j <= 5; j++) {
      if (payload['radio' + j + 'Name'] !== undefined) {
        self.config.set(
          'radio' + j + 'Name',
          String(payload['radio' + j + 'Name']).trim() || DEFAULT_RADIO_PRESETS[j - 1].name
        );
      }
      if (payload['radio' + j + 'Url'] !== undefined) {
        self.config.set(
          'radio' + j + 'Url',
          String(payload['radio' + j + 'Url']).trim() || DEFAULT_RADIO_PRESETS[j - 1].url
        );
      }
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
 * Helper: Fetches an HTTP/HTTPS URL with redirect support (up to 5 redirects)
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
        var maxBytes = 2 * 1024 * 1024; // 2 MB cap for safety on Raspberry Pi

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

/**
 * Helper: Cleans XML CDATA and common HTML entities
 */
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

/**
 * Helper: Lightweight RSS XML parser extracting feed title and latest 10 episodes
 */
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
      var epTitle = titleMatch ? cleanXmlText(titleMatch[1]) : 'Episode ' + (episodes.length + 1);
      var audioUrl = cleanXmlText(enclosureMatch[1]);
      var pubDate = pubDateMatch ? cleanXmlText(pubDateMatch[1]) : '';
      var duration = durationMatch ? cleanXmlText(durationMatch[1]) : '';

      episodes.push({
        title: epTitle,
        audioUrl: audioUrl,
        pubDate: pubDate,
        duration: duration
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

    self.app = express();
    self.app.use(express.json());

    var publicDir = path.join(__dirname, 'public');

    // GET /api/config -> Returns screensaver settings, availableClocks, radioStations, podcastFeeds
    self.app.get('/api/config', function (req, res) {
      res.json(self.getCurrentSettings());
    });

    // POST /api/config -> Saves updated settings from In-App Settings / Radio / Podcast modals
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

    // GET /api/podcasts/episodes?url=<rssUrl> -> Fetches latest 10 episodes from a Podcast RSS feed
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

    // Explicitly mount submodule/clocks (plus fallback paths) at /clocks
    self.app.use('/clocks', express.static(path.join(__dirname, 'submodule', 'clocks')));
    self.app.use('/clocks', express.static(path.join(__dirname, 'public', 'clocks')));
    self.app.use('/clocks', express.static(path.join(__dirname, 'ClockWeb')));

    // Return real 404 for missing /clocks/* files so index.html is never loaded inside #clock-frame
    self.app.use('/clocks', function (req, res) {
      res.status(404).send('Clock asset not found');
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
      self.logError('CoreZoneDisplay server error: ' + err.message);
      defer.reject(err);
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
