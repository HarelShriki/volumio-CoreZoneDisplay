/**
 * CoreZoneDisplay — Complete Frontend Application (Vanilla JS)
 * - Fixed Top Bar & Bottom Player Bar + Touch-Scrollable View Container
 * - Connects to Volumio Socket.IO backend (port 3000)
 * - Synchronizes settings via GET /api/config & POST /api/config
 * - Integrates submodule/clocks/MainClockSelector.html inside #screensaver with fallback clock check
 * - Provides 1-tap Radio playback, Quick-Add/Edit modal, and Volumio My Web Radios import
 * - Provides Podcasts RSS feed manager (GET /api/podcasts/episodes) + Volumio browseLibrary
 */

(function () {
  'use strict';

  // ==========================================================================
  // Constants & Defaults
  // ==========================================================================

  const DEFAULT_DISPLAY_MODE = 'screensaver_only';
  const DEFAULT_CLOCK_FILE = 'MainClockSelector.html';
  const DEFAULT_IDLE_TIMEOUT_SEC = 60;
  const DEFAULT_SCREENSAVER_ENABLED = true;
  const TOOLBAR_AUTOHIDE_MS = 5000;

  const DEFAULT_RADIO_STATIONS = [
    { id: 1, name: 'Kan 88', url: 'https://27783.live.streamtheworld.com/KAN_88.mp3', uri: 'https://27783.live.streamtheworld.com/KAN_88.mp3' },
    { id: 2, name: 'Galgalatz', url: 'https://glzwizzlv.bynetcdn.com/glglz_mp3', uri: 'https://glzwizzlv.bynetcdn.com/glglz_mp3' },
    { id: 3, name: 'Eco 99 FM', url: 'https://eco01.mediacast.co.il/ecolive/99fm_aac/icecast.audio', uri: 'https://eco01.mediacast.co.il/ecolive/99fm_aac/icecast.audio' },
    { id: 4, name: 'Radio Paradise', url: 'http://stream.radioparadise.com/aac-320', uri: 'http://stream.radioparadise.com/aac-320' },
    { id: 5, name: 'SomaFM Groove Salad', url: 'https://ice1.somafm.com/groovesalad-256-mp3', uri: 'https://ice1.somafm.com/groovesalad-256-mp3' }
  ];

  const VIEW_TITLES = {
    home: 'CoreZoneDisplay',
    radio: 'Radio Stations',
    spotify: 'Spotify Connect',
    cd: 'CD Player',
    podcasts: 'Podcasts',
    settings: 'Display & Radio Settings',
    nowplaying: 'Now Playing'
  };

  const VOLUMIO_HOST = window.location.hostname || 'localhost';
  const VOLUMIO_BACKEND_URL = 'http://' + VOLUMIO_HOST + ':3000';
  const SOCKET_IO_SCRIPT_URL = VOLUMIO_BACKEND_URL + '/socket.io/socket.io.js';

  // ==========================================================================
  // DOM References
  // ==========================================================================

  const mainUiEl = document.getElementById('main-ui');
  const homeBtn = document.getElementById('home-btn');
  const viewTitleEl = document.getElementById('view-title');
  const headerClockEl = document.getElementById('header-clock');
  const connectionIndicator = document.getElementById('connection-indicator');
  const connectionStatus = document.getElementById('connection-status');
  const settingsBtn = document.getElementById('settings-btn');
  const showClockBtn = document.getElementById('show-clock-btn');
  const viewContainer = document.getElementById('view-container');

  const views = {
    home: document.getElementById('view-home'),
    radio: document.getElementById('view-radio'),
    spotify: document.getElementById('view-spotify'),
    cd: document.getElementById('view-cd'),
    podcasts: document.getElementById('view-podcasts'),
    settings: document.getElementById('view-settings'),
    nowplaying: document.getElementById('view-nowplaying')
  };

  const sourceTiles = document.querySelectorAll('.source-tile');
  const tileBadgeRadio = document.getElementById('tile-badge-radio');

  // Radio View Elements
  const radioPresetsGrid = document.getElementById('radio-presets-grid');
  const radioAddBtn = document.getElementById('radio-add-btn');
  const radioLoadVolumioBtn = document.getElementById('radio-load-volumio-btn');
  const radioHelpToggle = document.getElementById('radio-help-toggle');
  const radioHelpBox = document.getElementById('radio-help-box');
  const radioHelpClose = document.getElementById('radio-help-close');
  const volumioRadiosSection = document.getElementById('volumio-radios-section');
  const volumioRadiosList = document.getElementById('volumio-radios-list');

  // Radio Quick-Add / Edit Modal
  const radioModal = document.getElementById('radio-modal');
  const radioModalCloseBtn = document.getElementById('radio-modal-close-btn');
  const radioModalSlot = document.getElementById('radio-modal-slot');
  const radioModalName = document.getElementById('radio-modal-name');
  const radioModalUrl = document.getElementById('radio-modal-url');
  const radioModalTestBtn = document.getElementById('radio-modal-test-btn');
  const radioModalSaveBtn = document.getElementById('radio-modal-save-btn');

  // Spotify View Elements
  const spotifyHeading = document.getElementById('spotify-view-heading');
  const spotifySubtext = document.getElementById('spotify-view-subtext');
  const spotifyOpenNpBtn = document.getElementById('spotify-open-np-btn');

  // CD View Elements
  const cdStatusLabel = document.getElementById('cd-status-label');
  const cdPlayAllBtn = document.getElementById('cd-play-all-btn');
  const cdRefreshBtn = document.getElementById('cd-refresh-btn');
  const cdEjectBtn = document.getElementById('cd-eject-btn');
  const cdTrackList = document.getElementById('cd-track-list');

  // Podcasts View Elements
  const podcastBackBtn = document.getElementById('podcast-back-btn');
  const podcastStatusLabel = document.getElementById('podcast-status-label');
  const podcastAddBtn = document.getElementById('podcast-add-btn');
  const podcastRefreshBtn = document.getElementById('podcast-refresh-btn');
  const podcastHelpToggle = document.getElementById('podcast-help-toggle');
  const podcastHelpBox = document.getElementById('podcast-help-box');
  const podcastHelpClose = document.getElementById('podcast-help-close');
  const podcastList = document.getElementById('podcast-list');

  // Podcast Modal
  const podcastModal = document.getElementById('podcast-modal');
  const podcastModalCloseBtn = document.getElementById('podcast-modal-close-btn');
  const podcastModalName = document.getElementById('podcast-modal-name');
  const podcastModalUrl = document.getElementById('podcast-modal-url');
  const podcastModalSaveBtn = document.getElementById('podcast-modal-save-btn');
  const samplePillBtns = document.querySelectorAll('.sample-pill-btn');

  // In-App Settings View Elements
  const settingDisplayMode = document.getElementById('setting-display-mode');
  const settingScreensaverEnabled = document.getElementById('setting-screensaver-enabled');
  const settingPreventWhilePlaying = document.getElementById('setting-prevent-while-playing');
  const settingIdleTimeout = document.getElementById('setting-idle-timeout');
  const timeoutDecBtn = document.getElementById('timeout-dec-btn');
  const timeoutIncBtn = document.getElementById('timeout-inc-btn');
  const settingSelectedClock = document.getElementById('setting-selected-clock');
  const settingTestScreensaverBtn = document.getElementById('setting-test-screensaver-btn');
  const settingRadioList = document.getElementById('setting-radio-list');
  const settingPodcastList = document.getElementById('setting-podcast-list');
  const settingAddPodcastBtn = document.getElementById('setting-add-podcast-btn');
  const settingInfoDisplayUrl = document.getElementById('setting-info-display-url');
  const settingInfoClockUrl = document.getElementById('setting-info-clock-url');
  const settingVolumioStatusHint = document.getElementById('setting-volumio-status-hint');
  const settingReconnectBtn = document.getElementById('setting-reconnect-btn');
  const settingsToggleAllBtn = document.getElementById('settings-toggle-all-btn');
  const settingsToggleAllText = document.getElementById('settings-toggle-all-text');
  const saveSettingsBtnTop = document.getElementById('save-settings-btn-top');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const summarySetting1 = document.getElementById('summary-setting-1');
  const summarySetting2 = document.getElementById('summary-setting-2');
  const summarySetting3 = document.getElementById('summary-setting-3');
  const summarySetting4 = document.getElementById('summary-setting-4');
  const summarySetting5 = document.getElementById('summary-setting-5');
  const summarySetting6 = document.getElementById('summary-setting-6');

  // Fullscreen Now Playing Elements
  const npAlbumArt = document.getElementById('np-album-art');
  const npArtFallback = document.getElementById('np-art-fallback');
  const npSourceBadge = document.getElementById('np-source-badge');
  const npStatusBadge = document.getElementById('np-status-badge');
  const npTitle = document.getElementById('np-title');
  const npArtist = document.getElementById('np-artist');
  const npAlbum = document.getElementById('np-album');
  const npProgressContainer = document.getElementById('np-progress-container');
  const npSeekSlider = document.getElementById('np-seek-slider');
  const npTimeCurrent = document.getElementById('np-time-current');
  const npTimeTotal = document.getElementById('np-time-total');
  const npPrevBtn = document.getElementById('np-prev-btn');
  const npPlayBtn = document.getElementById('np-play-btn');
  const npIconPlay = document.getElementById('np-icon-play');
  const npIconPause = document.getElementById('np-icon-pause');
  const npNextBtn = document.getElementById('np-next-btn');
  const npStopBtn = document.getElementById('np-stop-btn');

  // Persistent Bottom Bar Elements
  const bottomTrackTrigger = document.getElementById('bottom-track-trigger');
  const bottomAlbumArt = document.getElementById('bottom-album-art');
  const bottomArtFallback = document.getElementById('bottom-art-fallback');
  const bottomTrackTitle = document.getElementById('bottom-track-title');
  const bottomTrackArtist = document.getElementById('bottom-track-artist');

  const btnPrev = document.getElementById('btn-prev');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const barIconPlay = document.getElementById('bar-icon-play');
  const barIconPause = document.getElementById('bar-icon-pause');
  const btnNext = document.getElementById('btn-next');
  const btnStop = document.getElementById('btn-stop');

  const btnMute = document.getElementById('btn-mute');
  const iconVolOn = document.getElementById('icon-vol-on');
  const iconVolMuted = document.getElementById('icon-vol-muted');
  const btnVolDown = document.getElementById('btn-vol-down');
  const btnVolUp = document.getElementById('btn-vol-up');
  const volumeSlider = document.getElementById('volume-slider');
  const volumeValue = document.getElementById('volume-value');

  // Toast & Screensaver Elements
  const appToast = document.getElementById('app-toast');
  const screensaverEl = document.getElementById('screensaver');
  const clockFrameEl = document.getElementById('clock-frame');
  const screensaverFallbackEl = document.getElementById('screensaver-fallback');
  const screensaverFallbackClockEl = document.getElementById('screensaver-fallback-clock');
  const screensaverFallbackNoteEl = document.getElementById('screensaver-fallback-note');
  const screensaverWakeLayer = document.getElementById('screensaver-wake-layer');
  const screensaverToolbar = document.getElementById('screensaver-toolbar');
  const screensaverCustomizeBtn = document.getElementById('screensaver-customize-btn');
  const screensaverSettingsBtn = document.getElementById('screensaver-settings-btn');
  const screensaverVolumioLink = document.getElementById('screensaver-volumio-link');
  const screensaverExitBtn = document.getElementById('screensaver-exit-btn');

  // ==========================================================================
  // Application State
  // ==========================================================================

  let currentView = 'home';
  let displayMode = DEFAULT_DISPLAY_MODE;
  let screensaverEnabled = DEFAULT_SCREENSAVER_ENABLED;
  let preventScreensaverWhilePlaying = true;
  let idleTimeoutSec = DEFAULT_IDLE_TIMEOUT_SEC;
  let idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_SEC * 1000;
  let selectedClock = DEFAULT_CLOCK_FILE;
  let availableClocks = [DEFAULT_CLOCK_FILE];
  let radioStations = DEFAULT_RADIO_STATIONS.slice();
  let podcastFeeds = [];
  let activeRadioUri = '';

  let idleTimerId = null;
  let toolbarHideTimerId = null;
  let isScreensaverActive = false;
  let isClockInteractive = false;
  let manualSleepTimestamp = 0;
  let toastTimeoutId = null;
  let socketInitialized = false;

  let socket = null;
  let volumioState = {
    status: 'stop',
    service: '',
    title: '',
    artist: '',
    album: '',
    albumart: '',
    uri: '',
    seek: 0,
    duration: 0,
    volume: 50,
    mute: false
  };

  let lastWakeStatus = '';
  let lastWakeTrackKey = '';
  let volumeDebounceTimer = null;
  let isDraggingVolume = false;
  let activeBrowseContext = null; // 'cd' | 'podcasts' | 'volumio-radio'
  let cdTracksCache = [];
  let volumioPodcastShowsCache = [];
  let viewingPodcastEpisodes = false;

  // ==========================================================================
  // Live Clocks & In-App Toast
  // ==========================================================================

  function updateClocks() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const formatted = hh + ':' + mm;

    if (headerClockEl) {
      headerClockEl.textContent = formatted;
    }
    if (screensaverFallbackClockEl) {
      screensaverFallbackClockEl.textContent = formatted;
    }
  }

  function showToast(message) {
    if (!appToast) {
      return;
    }
    appToast.textContent = message;
    appToast.classList.remove('hidden');

    if (toastTimeoutId !== null) {
      clearTimeout(toastTimeoutId);
    }
    toastTimeoutId = setTimeout(function () {
      appToast.classList.add('hidden');
    }, 2800);
  }

  // ==========================================================================
  // View Router
  // ==========================================================================

  function navigateToView(viewName) {
    if (!views[viewName]) {
      return;
    }

    currentView = viewName;

    Object.keys(views).forEach(function (key) {
      if (views[key]) {
        views[key].classList.toggle('active', key === viewName);
      }
    });

    if (viewContainer) {
      viewContainer.scrollTop = 0;
    }

    if (homeBtn) {
      homeBtn.classList.toggle('hidden', viewName === 'home');
    }

    if (viewTitleEl) {
      viewTitleEl.textContent = VIEW_TITLES[viewName] || 'CoreZoneDisplay';
    }

    if (viewName === 'radio') {
      renderRadioPresets();
    } else if (viewName === 'cd') {
      requestCdLibrary();
    } else if (viewName === 'podcasts') {
      renderPodcastsHome();
    } else if (viewName === 'settings') {
      populateSettingsForm();
    }
  }

  // ==========================================================================
  // Config API (/api/config) & Clock Submodule Mounting with Fallback Check
  // ==========================================================================

  /**
   * Ensures ClockWeb's MainClockSelector.html has a default clock pre-selected
   * in localStorage so it auto-launches into a full-screen running clock on first run.
   */
  function ensureClockWebAutoLaunchDefaults() {
    try {
      const savedClock = localStorage.getItem('clockweb_saved_clock_id_v1');
      if (!savedClock || savedClock === 'casio-gac-2500-3a') {
        localStorage.setItem('clockweb_saved_clock_id_v1', 'casio-vector-bw-strap');
      }
      if (localStorage.getItem('clockweb_auto_launch_v1') === null) {
        localStorage.setItem('clockweb_auto_launch_v1', 'true');
      }
    } catch (e) {
      // Ignore storage access errors
    }
  }

  function applyClockSource(clockFileName) {
    ensureClockWebAutoLaunchDefaults();

    const resolvedClock = (clockFileName || DEFAULT_CLOCK_FILE).trim() || DEFAULT_CLOCK_FILE;
    selectedClock = resolvedClock;
    const targetSrc = '/clocks/' + resolvedClock;

    // Fetch targetSrc and verify it is a genuine clock HTML page (not index.html fallback)
    fetch(targetSrc, { method: 'GET', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.text();
      })
      .then(function (htmlText) {
        if (
          !htmlText ||
          htmlText.indexOf('CoreZoneDisplay Controller') !== -1 ||
          htmlText.indexOf('id="main-ui"') !== -1
        ) {
          throw new Error('Clock submodule not mounted on server');
        }
        if (clockFrameEl) {
          clockFrameEl.classList.remove('hidden');
          if (clockFrameEl.getAttribute('src') !== targetSrc) {
            clockFrameEl.setAttribute('src', targetSrc);
          }
        }
        if (screensaverFallbackEl) {
          screensaverFallbackEl.classList.add('hidden');
        }
        if (screensaverCustomizeBtn) {
          screensaverCustomizeBtn.classList.remove('hidden');
        }
      })
      .catch(function () {
        if (clockFrameEl) {
          clockFrameEl.classList.add('hidden');
          clockFrameEl.setAttribute('src', 'about:blank');
        }
        if (screensaverFallbackEl) {
          screensaverFallbackEl.classList.remove('hidden');
        }
        if (screensaverCustomizeBtn) {
          screensaverCustomizeBtn.classList.add('hidden');
        }
        if (screensaverFallbackNoteEl) {
          screensaverFallbackNoteEl.textContent =
            'Tap anywhere to return to player';
        }
      });
  }

  function applyDisplayMode(mode) {
    displayMode =
      mode === 'full_ui' || mode === 'screensaver_only'
        ? mode
        : DEFAULT_DISPLAY_MODE;

    if (screensaverVolumioLink) {
      screensaverVolumioLink.setAttribute('href', VOLUMIO_BACKEND_URL);
    }

    if (displayMode === 'screensaver_only') {
      // Pure standalone clock mode: hide main dashboard behind screensaver and show clock immediately
      if (mainUiEl) {
        mainUiEl.classList.add('hidden');
      }
      if (screensaverExitBtn) {
        screensaverExitBtn.classList.add('hidden');
      }
      showScreensaver();
      revealFloatingToolbar();
    } else {
      // Full UI + Screensaver mode: show dashboard and initialize Volumio Socket.IO
      if (mainUiEl) {
        mainUiEl.classList.remove('hidden');
      }
      if (!socketInitialized) {
        socketInitialized = true;
        initVolumioSocket();
      }
      if (isScreensaverActive) {
        hideScreensaver();
      }
      resetIdleTimer();
    }
  }

  function applyConfigObject(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      return;
    }

    const newMode =
      cfg.displayMode === 'full_ui' || cfg.displayMode === 'screensaver_only'
        ? cfg.displayMode
        : DEFAULT_DISPLAY_MODE;

    screensaverEnabled =
      cfg.screensaverEnabled !== undefined
        ? Boolean(cfg.screensaverEnabled)
        : DEFAULT_SCREENSAVER_ENABLED;

    preventScreensaverWhilePlaying =
      cfg.preventScreensaverWhilePlaying !== undefined
        ? Boolean(cfg.preventScreensaverWhilePlaying)
        : true;

    const parsedSec = Number(cfg.idleTimeoutSec);
    idleTimeoutSec =
      !isNaN(parsedSec) && parsedSec > 0 ? parsedSec : DEFAULT_IDLE_TIMEOUT_SEC;
    idleTimeoutMs = idleTimeoutSec * 1000;

    if (Array.isArray(cfg.availableClocks) && cfg.availableClocks.length > 0) {
      availableClocks = cfg.availableClocks.slice();
    }

    applyClockSource(cfg.selectedClock || DEFAULT_CLOCK_FILE);

    if (Array.isArray(cfg.radioStations) && cfg.radioStations.length > 0) {
      radioStations = cfg.radioStations.map(function (st, idx) {
        const url = String(st.url || st.uri || '').trim();
        return {
          id: st.id || idx + 1,
          name: String(st.name || 'Station ' + (idx + 1)).trim(),
          url: url,
          uri: url
        };
      });
    }

    if (Array.isArray(cfg.podcastFeeds)) {
      podcastFeeds = cfg.podcastFeeds.slice();
    }

    if (tileBadgeRadio) {
      tileBadgeRadio.textContent = radioStations.length + ' Presets';
    }

    applyDisplayMode(newMode);

    renderRadioPresets();
    if (currentView === 'settings') {
      populateSettingsForm();
    }
    if (currentView === 'podcasts' && !viewingPodcastEpisodes) {
      renderPodcastsHome();
    }
  }

  // Last settings applied to the screen; used to apply only real changes
  let lastAppliedConfigJson = '';
  const CONFIG_POLL_INTERVAL_MS = 5000;

  // Applies settings only when they differ from what is already on screen,
  // so the live updates below don't interrupt the user for no reason.
  function applyConfigIfChanged(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      return;
    }
    const json = JSON.stringify(cfg);
    if (json === lastAppliedConfigJson) {
      return;
    }
    lastAppliedConfigJson = json;
    applyConfigObject(cfg);
  }

  // Picks up changes saved from the Volumio settings page (or another screen)
  function pollPluginConfig() {
    fetch('/api/config', { cache: 'no-store' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (cfg) {
        if (cfg) {
          applyConfigIfChanged(cfg);
        }
      })
      .catch(function () {
        // Server briefly unreachable; try again next interval
      });
  }

  function fetchPluginConfig() {
    return fetch('/api/config', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function (cfg) {
        applyConfigIfChanged(cfg);
      })
      .catch(function (err) {
        console.warn('CoreZoneDisplay: /api/config fallback:', err.message);
        applyClockSource(DEFAULT_CLOCK_FILE);
        applyDisplayMode(DEFAULT_DISPLAY_MODE);
        renderRadioPresets();
      });
  }

  function savePluginConfig(partialPayload, successMsg) {
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partialPayload)
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function (result) {
        if (result && result.config) {
          applyConfigIfChanged(result.config);
        }
        showToast(successMsg || 'Settings saved');
        return result;
      })
      .catch(function (err) {
        showToast('Failed to save: ' + err.message);
      });
  }

  // ==========================================================================
  // In-App Settings View (Collapsible Close/Open Mode & Live Summaries)
  // ==========================================================================

  function getSettingsAccordions() {
    return Array.prototype.slice.call(
      document.querySelectorAll('#view-settings details.settings-accordion')
    );
  }

  function syncSettingsToggleAllButton() {
    if (!settingsToggleAllBtn || !settingsToggleAllText) {
      return;
    }
    const accordions = getSettingsAccordions();
    const allOpen =
      accordions.length > 0 &&
      accordions.every(function (d) {
        return d.open;
      });
    settingsToggleAllBtn.setAttribute('aria-expanded', String(allOpen));
    settingsToggleAllText.textContent = allOpen
      ? 'Close All Settings'
      : 'Open All Settings';
  }

  function updateSettingsSummaries() {
    const modeVal =
      (settingDisplayMode && settingDisplayMode.value) || displayMode || DEFAULT_DISPLAY_MODE;
    if (summarySetting1) {
      summarySetting1.textContent =
        modeVal === 'full_ui'
          ? '(Full Menu + Screensaver)'
          : '(Screensaver Only · Clock Mode)';
    }

    const enabledVal = settingScreensaverEnabled
      ? Boolean(settingScreensaverEnabled.checked)
      : Boolean(screensaverEnabled);
    const preventVal = settingPreventWhilePlaying
      ? Boolean(settingPreventWhilePlaying.checked)
      : Boolean(preventScreensaverWhilePlaying);
    const timeoutVal =
      (settingIdleTimeout && settingIdleTimeout.value) || String(idleTimeoutSec);
    if (summarySetting2) {
      const playNotice = preventVal ? ' · Suppressed on Play' : '';
      summarySetting2.textContent =
        '(' + (enabledVal ? 'Enabled' : 'Disabled') + ' · ' + timeoutVal + 's' + playNotice + ')';
    }

    const clockVal =
      (settingSelectedClock && settingSelectedClock.value) || selectedClock || DEFAULT_CLOCK_FILE;
    if (summarySetting3) {
      summarySetting3.textContent = '(' + clockVal + ')';
    }

    const nameInputs = document.querySelectorAll('.setting-radio-name');
    const stationNames = [];
    for (var i = 0; i < 5; i++) {
      const def = DEFAULT_RADIO_STATIONS[i];
      const n =
        nameInputs[i] && nameInputs[i].value.trim()
          ? nameInputs[i].value.trim()
          : (radioStations[i] && radioStations[i].name) || def.name;
      stationNames.push(n);
      const presetPreviewEl = document.getElementById('preset-summary-' + i);
      if (presetPreviewEl) {
        presetPreviewEl.textContent = '(' + n + ')';
      }
    }
    if (summarySetting4) {
      summarySetting4.textContent =
        '(5 Presets: ' + stationNames.slice(0, 3).join(', ') + '…)';
    }

    if (summarySetting5) {
      if (podcastFeeds.length === 0) {
        summarySetting5.textContent = '(0 RSS Feeds)';
      } else {
        const feedNames = podcastFeeds
          .slice(0, 2)
          .map(function (f) {
            return f.name;
          })
          .join(', ');
        summarySetting5.textContent =
          '(' + podcastFeeds.length + ' Feed' + (podcastFeeds.length > 1 ? 's' : '') + ': ' + feedNames + ')';
      }
    }

    const isVolOnline = Boolean(socket && socket.connected);
    if (summarySetting6) {
      summarySetting6.textContent =
        '(Port ' + (window.location.port || '4004') + ' · Volumio ' + (isVolOnline ? 'Online' : 'Offline') + ')';
    }
    if (settingVolumioStatusHint) {
      settingVolumioStatusHint.textContent =
        'Volumio (' + VOLUMIO_BACKEND_URL + '): ' + (isVolOnline ? 'Connected (Online)' : 'Offline');
    }
  }

  function renderSettingsPodcastList() {
    if (!settingPodcastList) {
      return;
    }
    settingPodcastList.innerHTML = '';
    if (podcastFeeds.length === 0) {
      settingPodcastList.innerHTML =
        '<div class="settings-hint">No custom Podcast RSS feeds saved yet. Tap "+ Add Podcast RSS" above to add one.</div>';
      return;
    }
    podcastFeeds.forEach(function (feed, idx) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      row.innerHTML =
        '<div class="settings-label-group">' +
          '<span class="settings-label"></span>' +
          '<span class="settings-hint"></span>' +
        '</div>' +
        '<button type="button" class="radio-edit-chip">Remove</button>';
      row.querySelector('.settings-label').textContent = feed.name;
      row.querySelector('.settings-hint').textContent = feed.rssUrl;
      row.querySelector('.radio-edit-chip').addEventListener('click', function () {
        const remaining = podcastFeeds.filter(function (_, i) {
          return i !== idx;
        });
        savePluginConfig({ podcastFeeds: remaining }, 'Removed podcast feed');
      });
      settingPodcastList.appendChild(row);
    });
  }

  function populateSettingsForm() {
    if (settingDisplayMode) {
      settingDisplayMode.value = displayMode || DEFAULT_DISPLAY_MODE;
    }
    if (settingScreensaverEnabled) {
      settingScreensaverEnabled.checked = Boolean(screensaverEnabled);
    }
    if (settingPreventWhilePlaying) {
      settingPreventWhilePlaying.checked = Boolean(preventScreensaverWhilePlaying);
    }
    if (settingIdleTimeout) {
      settingIdleTimeout.value = String(idleTimeoutSec);
    }

    if (settingSelectedClock) {
      settingSelectedClock.innerHTML = '';
      const clocks = availableClocks.slice();
      if (clocks.indexOf(selectedClock) === -1) {
        clocks.push(selectedClock);
      }
      clocks.forEach(function (clockName) {
        const opt = document.createElement('option');
        opt.value = clockName;
        opt.textContent = clockName;
        if (clockName === selectedClock) {
          opt.selected = true;
        }
        settingSelectedClock.appendChild(opt);
      });
    }

    if (settingRadioList) {
      settingRadioList.innerHTML = '';
      for (var i = 0; i < 5; i++) {
        (function (idx) {
          const preset = radioStations[idx] || DEFAULT_RADIO_STATIONS[idx];
          const detailsEl = document.createElement('details');
          detailsEl.className = 'radio-preset-accordion';
          detailsEl.innerHTML =
            '<summary class="radio-preset-summary">' +
              '<div class="settings-summary-main">' +
                '<span class="settings-radio-badge">PRESET ' + (idx + 1) + '</span>' +
                '<span class="settings-summary-preview" id="preset-summary-' + idx + '"></span>' +
              '</div>' +
              '<span class="settings-summary-chevron" aria-hidden="true">▸</span>' +
            '</summary>' +
            '<div class="radio-preset-body">' +
              '<input type="text" class="settings-input setting-radio-name" data-idx="' + idx + '" placeholder="Station Name" aria-label="Preset ' + (idx + 1) + ' Name" />' +
              '<input type="url" class="settings-input setting-radio-url" data-idx="' + idx + '" placeholder="https://stream-url..." aria-label="Preset ' + (idx + 1) + ' Stream URL" />' +
              '<button type="button" class="toolbar-btn setting-radio-test-btn" data-idx="' + idx + '">▶ Test</button>' +
            '</div>';

          const nameInput = detailsEl.querySelector('.setting-radio-name');
          const urlInput = detailsEl.querySelector('.setting-radio-url');
          const testBtn = detailsEl.querySelector('.setting-radio-test-btn');
          const sumEl = detailsEl.querySelector('#preset-summary-' + idx);

          nameInput.value = preset.name || '';
          urlInput.value = preset.url || '';
          sumEl.textContent = '(' + (preset.name || 'Station ' + (idx + 1)) + ')';

          nameInput.addEventListener('input', updateSettingsSummaries);
          urlInput.addEventListener('input', updateSettingsSummaries);
          testBtn.addEventListener('click', function () {
            const n = nameInput.value.trim() || 'Preset ' + (idx + 1);
            const u = urlInput.value.trim();
            if (!u) {
              showToast('Enter a stream URL to test');
              return;
            }
            showToast('Testing: ' + n);
            playRadioStation({ name: n, uri: u });
          });

          settingRadioList.appendChild(detailsEl);
        })(i);
      }
    }

    renderSettingsPodcastList();

    const origin = window.location.origin || ('http://' + VOLUMIO_HOST + ':4004');
    if (settingInfoDisplayUrl) {
      settingInfoDisplayUrl.value = origin + '/';
    }
    if (settingInfoClockUrl) {
      settingInfoClockUrl.value = origin + '/clocks/digital/settings.html';
    }

    updateSettingsSummaries();
    syncSettingsToggleAllButton();
  }

  function handleSaveSettingsFromView() {
    const newDisplayMode =
      settingDisplayMode && settingDisplayMode.value === 'full_ui'
        ? 'full_ui'
        : settingDisplayMode && settingDisplayMode.value === 'screensaver_only'
        ? 'screensaver_only'
        : displayMode;

    const newEnabled = settingScreensaverEnabled
      ? Boolean(settingScreensaverEnabled.checked)
      : screensaverEnabled;

    const newTimeoutSec = Math.max(
      5,
      parseInt(settingIdleTimeout && settingIdleTimeout.value, 10) || DEFAULT_IDLE_TIMEOUT_SEC
    );

    const newClock =
      (settingSelectedClock && settingSelectedClock.value) || DEFAULT_CLOCK_FILE;

    const updatedStations = radioStations.slice();
    const nameInputs = document.querySelectorAll('.setting-radio-name');
    const urlInputs = document.querySelectorAll('.setting-radio-url');

    for (var i = 0; i < 5; i++) {
      const def = DEFAULT_RADIO_STATIONS[i];
      const nameVal =
        nameInputs[i] && nameInputs[i].value.trim() ? nameInputs[i].value.trim() : def.name;
      const urlVal =
        urlInputs[i] && urlInputs[i].value.trim() ? urlInputs[i].value.trim() : def.url;
      updatedStations[i] = {
        id: i + 1,
        name: nameVal,
        url: urlVal,
        uri: urlVal
      };
    }

    const newPreventPlaying = settingPreventWhilePlaying
      ? Boolean(settingPreventWhilePlaying.checked)
      : preventScreensaverWhilePlaying;

    savePluginConfig(
      {
        displayMode: newDisplayMode,
        screensaverEnabled: newEnabled,
        preventScreensaverWhilePlaying: newPreventPlaying,
        idleTimeoutSec: newTimeoutSec,
        selectedClock: newClock,
        radioStations: updatedStations
      },
      'Settings saved & synced with Volumio'
    );
  }

  // ==========================================================================
  // Radio View: Presets, Quick-Add Modal & Volumio My Web Radios Import
  // ==========================================================================

  function extractStreamHost(urlStr) {
    try {
      const parsed = new URL(urlStr);
      return parsed.hostname.replace(/^www\./, '');
    } catch (e) {
      return 'Live Stream';
    }
  }

  function openRadioModal(slotIndex, prefillName, prefillUrl) {
    if (!radioModal) {
      return;
    }

    if (radioModalSlot) {
      radioModalSlot.innerHTML = '';
      for (var i = 0; i < Math.max(5, radioStations.length); i++) {
        const current = radioStations[i];
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent =
          'Preset ' + (i + 1) + (current && current.name ? ' (' + current.name + ')' : '');
        radioModalSlot.appendChild(opt);
      }
      const addNewOpt = document.createElement('option');
      addNewOpt.value = '-1';
      addNewOpt.textContent = '+ Add as New Preset Slot';
      radioModalSlot.appendChild(addNewOpt);

      radioModalSlot.value = String(slotIndex !== undefined ? slotIndex : -1);
    }

    const existing = slotIndex >= 0 && radioStations[slotIndex] ? radioStations[slotIndex] : null;
    if (radioModalName) {
      radioModalName.value =
        prefillName !== undefined ? prefillName : existing ? existing.name : '';
    }
    if (radioModalUrl) {
      radioModalUrl.value =
        prefillUrl !== undefined ? prefillUrl : existing ? existing.url : '';
    }

    radioModal.classList.remove('hidden');
  }

  function closeRadioModal() {
    if (radioModal) {
      radioModal.classList.add('hidden');
    }
  }

  function renderRadioPresets() {
    if (!radioPresetsGrid) {
      return;
    }

    radioPresetsGrid.innerHTML = '';

    radioStations.forEach(function (station, index) {
      const card = document.createElement('div');
      card.className = 'radio-preset-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      const isPlayingThisStation =
        volumioState.status === 'play' &&
        ((activeRadioUri && activeRadioUri === station.uri) ||
          (volumioState.uri && volumioState.uri === station.uri) ||
          (volumioState.title && volumioState.title.toLowerCase() === station.name.toLowerCase()));

      if (isPlayingThisStation) {
        card.classList.add('active');
      }

      const numStr = String(index + 1).padStart(2, '0');
      const hostLabel = extractStreamHost(station.uri);

      card.innerHTML =
        '<div class="radio-card-header">' +
          '<span class="radio-preset-num">PRESET ' + numStr + '</span>' +
          '<div class="radio-card-header-right">' +
            '<span class="radio-live-indicator">● ON AIR</span>' +
            '<button type="button" class="radio-edit-chip" title="Edit this station">Edit</button>' +
          '</div>' +
        '</div>' +
        '<div class="radio-card-body">' +
          '<span class="radio-preset-name"></span>' +
          '<span class="radio-preset-host"></span>' +
        '</div>';

      card.querySelector('.radio-preset-name').textContent = station.name;
      card.querySelector('.radio-preset-host').textContent = hostLabel;

      const editChip = card.querySelector('.radio-edit-chip');
      editChip.addEventListener('click', function (evt) {
        evt.stopPropagation();
        openRadioModal(index);
      });

      card.addEventListener('click', function () {
        playRadioStation(station);
      });

      radioPresetsGrid.appendChild(card);
    });
  }

  function stopAndReplacePlay(payload) {
    if (!socket || !socket.connected) {
      showToast('Volumio is offline (port 3000) — cannot start playback');
      return;
    }

    socket.emit('stop');
    socket.emit('clearQueue');

    setTimeout(function () {
      socket.emit('replaceAndPlay', payload);
    }, 120);
  }

  function playRadioStation(station) {
    if (!station || !station.uri) {
      return;
    }

    activeRadioUri = station.uri;
    renderRadioPresets();

    stopAndReplacePlay({
      service: 'webradio',
      type: 'webradio',
      title: station.name,
      uri: station.uri
    });
  }

  function loadVolumioMyWebRadios() {
    if (!socket || !socket.connected) {
      showToast('Connect to Volumio first to load My Web Radios');
      return;
    }
    activeBrowseContext = 'volumio-radio';
    if (volumioRadiosSection) {
      volumioRadiosSection.classList.remove('hidden');
    }
    if (volumioRadiosList) {
      volumioRadiosList.innerHTML =
        '<div class="empty-state-box"><strong>Loading Volumio My Web Radios...</strong></div>';
    }
    socket.emit('browseLibrary', { uri: 'radio/myWebRadio' });
  }

  // ==========================================================================
  // Podcasts View: Custom RSS Feeds + Volumio browseLibrary
  // ==========================================================================

  function openPodcastModal() {
    if (!podcastModal) {
      return;
    }
    if (podcastModalName) podcastModalName.value = '';
    if (podcastModalUrl) podcastModalUrl.value = '';
    podcastModal.classList.remove('hidden');
  }

  function closePodcastModal() {
    if (podcastModal) {
      podcastModal.classList.add('hidden');
    }
  }

  function renderPodcastsHome() {
    viewingPodcastEpisodes = false;
    if (podcastBackBtn) {
      podcastBackBtn.classList.add('hidden');
    }
    if (podcastStatusLabel) {
      podcastStatusLabel.textContent = 'Podcast Shows & Saved RSS Feeds';
    }

    // Also ask Volumio for any installed podcast plugin feeds in the background
    if (socket && socket.connected && activeBrowseContext !== 'podcasts') {
      activeBrowseContext = 'podcasts';
      socket.emit('browseLibrary', { uri: 'podcasts' });
    }

    renderCombinedPodcastShows();
  }

  function renderCombinedPodcastShows() {
    if (!podcastList || viewingPodcastEpisodes) {
      return;
    }

    podcastList.innerHTML = '';

    // 1. Render saved custom RSS feeds from config.json
    podcastFeeds.forEach(function (feed, idx) {
      const btn = document.createElement('div');
      btn.className = 'media-item-btn';
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');

      btn.innerHTML =
        '<div class="media-item-left">' +
          '<span class="media-item-index">RSS</span>' +
          '<div class="media-item-text">' +
            '<span class="media-item-title"></span>' +
            '<span class="media-item-sub"></span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="radio-edit-chip" title="Remove feed">Remove</button>';

      btn.querySelector('.media-item-title').textContent = feed.name;
      btn.querySelector('.media-item-sub').textContent = feed.rssUrl;

      btn.querySelector('.radio-edit-chip').addEventListener('click', function (evt) {
        evt.stopPropagation();
        const remaining = podcastFeeds.filter(function (_, i) {
          return i !== idx;
        });
        savePluginConfig({ podcastFeeds: remaining }, 'Removed podcast feed');
      });

      btn.addEventListener('click', function () {
        loadPodcastRssEpisodes(feed);
      });

      podcastList.appendChild(btn);
    });

    // 2. Render any shows discovered from Volumio's Podcasts plugin
    volumioPodcastShowsCache.forEach(function (item) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'media-item-btn';
      btn.innerHTML =
        '<div class="media-item-left">' +
          '<span class="media-item-index">▸</span>' +
          '<div class="media-item-text">' +
            '<span class="media-item-title"></span>' +
            '<span class="media-item-sub">Volumio Podcast Library</span>' +
          '</div>' +
        '</div>';

      btn.querySelector('.media-item-title').textContent = item.title || 'Podcast Show';

      btn.addEventListener('click', function () {
        if (socket && socket.connected) {
          viewingPodcastEpisodes = true;
          activeBrowseContext = 'podcasts-episodes';
          if (podcastBackBtn) podcastBackBtn.classList.remove('hidden');
          if (podcastStatusLabel) podcastStatusLabel.textContent = item.title || 'Episodes';
          socket.emit('browseLibrary', { uri: item.uri });
        }
      });

      podcastList.appendChild(btn);
    });

    // 3. Friendly Empty State Guide Card if no feeds exist yet
    if (podcastFeeds.length === 0 && volumioPodcastShowsCache.length === 0) {
      podcastList.innerHTML =
        '<div class="empty-state-box">' +
          '<strong>No Podcasts Added Yet</strong>' +
          '<div class="empty-state-options">' +
            '<p>• <strong>Option 1:</strong> Tap <strong>+ Add Podcast (RSS URL)</strong> above to paste any Podcast RSS feed or pick a 1-tap sample feed.</p>' +
            '<p>• <strong>Option 2:</strong> Install/configure the Podcasts plugin in Volumio, or stream directly from your phone via <strong>Spotify Connect</strong>.</p>' +
          '</div>' +
        '</div>';
    }
  }

  function loadPodcastRssEpisodes(feed) {
    if (!feed || !feed.rssUrl || !podcastList) {
      return;
    }

    viewingPodcastEpisodes = true;
    if (podcastBackBtn) {
      podcastBackBtn.classList.remove('hidden');
    }
    if (podcastStatusLabel) {
      podcastStatusLabel.textContent = 'Loading ' + feed.name + '...';
    }

    podcastList.innerHTML =
      '<div class="empty-state-box"><strong>Fetching latest episodes...</strong><span>' +
      feed.rssUrl +
      '</span></div>';

    fetch('/api/podcasts/episodes?url=' + encodeURIComponent(feed.rssUrl), { cache: 'no-store' })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || data.status !== 'ok' || !Array.isArray(data.episodes)) {
          throw new Error((data && data.message) || 'Invalid RSS response');
        }

        if (podcastStatusLabel) {
          podcastStatusLabel.textContent =
            (feed.name || data.feedTitle) + ' (' + data.episodes.length + ' Latest Episodes)';
        }

        if (data.episodes.length === 0) {
          podcastList.innerHTML =
            '<div class="empty-state-box"><strong>No playable audio episodes found in RSS feed</strong></div>';
          return;
        }

        podcastList.innerHTML = '';
        data.episodes.forEach(function (ep, idx) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'media-item-btn';
          btn.innerHTML =
            '<div class="media-item-left">' +
              '<span class="media-item-index">' + String(idx + 1).padStart(2, '0') + '</span>' +
              '<div class="media-item-text">' +
                '<span class="media-item-title"></span>' +
                '<span class="media-item-sub"></span>' +
              '</div>' +
            '</div>' +
            '<span class="media-item-action-chip">▶ Play</span>';

          btn.querySelector('.media-item-title').textContent = ep.title;
          const metaParts = [];
          if (ep.pubDate) metaParts.push(ep.pubDate.replace(/\s+\d{2}:\d{2}:\d{2}.*$/, ''));
          if (ep.duration) metaParts.push(ep.duration);
          btn.querySelector('.media-item-sub').textContent =
            metaParts.join(' • ') || feed.name || 'Podcast Episode';

          btn.addEventListener('click', function () {
            showToast('Playing: ' + ep.title);
            stopAndReplacePlay({
              service: 'webradio',
              type: 'webradio',
              title: ep.title,
              artist: feed.name || data.feedTitle || 'Podcast',
              uri: ep.audioUrl
            });
          });

          podcastList.appendChild(btn);
        });
      })
      .catch(function (err) {
        if (podcastStatusLabel) {
          podcastStatusLabel.textContent = 'RSS Error';
        }
        podcastList.innerHTML =
          '<div class="empty-state-box"><strong>Could not load Podcast RSS feed</strong><span>' +
          err.message +
          '</span></div>';
      });
  }

  // ==========================================================================
  // CD Player & Volumio browseLibrary Handler
  // ==========================================================================

  function renderEmptyMediaList(container, title, subtitle) {
    if (!container) {
      return;
    }
    container.innerHTML =
      '<div class="empty-state-box">' +
        '<strong>' + title + '</strong>' +
        '<span>' + subtitle + '</span>' +
      '</div>';
  }

  function requestCdLibrary() {
    activeBrowseContext = 'cd';
    if (!socket || !socket.connected) {
      renderEmptyMediaList(
        cdTrackList,
        'Volumio Not Connected',
        'Connect to Volumio backend on port 3000 to browse CD tracks.'
      );
      return;
    }

    if (cdStatusLabel) {
      cdStatusLabel.textContent = 'Scanning Optical Disc...';
    }
    socket.emit('browseLibrary', { uri: 'cd' });
  }

  function extractBrowseItems(libraryData) {
    if (!libraryData || !libraryData.navigation || !Array.isArray(libraryData.navigation.lists)) {
      return [];
    }
    const items = [];
    libraryData.navigation.lists.forEach(function (list) {
      if (list && Array.isArray(list.items)) {
        list.items.forEach(function (item) {
          items.push(item);
        });
      }
    });
    return items;
  }

  function handlePushBrowseLibrary(libraryData) {
    const items = extractBrowseItems(libraryData);

    if (activeBrowseContext === 'cd') {
      cdTracksCache = items;
      if (cdStatusLabel) {
        cdStatusLabel.textContent = items.length
          ? 'Audio CD (' + items.length + ' Tracks)'
          : 'No Audio CD Detected';
      }

      if (!items.length) {
        renderEmptyMediaList(
          cdTrackList,
          'No Disc or Tracks Found',
          'Insert an audio CD into your optical drive and tap Reload.'
        );
        return;
      }

      cdTrackList.innerHTML = '';
      items.forEach(function (item, idx) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'media-item-btn';
        btn.innerHTML =
          '<div class="media-item-left">' +
            '<span class="media-item-index">' + String(idx + 1).padStart(2, '0') + '</span>' +
            '<div class="media-item-text">' +
              '<span class="media-item-title"></span>' +
              '<span class="media-item-sub"></span>' +
            '</div>' +
          '</div>' +
          '<span class="media-item-action-chip">▶ Play</span>';

        btn.querySelector('.media-item-title').textContent = item.title || 'Track ' + (idx + 1);
        btn.querySelector('.media-item-sub').textContent = item.artist || 'Audio CD';

        btn.addEventListener('click', function () {
          stopAndReplacePlay({
            service: item.service || 'cd',
            type: item.type || 'song',
            title: item.title || 'Track ' + (idx + 1),
            artist: item.artist || 'Audio CD',
            uri: item.uri
          });
        });

        cdTrackList.appendChild(btn);
      });
    } else if (activeBrowseContext === 'volumio-radio') {
      if (!volumioRadiosList) {
        return;
      }
      if (!items.length) {
        renderEmptyMediaList(
          volumioRadiosList,
          'No Stations Found in Volumio My Web Radios',
          'You can add any stream URL directly using "+ Add / Edit Stations" above.'
        );
        return;
      }

      volumioRadiosList.innerHTML = '';
      items.forEach(function (item, idx) {
        const card = document.createElement('div');
        card.className = 'media-item-btn';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.innerHTML =
          '<div class="media-item-left">' +
            '<span class="media-item-index">' + String(idx + 1).padStart(2, '0') + '</span>' +
            '<div class="media-item-text">' +
              '<span class="media-item-title"></span>' +
              '<span class="media-item-sub"></span>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="radio-edit-chip">+ Save to Preset</button>';

        card.querySelector('.media-item-title').textContent = item.title || 'Web Radio';
        card.querySelector('.media-item-sub').textContent = item.uri || 'Volumio Web Radio';

        card.querySelector('.radio-edit-chip').addEventListener('click', function (evt) {
          evt.stopPropagation();
          openRadioModal(-1, item.title || 'Web Radio', item.uri || '');
        });

        card.addEventListener('click', function () {
          playRadioStation({
            name: item.title || 'Web Radio',
            uri: item.uri
          });
        });

        volumioRadiosList.appendChild(card);
      });
    } else if (activeBrowseContext === 'podcasts') {
      volumioPodcastShowsCache = items;
      renderCombinedPodcastShows();
    } else if (activeBrowseContext === 'podcasts-episodes') {
      if (!podcastList) {
        return;
      }
      if (!items.length) {
        renderEmptyMediaList(podcastList, 'No Episodes Found', 'Tap Back to Shows');
        return;
      }
      podcastList.innerHTML = '';
      items.forEach(function (item, idx) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'media-item-btn';
        btn.innerHTML =
          '<div class="media-item-left">' +
            '<span class="media-item-index">' + String(idx + 1).padStart(2, '0') + '</span>' +
            '<div class="media-item-text">' +
              '<span class="media-item-title"></span>' +
              '<span class="media-item-sub">Volumio Podcast Episode</span>' +
            '</div>' +
          '</div>' +
          '<span class="media-item-action-chip">▶ Play</span>';

        btn.querySelector('.media-item-title').textContent = item.title || 'Episode ' + (idx + 1);
        btn.addEventListener('click', function () {
          stopAndReplacePlay({
            service: item.service || 'podcasts',
            type: item.type || 'song',
            title: item.title,
            artist: item.artist || 'Podcast',
            uri: item.uri
          });
        });
        podcastList.appendChild(btn);
      });
    }
  }

  // ==========================================================================
  // Watchdog Idle Timer, Screensaver & Floating Auto-Hiding Toolbar
  // ==========================================================================

  function clearIdleTimer() {
    if (idleTimerId !== null) {
      clearTimeout(idleTimerId);
      idleTimerId = null;
    }
  }

  function revealFloatingToolbar() {
    if (!screensaverToolbar) {
      return;
    }
    screensaverToolbar.classList.remove('toolbar-hidden');

    if (toolbarHideTimerId !== null) {
      clearTimeout(toolbarHideTimerId);
    }

    toolbarHideTimerId = setTimeout(function () {
      if (!isClockInteractive && screensaverToolbar) {
        screensaverToolbar.classList.add('toolbar-hidden');
      }
    }, TOOLBAR_AUTOHIDE_MS);
  }

  function setClockInteractiveMode(isInteractive) {
    isClockInteractive = Boolean(isInteractive);

    if (clockFrameEl) {
      clockFrameEl.classList.toggle('interactive', isClockInteractive);
    }
    if (screensaverWakeLayer) {
      screensaverWakeLayer.classList.toggle('hidden', isClockInteractive);
    }
    if (screensaverCustomizeBtn) {
      screensaverCustomizeBtn.classList.toggle('active-interactive', isClockInteractive);
      screensaverCustomizeBtn.innerHTML = isClockInteractive
        ? '<span>✓ Lock Clock</span>'
        : '<span>⚙ Change Clock</span>';
    }
    if (screensaverExitBtn) {
      screensaverExitBtn.classList.toggle(
        'hidden',
        displayMode === 'screensaver_only' || !isClockInteractive
      );
    }

    if (isClockInteractive) {
      if (screensaverToolbar) {
        screensaverToolbar.classList.remove('toolbar-hidden');
      }
      if (clockFrameEl && clockFrameEl.contentWindow) {
        try {
          clockFrameEl.contentWindow.postMessage({ type: 'CLOCKWEB_OPEN_SELECTOR' }, '*');
        } catch (e) {
          // Ignore postMessage errors
        }
      }
    } else {
      revealFloatingToolbar();
    }
  }

  function showScreensaver() {
    if (!screensaverEl) {
      return;
    }
    clearIdleTimer();
    isScreensaverActive = true;
    manualSleepTimestamp = Date.now();
    setClockInteractiveMode(false);
    screensaverEl.classList.remove('hidden');
    screensaverEl.setAttribute('aria-hidden', 'false');
    if (displayMode === 'screensaver_only') {
      revealFloatingToolbar();
    } else if (screensaverToolbar) {
      screensaverToolbar.classList.remove('toolbar-hidden');
    }
  }

  function hideScreensaver() {
    if (displayMode === 'screensaver_only') {
      // Never hide screensaver when running in standalone Screensaver Only mode
      return;
    }
    if (!screensaverEl || !isScreensaverActive) {
      return;
    }
    isScreensaverActive = false;
    setClockInteractiveMode(false);
    screensaverEl.classList.add('hidden');
    screensaverEl.setAttribute('aria-hidden', 'true');
  }

  function resetIdleTimer() {
    if (displayMode === 'screensaver_only') {
      return;
    }
    hideScreensaver();
    clearIdleTimer();

    if (!screensaverEnabled) {
      return;
    }

    // Do NOT activate screensaver while music is actively playing when suppression is enabled
    if (preventScreensaverWhilePlaying && volumioState && volumioState.status === 'play') {
      return;
    }

    idleTimerId = setTimeout(function () {
      if (preventScreensaverWhilePlaying && volumioState && volumioState.status === 'play') {
        return;
      }
      showScreensaver();
    }, idleTimeoutMs);
  }

  function triggerManualScreensaver(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    manualSleepTimestamp = Date.now();
    showScreensaver();
  }

  // ==========================================================================
  // Volumio State Synchronization & UI Updates
  // ==========================================================================

  function setConnectionUI(isConnected, labelText) {
    if (connectionIndicator) {
      connectionIndicator.classList.toggle('connected', Boolean(isConnected));
      connectionIndicator.classList.toggle('disconnected', !isConnected);
    }
    if (connectionStatus) {
      connectionStatus.textContent = labelText;
    }
    updateSettingsSummaries();
  }

  function resolveAlbumArtUrl(rawArt) {
    if (!rawArt || typeof rawArt !== 'string') {
      return '';
    }
    const trimmed = rawArt.trim();
    if (!trimmed || (trimmed.indexOf('albumart') !== -1 && trimmed.endsWith('albumart'))) {
      return '';
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
      return trimmed;
    }
    if (trimmed.startsWith('/')) {
      return VOLUMIO_BACKEND_URL + trimmed;
    }
    return VOLUMIO_BACKEND_URL + '/' + trimmed;
  }

  function updateArtworkElement(imgEl, fallbackEl, artUrl) {
    if (!imgEl || !fallbackEl) {
      return;
    }

    if (!artUrl) {
      imgEl.classList.add('hidden');
      fallbackEl.classList.remove('hidden');
      return;
    }

    imgEl.onload = function () {
      imgEl.classList.remove('hidden');
      fallbackEl.classList.add('hidden');
    };

    imgEl.onerror = function () {
      imgEl.classList.add('hidden');
      fallbackEl.classList.remove('hidden');
    };

    if (imgEl.getAttribute('src') !== artUrl) {
      imgEl.setAttribute('src', artUrl);
    }
  }

  function formatDurationSec(totalSec) {
    const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
    const minutes = Math.floor(sec / 60);
    const seconds = String(sec % 60).padStart(2, '0');
    return minutes + ':' + seconds;
  }

  function getFriendlyServiceName(serviceRaw) {
    const s = (serviceRaw || '').toLowerCase();
    if (s.indexOf('spop') !== -1 || s.indexOf('spot') !== -1) {
      return 'Spotify';
    }
    if (s.indexOf('webradio') !== -1 || s.indexOf('radio') !== -1) {
      return 'Webradio';
    }
    if (s.indexOf('cd') !== -1 || s.indexOf('nanosound') !== -1) {
      return 'CD';
    }
    if (s.indexOf('podcast') !== -1 || s.indexOf('rss') !== -1) {
      return 'Podcast';
    }
    return serviceRaw || 'Volumio';
  }

  function isSpotifyService(serviceRaw) {
    const s = (serviceRaw || '').toLowerCase();
    return s.indexOf('spop') !== -1 || s.indexOf('spot') !== -1;
  }

  function handlePushState(state) {
    if (!state || typeof state !== 'object') {
      return;
    }

    const prevStatus = lastWakeStatus;
    const prevTrackKey = lastWakeTrackKey;

    volumioState = Object.assign({}, volumioState, state);

    const status = (state.status || 'stop').toLowerCase();
    const isPlaying = status === 'play';
    const serviceName = getFriendlyServiceName(state.service);
    const isWebradio = serviceName === 'Webradio' || state.trackType === 'webradio';
    const isSpotify = isSpotifyService(state.service);

    const title = (state.title || '').trim() || (isPlaying ? 'Streaming Audio' : 'Ready to Play');
    const artist =
      (state.artist || '').trim() ||
      (isPlaying ? 'Active Source: ' + serviceName : 'Select a source above');
    const album = (state.album || '').trim();

    if (bottomTrackTitle) {
      bottomTrackTitle.textContent = title;
    }
    if (bottomTrackArtist) {
      bottomTrackArtist.textContent = artist;
    }

    const artUrl = resolveAlbumArtUrl(state.albumart);
    updateArtworkElement(bottomAlbumArt, bottomArtFallback, artUrl);
    updateArtworkElement(npAlbumArt, npArtFallback, artUrl);

    if (barIconPlay && barIconPause) {
      barIconPlay.classList.toggle('hidden', isPlaying);
      barIconPause.classList.toggle('hidden', !isPlaying);
    }

    if (!isDraggingVolume && typeof state.volume === 'number' && !isNaN(state.volume)) {
      const clampedVol = Math.max(0, Math.min(100, Math.round(state.volume)));
      if (volumeSlider) {
        volumeSlider.value = String(clampedVol);
      }
      if (volumeValue) {
        volumeValue.textContent = state.mute ? 'MUTE' : clampedVol + '%';
      }
    }

    const isMuted = Boolean(state.mute);
    if (btnMute) {
      btnMute.classList.toggle('muted', isMuted);
    }
    if (iconVolOn && iconVolMuted) {
      iconVolOn.classList.toggle('hidden', isMuted);
      iconVolMuted.classList.toggle('hidden', !isMuted);
    }

    if (npTitle) npTitle.textContent = title;
    if (npArtist) npArtist.textContent = artist;
    if (npAlbum) npAlbum.textContent = album;

    if (npSourceBadge) {
      npSourceBadge.textContent = serviceName.toUpperCase();
      npSourceBadge.classList.toggle('spotify', isSpotify);
      npSourceBadge.classList.toggle('webradio', isWebradio);
    }

    if (npStatusBadge) {
      npStatusBadge.textContent = status.toUpperCase();
      npStatusBadge.classList.toggle('playing', isPlaying);
    }

    if (npIconPlay && npIconPause) {
      npIconPlay.classList.toggle('hidden', isPlaying);
      npIconPause.classList.toggle('hidden', !isPlaying);
    }

    const durationSec = Number(state.duration) || 0;
    const seekSec = Math.floor((Number(state.seek) || 0) / 1000);
    if (npProgressContainer) {
      if (isWebradio || durationSec <= 0) {
        npProgressContainer.classList.add('hidden');
      } else {
        npProgressContainer.classList.remove('hidden');
        if (npSeekSlider) {
          npSeekSlider.max = String(durationSec);
          npSeekSlider.value = String(Math.min(durationSec, seekSec));
        }
        if (npTimeCurrent) {
          npTimeCurrent.textContent = formatDurationSec(seekSec);
        }
        if (npTimeTotal) {
          npTimeTotal.textContent = formatDurationSec(durationSec);
        }
      }
    }

    if (spotifyHeading && spotifySubtext) {
      if (isSpotify && isPlaying) {
        spotifyHeading.textContent = 'Spotify Connect Active — ' + title;
        spotifySubtext.textContent = artist + (album ? ' • ' + album : '');
      } else {
        spotifyHeading.textContent = 'Ready for Spotify Connect';
        spotifySubtext.textContent =
          'Select this Volumio device from your Spotify app on your phone, tablet, or computer.';
      }
    }

    sourceTiles.forEach(function (tile) {
      const tileSource = tile.getAttribute('data-source');
      tile.classList.remove('active-source', 'active-source-spotify');
      if (isPlaying) {
        if (tileSource === 'spotify' && isSpotify) {
          tile.classList.add('active-source-spotify');
        } else if (tileSource === 'radio' && isWebradio) {
          tile.classList.add('active-source');
        } else if (tileSource === 'cd' && serviceName === 'CD') {
          tile.classList.add('active-source');
        } else if (tileSource === 'podcasts' && serviceName === 'Podcast') {
          tile.classList.add('active-source');
        }
      }
    });

    if (currentView === 'radio') {
      renderRadioPresets();
    }

    const newTrackKey = (state.title || '') + '|' + (state.uri || '');
    const statusChangedToPlay = status === 'play' && prevStatus !== 'play';
    const statusChangedToStopOrPause = (status === 'pause' || status === 'stop') && prevStatus === 'play';
    const trackChanged = newTrackKey !== prevTrackKey && Boolean(state.title || state.uri);

    lastWakeStatus = status;
    lastWakeTrackKey = newTrackKey;

    if (statusChangedToPlay) {
      if (preventScreensaverWhilePlaying && isScreensaverActive && displayMode !== 'screensaver_only') {
        hideScreensaver();
      }
      resetIdleTimer();
    } else if (trackChanged) {
      resetIdleTimer();
    } else if (statusChangedToStopOrPause) {
      resetIdleTimer();
    }
  }

  // ==========================================================================
  // Transport & Volume Control Actions
  // ==========================================================================

  function togglePlayPause() {
    if (!socket || !socket.connected) {
      return;
    }
    if (volumioState.status === 'play') {
      socket.emit('pause');
    } else {
      socket.emit('play');
    }
  }

  function sendTransportCommand(cmd) {
    if (!socket || !socket.connected) {
      return;
    }
    socket.emit(cmd);
  }

  function emitVolumeDebounced(newVol) {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(newVol) || 0)));
    volumioState.volume = clamped;

    if (volumeSlider) {
      volumeSlider.value = String(clamped);
    }
    if (volumeValue) {
      volumeValue.textContent = clamped + '%';
    }

    if (volumeDebounceTimer !== null) {
      clearTimeout(volumeDebounceTimer);
    }

    volumeDebounceTimer = setTimeout(function () {
      if (socket && socket.connected) {
        socket.emit('volume', clamped);
      }
    }, 65);
  }

  function stepVolume(delta) {
    const current = Number(volumioState.volume) || 0;
    emitVolumeDebounced(current + delta);
  }

  function toggleMute() {
    if (!socket || !socket.connected) {
      return;
    }
    if (volumioState.mute) {
      socket.emit('unmute');
    } else {
      socket.emit('mute');
    }
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================

  function bindEventListeners() {
    // Watchdog activity listeners when on #main-ui (does not close active screensaver on mousemove jitter)
    ['touchstart', 'click', 'mousemove', 'scroll', 'keydown'].forEach(function (evtName) {
      window.addEventListener(
        evtName,
        function (event) {
          // While screensaver is active, only explicit wake layer tap/click/keydown wakes it
          if (isScreensaverActive) {
            if (evtName === 'keydown' && Date.now() - manualSleepTimestamp > 500) {
              resetIdleTimer();
            }
            return;
          }

          if (
            event &&
            event.target &&
            typeof event.target.closest === 'function' &&
            (event.target.closest('#show-clock-btn') ||
              event.target.closest('#setting-test-screensaver-btn'))
          ) {
            return;
          }

          resetIdleTimer();
        },
        { passive: true, capture: true }
      );
    });

    // Wake layer inside #screensaver:
    // - In 'screensaver_only' mode: reveals the 5-second floating toolbar without exiting to the full menu.
    // - In 'full_ui' mode: wakes back to #main-ui.
    if (screensaverWakeLayer) {
      ['click', 'touchstart'].forEach(function (evtName) {
        screensaverWakeLayer.addEventListener(
          evtName,
          function (event) {
            if (event && typeof event.stopPropagation === 'function') {
              event.stopPropagation();
            }
            if (displayMode === 'screensaver_only') {
              revealFloatingToolbar();
              return;
            }
            if (Date.now() - manualSleepTimestamp < 500) {
              return;
            }
            resetIdleTimer();
          },
          { passive: true }
        );
      });
    }

    // "Change Clock" button toggles pointer-events on #clock-frame so user can pick a clock face inside MainClockSelector.html
    if (screensaverCustomizeBtn) {
      screensaverCustomizeBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        setClockInteractiveMode(!isClockInteractive);
      });
    }

    // "Display Settings" button inside #screensaver opens #view-settings even when in screensaver_only mode
    if (screensaverSettingsBtn) {
      screensaverSettingsBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        clearIdleTimer();
        isScreensaverActive = false;
        setClockInteractiveMode(false);
        if (screensaverEl) {
          screensaverEl.classList.add('hidden');
          screensaverEl.setAttribute('aria-hidden', 'true');
        }
        if (mainUiEl) {
          mainUiEl.classList.remove('hidden');
        }
        if (!socketInitialized) {
          socketInitialized = true;
          initVolumioSocket();
        }
        navigateToView('settings');
      });
    }

    // "Back to Player" button inside #screensaver (only in full_ui mode)
    if (screensaverExitBtn) {
      screensaverExitBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        resetIdleTimer();
      });
    }

    // Manual Screensaver / Clock Buttons (Top Bar & Settings View)
    if (showClockBtn) {
      showClockBtn.addEventListener('click', triggerManualScreensaver);
    }
    if (settingTestScreensaverBtn) {
      settingTestScreensaverBtn.addEventListener('click', triggerManualScreensaver);
    }

    // Top Bar Navigation Buttons
    if (homeBtn) {
      homeBtn.addEventListener('click', function () {
        navigateToView('home');
      });
    }
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function () {
        navigateToView('settings');
      });
    }

    // Home 2x2 Source Tiles
    sourceTiles.forEach(function (tile) {
      tile.addEventListener('click', function () {
        const source = tile.getAttribute('data-source');
        if (source === 'spotify') {
          if (isSpotifyService(volumioState.service) && volumioState.status === 'play') {
            navigateToView('nowplaying');
          } else {
            navigateToView('spotify');
          }
        } else if (source && views[source]) {
          navigateToView(source);
        }
      });
    });

    // Radio View Actions & Modal
    if (radioAddBtn) {
      radioAddBtn.addEventListener('click', function () {
        openRadioModal(0);
      });
    }
    if (radioLoadVolumioBtn) {
      radioLoadVolumioBtn.addEventListener('click', loadVolumioMyWebRadios);
    }
    if (radioHelpToggle && radioHelpBox) {
      radioHelpToggle.addEventListener('click', function () {
        radioHelpBox.classList.toggle('hidden');
      });
    }
    if (radioHelpClose && radioHelpBox) {
      radioHelpClose.addEventListener('click', function () {
        radioHelpBox.classList.add('hidden');
      });
    }
    if (radioModalCloseBtn) {
      radioModalCloseBtn.addEventListener('click', closeRadioModal);
    }
    if (radioModalSlot) {
      radioModalSlot.addEventListener('change', function () {
        const slotIdx = parseInt(radioModalSlot.value, 10);
        if (slotIdx >= 0 && radioStations[slotIdx]) {
          radioModalName.value = radioStations[slotIdx].name;
          radioModalUrl.value = radioStations[slotIdx].url;
        } else {
          radioModalName.value = '';
          radioModalUrl.value = '';
        }
      });
    }
    if (radioModalTestBtn) {
      radioModalTestBtn.addEventListener('click', function () {
        const testName = (radioModalName && radioModalName.value.trim()) || 'Test Stream';
        const testUrl = (radioModalUrl && radioModalUrl.value.trim()) || '';
        if (!testUrl) {
          showToast('Please enter a stream URL to test');
          return;
        }
        showToast('Testing stream: ' + testName);
        playRadioStation({ name: testName, uri: testUrl });
      });
    }
    if (radioModalSaveBtn) {
      radioModalSaveBtn.addEventListener('click', function () {
        const nameVal = (radioModalName && radioModalName.value.trim()) || '';
        const urlVal = (radioModalUrl && radioModalUrl.value.trim()) || '';
        if (!nameVal || !urlVal) {
          showToast('Please enter both Station Name and Stream URL');
          return;
        }
        const slotIdx = parseInt(radioModalSlot && radioModalSlot.value, 10);
        const updated = radioStations.slice();
        if (!isNaN(slotIdx) && slotIdx >= 0) {
          updated[slotIdx] = {
            id: slotIdx + 1,
            name: nameVal,
            url: urlVal,
            uri: urlVal
          };
        } else {
          updated.push({
            id: updated.length + 1,
            name: nameVal,
            url: urlVal,
            uri: urlVal
          });
        }
        closeRadioModal();
        savePluginConfig({ radioStations: updated }, 'Saved radio station: ' + nameVal);
      });
    }

    // Podcasts View Actions & Modal
    if (podcastAddBtn) {
      podcastAddBtn.addEventListener('click', openPodcastModal);
    }
    if (podcastRefreshBtn) {
      podcastRefreshBtn.addEventListener('click', renderPodcastsHome);
    }
    if (podcastBackBtn) {
      podcastBackBtn.addEventListener('click', renderPodcastsHome);
    }
    if (podcastHelpToggle && podcastHelpBox) {
      podcastHelpToggle.addEventListener('click', function () {
        podcastHelpBox.classList.toggle('hidden');
      });
    }
    if (podcastHelpClose && podcastHelpBox) {
      podcastHelpClose.addEventListener('click', function () {
        podcastHelpBox.classList.add('hidden');
      });
    }
    if (podcastModalCloseBtn) {
      podcastModalCloseBtn.addEventListener('click', closePodcastModal);
    }
    samplePillBtns.forEach(function (pill) {
      pill.addEventListener('click', function () {
        if (podcastModalName) podcastModalName.value = pill.getAttribute('data-name') || '';
        if (podcastModalUrl) podcastModalUrl.value = pill.getAttribute('data-rss') || '';
      });
    });
    if (podcastModalSaveBtn) {
      podcastModalSaveBtn.addEventListener('click', function () {
        const feedName = (podcastModalName && podcastModalName.value.trim()) || 'Podcast Show';
        const feedUrl = (podcastModalUrl && podcastModalUrl.value.trim()) || '';
        if (!feedUrl) {
          showToast('Please enter a valid Podcast RSS Feed URL');
          return;
        }
        const updatedFeeds = podcastFeeds.slice();
        updatedFeeds.push({ name: feedName, rssUrl: feedUrl });
        closePodcastModal();
        savePluginConfig({ podcastFeeds: updatedFeeds }, 'Added podcast: ' + feedName).then(function () {
          loadPodcastRssEpisodes({ name: feedName, rssUrl: feedUrl });
        });
      });
    }

    // Settings View Actions
    const settingsThemeToggleBtn = document.getElementById('settings-theme-toggle-btn');
    const settingsThemeIcon = document.getElementById('settings-theme-icon');
    const settingsThemeText = document.getElementById('settings-theme-text');
    let currentAppTheme = 'dark';
    try {
      currentAppTheme = localStorage.getItem('corezone_theme_v1') || 'dark';
    } catch (e) {}

    function applyAppTheme(theme, save) {
      currentAppTheme = theme === 'light' ? 'light' : 'dark';
      if (currentAppTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.classList.add('light-theme');
      } else {
        document.documentElement.removeAttribute('data-theme');
        document.body.classList.remove('light-theme');
      }
      if (save) {
        try {
          localStorage.setItem('corezone_theme_v1', currentAppTheme);
        } catch (e) {}
      }
      if (settingsThemeIcon) settingsThemeIcon.textContent = currentAppTheme === 'light' ? '☀️' : '🌙';
      if (settingsThemeText) settingsThemeText.textContent = currentAppTheme === 'light' ? 'Light Theme' : 'Dark Theme';
    }

    if (settingsThemeToggleBtn) {
      settingsThemeToggleBtn.addEventListener('click', function () {
        applyAppTheme(currentAppTheme === 'dark' ? 'light' : 'dark', true);
      });
    }
    applyAppTheme(currentAppTheme, false);

    if (settingsToggleAllBtn) {
      settingsToggleAllBtn.addEventListener('click', function () {
        const accordions = getSettingsAccordions();
        const shouldOpen = !accordions.every(function (d) {
          return d.open;
        });
        accordions.forEach(function (d) {
          d.open = shouldOpen;
        });
        syncSettingsToggleAllButton();
      });
    }

    getSettingsAccordions().forEach(function (d) {
      d.addEventListener('toggle', syncSettingsToggleAllButton);
    });

    if (settingDisplayMode) {
      settingDisplayMode.addEventListener('change', updateSettingsSummaries);
    }
    if (settingScreensaverEnabled) {
      settingScreensaverEnabled.addEventListener('change', updateSettingsSummaries);
    }
    if (settingPreventWhilePlaying) {
      settingPreventWhilePlaying.addEventListener('change', updateSettingsSummaries);
    }
    if (settingIdleTimeout) {
      settingIdleTimeout.addEventListener('input', updateSettingsSummaries);
      settingIdleTimeout.addEventListener('change', updateSettingsSummaries);
    }
    if (settingSelectedClock) {
      settingSelectedClock.addEventListener('change', updateSettingsSummaries);
    }

    if (timeoutDecBtn && settingIdleTimeout) {
      timeoutDecBtn.addEventListener('click', function () {
        const current = parseInt(settingIdleTimeout.value, 10) || 60;
        settingIdleTimeout.value = String(Math.max(10, current - 10));
        updateSettingsSummaries();
      });
    }
    if (timeoutIncBtn && settingIdleTimeout) {
      timeoutIncBtn.addEventListener('click', function () {
        const current = parseInt(settingIdleTimeout.value, 10) || 60;
        settingIdleTimeout.value = String(current + 10);
        updateSettingsSummaries();
      });
    }
    if (settingAddPodcastBtn) {
      settingAddPodcastBtn.addEventListener('click', openPodcastModal);
    }
    if (settingReconnectBtn) {
      settingReconnectBtn.addEventListener('click', function () {
        showToast('Checking Volumio backend (' + VOLUMIO_BACKEND_URL + ')...');
        if (socket) {
          try {
            socket.connect();
            socket.emit('getState', '');
          } catch (e) {}
        } else {
          socketInitialized = true;
          initVolumioSocket();
        }
        setTimeout(updateSettingsSummaries, 600);
      });
    }
    if (saveSettingsBtnTop) {
      saveSettingsBtnTop.addEventListener('click', handleSaveSettingsFromView);
    }
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', handleSaveSettingsFromView);
    }

    // Spotify View -> Open Now Playing
    if (spotifyOpenNpBtn) {
      spotifyOpenNpBtn.addEventListener('click', function () {
        navigateToView('nowplaying');
      });
    }

    // CD View Buttons
    if (cdRefreshBtn) {
      cdRefreshBtn.addEventListener('click', requestCdLibrary);
    }
    if (cdPlayAllBtn) {
      cdPlayAllBtn.addEventListener('click', function () {
        if (cdTracksCache.length > 0) {
          const first = cdTracksCache[0];
          stopAndReplacePlay({
            service: first.service || 'cd',
            type: first.type || 'song',
            title: first.title || 'Track 1',
            uri: first.uri
          });
        } else {
          stopAndReplacePlay({ service: 'cd', type: 'folder', uri: 'cd' });
        }
      });
    }
    if (cdEjectBtn) {
      cdEjectBtn.addEventListener('click', function () {
        if (!socket || !socket.connected) {
          return;
        }
        socket.emit('stop');
        socket.emit('callMethod', {
          endpoint: 'music_service/cd',
          method: 'eject',
          data: ''
        });
        socket.emit('callMethod', {
          endpoint: 'music_service/nanosound_cd',
          method: 'eject',
          data: ''
        });
        showToast('Eject command sent');
      });
    }

    // Bottom Bar -> Expand Fullscreen Now Playing
    if (bottomTrackTrigger) {
      bottomTrackTrigger.addEventListener('click', function () {
        if (currentView === 'nowplaying') {
          navigateToView('home');
        } else {
          navigateToView('nowplaying');
        }
      });
    }

    // Transport Controls
    if (btnPlayPause) btnPlayPause.addEventListener('click', togglePlayPause);
    if (npPlayBtn) npPlayBtn.addEventListener('click', togglePlayPause);

    if (btnPrev) btnPrev.addEventListener('click', function () { sendTransportCommand('prev'); });
    if (npPrevBtn) npPrevBtn.addEventListener('click', function () { sendTransportCommand('prev'); });

    if (btnNext) btnNext.addEventListener('click', function () { sendTransportCommand('next'); });
    if (npNextBtn) npNextBtn.addEventListener('click', function () { sendTransportCommand('next'); });

    if (btnStop) btnStop.addEventListener('click', function () { sendTransportCommand('stop'); });
    if (npStopBtn) npStopBtn.addEventListener('click', function () { sendTransportCommand('stop'); });

    if (npSeekSlider) {
      npSeekSlider.addEventListener('change', function () {
        if (socket && socket.connected) {
          socket.emit('seek', Number(npSeekSlider.value) || 0);
        }
      });
    }

    // Volume Controls
    if (btnMute) btnMute.addEventListener('click', toggleMute);
    if (btnVolDown) btnVolDown.addEventListener('click', function () { stepVolume(-5); });
    if (btnVolUp) btnVolUp.addEventListener('click', function () { stepVolume(5); });

    if (volumeSlider) {
      volumeSlider.addEventListener('pointerdown', function () {
        isDraggingVolume = true;
      });
      volumeSlider.addEventListener('pointerup', function () {
        isDraggingVolume = false;
      });
      volumeSlider.addEventListener('input', function () {
        emitVolumeDebounced(volumeSlider.value);
      });
    }
  }

  // ==========================================================================
  // Dynamic Volumio Socket.IO Connection
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
        onError(new Error('window.io undefined'));
      }
    };
    script.onerror = function () {
      onError(new Error('Failed to load ' + SOCKET_IO_SCRIPT_URL));
    };
    document.head.appendChild(script);
  }

  function initVolumioSocket() {
    setConnectionUI(false, 'Connecting...');

    loadSocketIoScript(
      function () {
        try {
          socket = window.io(VOLUMIO_BACKEND_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 2000
          });

          socket.on('connect', function () {
            setConnectionUI(true, 'Online');
            socket.emit('getState', '');
          });

          socket.on('disconnect', function () {
            setConnectionUI(false, 'Offline');
          });

          socket.on('connect_error', function () {
            setConnectionUI(false, 'Offline');
          });

          socket.on('pushState', function (state) {
            handlePushState(state);
          });

          socket.on('pushBrowseLibrary', function (data) {
            handlePushBrowseLibrary(data);
          });

          // Settings saved in Volumio arrive here instantly
          socket.on('pushCoreZoneDisplaySettings', function (cfg) {
            applyConfigIfChanged(cfg);
          });
        } catch (err) {
          console.error('CoreZoneDisplay Socket.IO init error:', err);
          setConnectionUI(false, 'Error');
        }
      },
      function (err) {
        console.warn('CoreZoneDisplay: Volumio socket.io.js unreachable:', err.message);
        setConnectionUI(false, 'Offline');
      }
    );
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  function init() {
    updateClocks();
    setInterval(updateClocks, 1000);

    if (screensaverVolumioLink) {
      screensaverVolumioLink.setAttribute('href', VOLUMIO_BACKEND_URL);
    }

    renderRadioPresets();
    bindEventListeners();
    fetchPluginConfig();
    setInterval(pollPluginConfig, CONFIG_POLL_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
