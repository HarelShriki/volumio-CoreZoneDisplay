'use strict';

/**
 * CoreZoneDisplay — Zero-Dependency Local Windows Debug Server
 * Uses only built-in Node.js modules (http, https, fs, path, url).
 *
 * - Serves ../public at http://localhost:4004/
 * - Serves ../submodule/clocks at http://localhost:4004/clocks/ (strict 404 if missing)
 * - Implements GET /api/config, POST /api/config (backed by win-debug/dev-config.json)
 * - Implements GET /api/podcasts/episodes?url=<rssUrl>
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const urlModule = require('url');

const PORT = Number(process.env.PORT) || 4004;
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CLOCKS_DIR = path.join(ROOT_DIR, 'submodule', 'clocks');
const DEV_CONFIG_PATH = path.join(__dirname, 'dev-config.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8'
};

const DEFAULT_DEV_CONFIG = {
  displayMode: 'screensaver_only',
  screensaverEnabled: true,
  idleTimeoutSec: 30,
  selectedClock: 'MainClockSelector.html',
  radioStations: [
    {
      id: 1,
      name: 'Kan 88',
      url: 'https://27783.live.streamtheworld.com/KAN_88.mp3',
      uri: 'https://27783.live.streamtheworld.com/KAN_88.mp3'
    },
    {
      id: 2,
      name: 'Galgalatz',
      url: 'https://glzwizzlv.bynetcdn.com/glglz_mp3',
      uri: 'https://glzwizzlv.bynetcdn.com/glglz_mp3'
    },
    {
      id: 3,
      name: 'Eco 99 FM',
      url: 'https://eco01.mediacast.co.il/ecolive/99fm_aac/icecast.audio',
      uri: 'https://eco01.mediacast.co.il/ecolive/99fm_aac/icecast.audio'
    },
    {
      id: 4,
      name: 'Radio Paradise',
      url: 'http://stream.radioparadise.com/aac-320',
      uri: 'http://stream.radioparadise.com/aac-320'
    },
    {
      id: 5,
      name: 'SomaFM Groove Salad',
      url: 'https://ice1.somafm.com/groovesalad-256-mp3',
      uri: 'https://ice1.somafm.com/groovesalad-256-mp3'
    }
  ],
  podcastFeeds: []
};

/**
 * Dynamically scans ../submodule/clocks for .html files
 */
function scanAvailableClocks() {
  const clocks = ['MainClockSelector.html'];
  try {
    if (fs.existsSync(CLOCKS_DIR)) {
      const entries = fs.readdirSync(CLOCKS_DIR);
      entries.forEach(function (entry) {
        if (
          typeof entry === 'string' &&
          entry.toLowerCase().endsWith('.html') &&
          clocks.indexOf(entry) === -1
        ) {
          clocks.push(entry);
        }
      });

      ['CASIO/index.html', 'digital/index.html'].forEach(function (subClock) {
        if (fs.existsSync(path.join(CLOCKS_DIR, subClock)) && clocks.indexOf(subClock) === -1) {
          clocks.push(subClock);
        }
      });
    }
  } catch (err) {
    console.warn('[WARN] Could not scan submodule/clocks:', err.message);
  }
  return clocks;
}

/**
 * Loads or auto-creates win-debug/dev-config.json
 */
