'use strict';

var libQ = require('kew');
var express = require('express');
var path = require('path');

var EXPRESS_PORT = 4004;

function CoreZoneDisplay(context) {
  var self = this;

  self.context = context || {};
  self.commandRouter = self.context.coreCommand || null;
  self.logger = self.context.logger || console;
  self.configManager = self.context.configManager || null;
  self.server = null;
}

/**
 * Volumio lifecycle: triggered when Volumio starts
 */
CoreZoneDisplay.prototype.onVolumioStart = function () {
  var self = this;
  self.logInfo('CoreZoneDisplay: onVolumioStart triggered');
  return libQ.resolve();
};

/**
 * Volumio lifecycle: triggered when plugin is started/enabled
 */
CoreZoneDisplay.prototype.onStart = function () {
  var self = this;
  var defer = libQ.defer();

  try {
    var app = express();
    var publicDir = path.join(__dirname, 'public');

    // Serve static frontend files from public/
    app.use(express.static(publicDir));

    // Fallback route to index.html
    app.get('*', function (req, res) {
      res.sendFile(path.join(publicDir, 'index.html'));
    });

    self.server = app.listen(EXPRESS_PORT, function () {
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
      defer.resolve();
    });
  } else {
    defer.resolve();
  }

  return defer.promise;
};

/**
 * Volumio configuration files declaration
 */
CoreZoneDisplay.prototype.getConfigurationFiles = function () {
  return ['config.json'];
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
