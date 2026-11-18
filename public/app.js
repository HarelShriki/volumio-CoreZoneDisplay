/**
 * CoreZoneDisplay Frontend Application (Vanilla JS)
 * Connects to Volumio Socket.IO backend (port 3000) and manages the
 * main dashboard UI + idle screensaver watchdog timer.
 */

(function () {
  'use strict';

  // ==========================================================================
  // Configuration Constants
  // ==========================================================================

  /**
   * Watchdog Idle Timeout in milliseconds.
   * Currently set to 10000 ms (10 seconds) for initial testing.
   * TODO: Change to 300000 (5 minutes) for production kiosk use.
   */
  const IDLE_TIMEOUT_MS = 10000; // Change to 300000 for 5 minutes

  /**
   * Volumio Backend WebSocket Host & Port
   * Uses window.location.hostname so it works both locally on the Pi kiosk
   * and when previewed remotely from a PC browser.
   */
  const VOLUMIO_HOST = window.location.hostname || 'localhost';
  const VOLUMIO_BACKEND_URL = 'http://' + VOLUMIO_HOST + ':3000';
  const SOCKET_IO_SCRIPT_URL = VOLUMIO_BACKEND_URL + '/socket.io/socket.io.js';

  // ==========================================================================
  // DOM Elements
  // ==========================================================================

  const connectionIndicator = document.getElementById('connection-indicator');
  const connectionStatus = document.getElementById('connection-status');
  const headerClock = document.getElementById('header-clock');

  const playbackStateBadge = document.getElementById('playback-state-badge');
  const playbackService = document.getElementById('playback-service');
  const mainTrackTitle = document.getElementById('main-track-title');
  const mainTrackArtist = document.getElementById('main-track-artist');

  const screensaverEl = document.getElementById('screensaver');
  const screensaverClockEl = document.getElementById('screensaver-clock');
  const screensaverNowPlayingEl = document.getElementById('screensaver-now-playing');
  const screensaverTrackInfoEl = document.getElementById('screensaver-track-info');

  const sourceTiles = document.querySelectorAll('.source-tile');

  // ==========================================================================
  // Application State
  // ==========================================================================

  let idleTimerId = null;
  let isScreensaverActive = false;
  let lastStateSignature = null;
  let socket = null;

  // ==========================================================================
  // Digital Clock (Updated every second)
  // ==========================================================================

  function formatTimeHHMM(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return hours + ':' + minutes;
  }

  function updateClocks() {
    const now = new Date();
    const formatted = formatTimeHHMM(now);

    if (screensaverClockEl) {
      screensaverClockEl.textContent = formatted;
    }
    if (headerClock) {
      headerClock.textContent = formatted;
    }
  }

  // ==========================================================================
  // Idle / Screensaver Watchdog Timer
  // ==========================================================================

  function showScreensaver() {
    if (!screensaverEl || isScreensaverActive) {
      return;
    }
    isScreensaverActive = true;
    screensaverEl.classList.remove('hidden');
    screensaverEl.setAttribute('aria-hidden', 'false');
  }

  function hideScreensaver() {
    if (!screensaverEl || !isScreensaverActive) {
      return;
    }
    isScreensaverActive = false;
    screensaverEl.classList.add('hidden');
    screensaverEl.setAttribute('aria-hidden', 'true');
  }

  /**
   * Resets the idle watchdog timer and wakes the screen if sleeping.
   */
  function resetIdleTimer() {
    hideScreensaver();

    if (idleTimerId !== null) {
      clearTimeout(idleTimerId);
    }

    idleTimerId = setTimeout(function () {
      showScreensaver();
    }, IDLE_TIMEOUT_MS);
  }

  function bindUserActivityListeners() {
    const interactionEvents = ['touchstart', 'click', 'mousemove'];

    interactionEvents.forEach(function (eventName) {
      window.addEventListener(
        eventName,
        function () {
          resetIdleTimer();
        },
        { passive: true }
      );
    });
  }

  // ==========================================================================
  // Volumio State & UI Rendering
  // ==========================================================================

  function setConnectionUI(isConnected, labelText) {
    if (!connectionIndicator || !connectionStatus) {
      return;
    }

    connectionIndicator.classList.toggle('connected', Boolean(isConnected));
    connectionIndicator.classList.toggle('disconnected', !isConnected);

    connectionStatus.classList.toggle('status-connected', Boolean(isConnected));
    connectionStatus.classList.toggle('status-disconnected', !isConnected);
    connectionStatus.textContent = labelText;
  }

  /**
   * Builds a signature of playback-relevant fields so we wake the screen
   * whenever playback state, track, artist, or service actually changes.
   */
  function getPlaybackSignature(state) {
    if (!state || typeof state !== 'object') {
      return '';
    }
    return [
      state.status || '',
      state.title || '',
      state.artist || '',
      state.album || '',
      state.service || ''
    ].join('|');
  }

  function handlePushState(state) {
    if (!state || typeof state !== 'object') {
      return;
    }

    const status = (state.status || 'stop').toLowerCase();
    const isPlaying = status === 'play';
    const title = (state.title || '').trim();
    const artist = (state.artist || '').trim();
    const service = (state.service || 'Volumio').trim();

    // Update Main UI Playback Badge & Service
    if (playbackStateBadge) {
      playbackStateBadge.textContent = status.toUpperCase();
      playbackStateBadge.classList.toggle('playing', isPlaying);
    }

    if (playbackService) {
      playbackService.textContent = service;
    }

    // Update Main UI Track Title & Artist
    if (mainTrackTitle) {
      mainTrackTitle.textContent = title || (isPlaying ? 'Playing Audio' : 'Ready to Play');
    }

    if (mainTrackArtist) {
      if (artist) {
        mainTrackArtist.textContent = artist;
      } else if (isPlaying) {
        mainTrackArtist.textContent = 'Streaming via ' + service;
      } else {
        mainTrackArtist.textContent = 'Select a source below or stream via Spotify Connect';
      }
    }

    // Update Screensaver Subtle "Now Playing" Line
    if (screensaverNowPlayingEl && screensaverTrackInfoEl) {
      if (isPlaying && (title || artist)) {
        const parts = [];
        if (title) parts.push(title);
        if (artist) parts.push(artist);
        screensaverTrackInfoEl.textContent = parts.join(' — ');
        screensaverNowPlayingEl.classList.remove('hidden');
      } else {
        screensaverTrackInfoEl.textContent = '';
        screensaverNowPlayingEl.classList.add('hidden');
      }
    }

    // Wake screen and reset watchdog timer on pushState changes
    const currentSignature = getPlaybackSignature(state);
    if (lastStateSignature !== currentSignature) {
      lastStateSignature = currentSignature;
      resetIdleTimer();
    } else {
      // Even if signature is identical, a pushState event was emitted
      resetIdleTimer();
    }
  }

  // ==========================================================================
  // Dynamic Socket.IO Loader & Connection
  // ==========================================================================

  function loadSocketIoScript(onLoaded, onError) {
    if (typeof window.io === 'function') {
      onLoaded();
      return;
    }

    const script = document.createElement('script');
    script.src = SOCKET_IO_SCRIPT_URL;
    script.async = true;
    script.onload = function () {
      if (typeof window.io === 'function') {
        onLoaded();
      } else {
        onError(new Error('Socket.IO loaded but window.io is undefined'));
      }
    };
    script.onerror = function () {
      onError(new Error('Failed to load ' + SOCKET_IO_SCRIPT_URL));
    };

    document.head.appendChild(script);
  }

  function initVolumioSocket() {
    setConnectionUI(false, 'Connecting to ' + VOLUMIO_HOST + ':3000...');

    loadSocketIoScript(
      function () {
        try {
          socket = window.io(VOLUMIO_BACKEND_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 2000
          });

          socket.on('connect', function () {
            setConnectionUI(true, 'Volumio Connected');
            socket.emit('getState', '');
          });

          socket.on('disconnect', function () {
            setConnectionUI(false, 'Volumio Disconnected');
          });

          socket.on('connect_error', function () {
            setConnectionUI(false, 'Volumio Offline (' + VOLUMIO_HOST + ':3000)');
          });

          socket.on('pushState', function (state) {
            handlePushState(state);
          });
        } catch (err) {
          console.error('CoreZoneDisplay Socket.IO error:', err);
          setConnectionUI(false, 'Socket Error');
        }
      },
      function (err) {
        console.warn('CoreZoneDisplay: Could not load Volumio socket.io.js:', err.message);
        setConnectionUI(false, 'Volumio Unreachable (' + VOLUMIO_HOST + ':3000)');
      }
    );
  }

  // ==========================================================================
  // Source Tile Placeholder Feedback
  // ==========================================================================

  function bindSourceTileButtons() {
    sourceTiles.forEach(function (tile) {
      tile.addEventListener('click', function () {
        const sourceName = tile.getAttribute('data-source') || 'source';
        tile.classList.add('active-feedback');
        setTimeout(function () {
          tile.classList.remove('active-feedback');
        }, 180);

        if (mainTrackArtist && (!socket || !socket.connected)) {
          mainTrackArtist.textContent = 'Selected source: ' + sourceName.toUpperCase() + ' (Placeholder)';
        }
      });
    });
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  function init() {
    updateClocks();
    setInterval(updateClocks, 1000);

    bindUserActivityListeners();
    bindSourceTileButtons();
    resetIdleTimer();
    initVolumioSocket();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