function loadDevConfig() {
  try {
    if (!fs.existsSync(DEV_CONFIG_PATH)) {
      fs.writeFileSync(DEV_CONFIG_PATH, JSON.stringify(DEFAULT_DEV_CONFIG, null, 2), 'utf8');
      console.log('[INIT] Created default config at ' + DEV_CONFIG_PATH);
    }
    const raw = fs.readFileSync(DEV_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    const radioStations = Array.isArray(parsed.radioStations) && parsed.radioStations.length > 0
      ? parsed.radioStations.map(function (st, idx) {
          const u = String(st.url || st.uri || '').trim();
          return {
            id: st.id || idx + 1,
            name: String(st.name || 'Station ' + (idx + 1)).trim(),
            url: u,
            uri: u
          };
        })
      : DEFAULT_DEV_CONFIG.radioStations;

    const displayMode =
      parsed.displayMode === 'full_ui' || parsed.displayMode === 'screensaver_only'
        ? parsed.displayMode
        : 'screensaver_only';

    return {
      displayMode: displayMode,
      screensaverEnabled:
        parsed.screensaverEnabled !== undefined ? Boolean(parsed.screensaverEnabled) : true,
      idleTimeoutSec: Number(parsed.idleTimeoutSec) > 0 ? Number(parsed.idleTimeoutSec) : 30,
      selectedClock: String(parsed.selectedClock || 'MainClockSelector.html').trim(),
      availableClocks: scanAvailableClocks(),
      radioStations: radioStations,
      podcastFeeds: Array.isArray(parsed.podcastFeeds) ? parsed.podcastFeeds : []
    };
  } catch (err) {
    console.warn('[WARN] Failed to read dev-config.json, using defaults:', err.message);
    return Object.assign({}, DEFAULT_DEV_CONFIG, {
      availableClocks: scanAvailableClocks()
    });
  }
}

/**
 * Updates and saves win-debug/dev-config.json
 */
function saveDevConfig(updates) {
  const current = loadDevConfig();

  if (updates.displayMode !== undefined) {
    current.displayMode =
      updates.displayMode === 'full_ui' || updates.displayMode === 'screensaver_only'
        ? updates.displayMode
        : 'screensaver_only';
  }
  if (updates.screensaverEnabled !== undefined) {
    current.screensaverEnabled = Boolean(updates.screensaverEnabled);
  }
  if (updates.idleTimeoutSec !== undefined) {
    const sec = parseInt(updates.idleTimeoutSec, 10);
    if (!isNaN(sec) && sec > 0) {
      current.idleTimeoutSec = sec;
    }
  }
  if (updates.selectedClock !== undefined) {
    current.selectedClock = String(updates.selectedClock || '').trim() || 'MainClockSelector.html';
  }
  if (Array.isArray(updates.radioStations)) {
    current.radioStations = updates.radioStations.map(function (st, idx) {
      const u = String(st.url || st.uri || '').trim();
      return {
        id: idx + 1,
        name: String(st.name || 'Station ' + (idx + 1)).trim(),
        url: u,
        uri: u
      };
    });
  }
  if (Array.isArray(updates.podcastFeeds)) {
    current.podcastFeeds = updates.podcastFeeds
      .map(function (f, idx) {
        return {
          id: idx + 1,
          name: String((f && f.name) || 'Podcast').trim(),
          rssUrl: String((f && f.rssUrl) || '').trim()
        };
      })
      .filter(function (f) {
        return Boolean(f.rssUrl);
      });
  }

  const toPersist = {
    displayMode: current.displayMode,
    screensaverEnabled: current.screensaverEnabled,
    idleTimeoutSec: current.idleTimeoutSec,
    selectedClock: current.selectedClock,
    radioStations: current.radioStations,
    podcastFeeds: current.podcastFeeds
  };

  fs.writeFileSync(DEV_CONFIG_PATH, JSON.stringify(toPersist, null, 2), 'utf8');
  current.availableClocks = scanAvailableClocks();
  return current;
}

/**
 * Reads JSON body from an incoming HTTP POST request
 */
function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    let raw = '';
    req.on('data', function (chunk) {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', function () {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Fetches an RSS URL for GET /api/podcasts/episodes
 */
function fetchUrlText(targetUrl, hops) {
  const redirectCount = hops || 0;
  return new Promise(function (resolve, reject) {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'));
    }
    let parsed;
    try {
      parsed = new urlModule.URL(targetUrl);
    } catch (e) {
      return reject(new Error('Invalid URL'));
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(
      targetUrl,
      {
        headers: {
          'User-Agent': 'CoreZoneDisplay-WinDebug/1.0',
          Accept: 'application/rss+xml, application/xml, text/xml, */*'
        },
        timeout: 10000
      },
      function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new urlModule.URL(res.headers.location, targetUrl).toString();
          res.resume();
          return resolve(fetchUrlText(nextUrl, redirectCount + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }
        const chunks = [];
        res.on('data', function (c) {
          chunks.push(c);
        });
        res.on('end', function () {
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      }
    );
    req.on('timeout', function () {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

function cleanXmlText(raw) {
  if (!raw || typeof raw !== 'string') return '';
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

function parsePodcastRss(xmlText) {
  const header = xmlText.split(/<item[\s>]/i)[0] || '';
  const titleMatch = header.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const feedTitle = titleMatch ? cleanXmlText(titleMatch[1]) : 'Podcast Feed';

  const episodes = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xmlText)) !== null && episodes.length < 10) {
    const block = match[1];
    const epTitleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const encMatch = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
    const pubMatch = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const durMatch = block.match(/<itunes:duration[^>]*>([\s\S]*?)<\/itunes:duration>/i);

    if (encMatch && encMatch[1]) {
      episodes.push({
        title: epTitleMatch ? cleanXmlText(epTitleMatch[1]) : 'Episode ' + (episodes.length + 1),
        audioUrl: cleanXmlText(encMatch[1]),
        pubDate: pubMatch ? cleanXmlText(pubMatch[1]) : '',
        duration: durMatch ? cleanXmlText(durMatch[1]) : ''
      });
    }
  }
  return { feedTitle: feedTitle, episodes: episodes };
}

/**
 * Formats console log line for HTTP requests
 */
function logRequest(statusCode, method, reqUrl, note) {
  const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const tag = statusCode >= 400 ? '[ERR ' + statusCode + ']' : '[OK  ' + statusCode + ']';
  const extra = note ? ' -> ' + note : '';
  console.log(timeStr + ' ' + tag + ' ' + method + ' ' + reqUrl + extra);
}

/**
 * Safely serves a static file from baseDir
 */
function serveStaticFile(req, res, baseDir, relativePath, strict404) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(relativePath);
  } catch (e) {
    decodedPath = relativePath;
  }

  // Normalize and prevent path traversal outside baseDir
  const safeRel = decodedPath.replace(/^[/\\]+/, '');
  let fullPath = path.resolve(baseDir, safeRel);

  if (!fullPath.startsWith(path.resolve(baseDir))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    logRequest(403, req.method, req.url, 'Path traversal blocked');
    return;
  }

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    fullPath = path.join(fullPath, 'index.html');
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    if (strict404) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + decodedPath);
      logRequest(404, req.method, req.url, 'Missing file at ' + fullPath);
      return;
    }

    // Fallback to public/index.html only for non-/clocks and non-/api routes
    fullPath = path.join(PUBLIC_DIR, 'index.html');
    if (!fs.existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      logRequest(404, req.method, req.url, 'Missing public/index.html');
      return;
    }
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const stat = fs.statSync(fullPath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });

    if (req.method === 'HEAD') {
      res.end();
      logRequest(200, req.method, req.url);
      return;
    }

    const stream = fs.createReadStream(fullPath);
    stream.on('error', function (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('500 Internal Server Error');
      logRequest(500, req.method, req.url, err.message);
    });
    stream.pipe(res);
    logRequest(200, req.method, req.url);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
    logRequest(500, req.method, req.url, err.message);
  }
}

// ============================================================================
// HTTP Server
// ============================================================================

const server = http.createServer(function (req, res) {
  const parsedUrl = new urlModule.URL(req.url, 'http://localhost:' + PORT);
  const pathname = parsedUrl.pathname;

  // 1. Mock API: GET /api/config
  if (pathname === '/api/config' && req.method === 'GET') {
    const cfg = loadDevConfig();
    const body = JSON.stringify(cfg);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(body);
    logRequest(200, req.method, req.url, 'selectedClock=' + cfg.selectedClock);
    return;
  }

  // 2. Mock API: POST /api/config
  if (pathname === '/api/config' && req.method === 'POST') {
    readJsonBody(req)
      .then(function (updates) {
        const updated = saveDevConfig(updates);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'ok', config: updated }));
        logRequest(200, req.method, req.url, 'Saved to dev-config.json');
      })
      .catch(function (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
        logRequest(400, req.method, req.url, err.message);
      });
    return;
  }

  // 2b. Diagnostic Endpoint: GET /api/debug
  if (pathname === '/api/debug' && req.method === 'GET') {
    const clocksDirExists = fs.existsSync(CLOCKS_DIR);
    let filesInClocksDir = [];
    if (clocksDirExists) {
      try {
        filesInClocksDir = fs.readdirSync(CLOCKS_DIR);
      } catch (e) {}
    }
    const debugPayload = {
      __dirname: ROOT_DIR,
      clocksDir: CLOCKS_DIR,
      clocksDirExists: clocksDirExists,
      filesInClocksDir: filesInClocksDir,
      currentConfig: loadDevConfig()
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(debugPayload, null, 2));
    logRequest(200, req.method, req.url, 'clocksDirExists=' + clocksDirExists);
    return;
  }

  // 3. Podcast RSS Episodes Proxy: GET /api/podcasts/episodes?url=<rssUrl>
  if (pathname === '/api/podcasts/episodes' && req.method === 'GET') {
    const rssUrl = (parsedUrl.searchParams.get('url') || '').trim();
    if (!rssUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'error', message: 'Missing url parameter' }));
      logRequest(400, req.method, req.url, 'Missing url parameter');
      return;
    }

    fetchUrlText(rssUrl, 0)
      .then(function (xmlText) {
        const parsed = parsePodcastRss(xmlText);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            status: 'ok',
            feedTitle: parsed.feedTitle,
            episodes: parsed.episodes
          })
        );
        logRequest(200, req.method, req.url, 'Episodes=' + parsed.episodes.length);
      })
      .catch(function (err) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            status: 'error',
            message: 'Could not load RSS feed: ' + err.message
          })
        );
        logRequest(502, req.method, req.url, err.message);
      });
    return;
  }

  // 4. Static Clock Submodule Route: /clocks/* -> ../submodule/clocks/* (Strict 404)
  if (pathname === '/clocks' || pathname.startsWith('/clocks/')) {
    const relClockPath = pathname.slice('/clocks'.length) || '/MainClockSelector.html';
    serveStaticFile(req, res, CLOCKS_DIR, relClockPath, true);
    return;
  }

  // 5. Static Public Route: /* -> ../public/*
  const relPublicPath = pathname === '/' ? '/index.html' : pathname;
  serveStaticFile(req, res, PUBLIC_DIR, relPublicPath, true);
});

server.on('error', function (err) {
  console.error('\n[FATAL] Failed to start server on port ' + PORT + ':', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use by another process.');
  }
  process.exit(1);
});

server.listen(PORT, function () {
  const mainClockPath = path.join(CLOCKS_DIR, 'MainClockSelector.html');
  const hasSubmodule = fs.existsSync(mainClockPath);

  loadDevConfig();

  console.log('======================================================================');
  console.log(' CoreZoneDisplay — Local Windows Debug Server');
  console.log('======================================================================');
  console.log(' Main UI URL     : http://localhost:' + PORT);
  console.log(' Clock Only URL  : http://localhost:' + PORT + '/clocks/MainClockSelector.html');
  console.log(' Config API URL  : http://localhost:' + PORT + '/api/config');
  console.log(' Public Folder   : ' + PUBLIC_DIR);
  console.log(' Clocks Folder   : ' + CLOCKS_DIR);
  console.log(
    ' Submodule Status: ' +
      (hasSubmodule
        ? '[OK] MainClockSelector.html found'
        : '[WARNING] MainClockSelector.html NOT found! Run: git submodule update --init --recursive')
  );
  console.log('======================================================================');
  console.log(' Listening for requests... (Press Ctrl+C to stop)\n');
});
