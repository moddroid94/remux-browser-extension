/**
 * m3u8DL Sniffer - Popup Script
 * Inline video information display
 */

// Current tab ID
let currentTabId = null;
// Sniffed resource list
let resources = [];
// Set of selected resource indices
let selectedIndices = new Set();
// Server configuration
let serverConfig = {
  server: '',
  username: '',
  password: ''
};

// Proxy configuration
let proxyConfig = {
  enable: false,
  type: 'http',
  host: '',
  port: 0,
  auth: false,
  username: '',
  password: ''
};

// AI translation configuration
let aiTranslateConfig = {
  enable: false,
  baseUrl: '',
  modelId: '',
  apiKey: '',
  prompt: ''
};

// Translation status
let isTranslating = false;

// DOM elements
const elements = {
  status: document.getElementById('status'),
  statusDot: document.querySelector('.status-dot'),
  statusText: document.querySelector('.status-text'),
  resourceList: document.getElementById('resourceList'),
  emptyState: document.getElementById('emptyState'),
  resourceCount: document.getElementById('resourceCount'),
  selectedCount: document.getElementById('selectedCount'),
  btnRefresh: document.getElementById('btnRefresh'),
  btnClear: document.getElementById('btnClear'),
  btnSelectAll: document.getElementById('btnSelectAll'),
  btnSend: document.getElementById('btnSend'),
  toast: document.getElementById('toast'),
  proxyToggle: document.getElementById('proxyToggle')
};

/**
 * Initialization
 */
async function init() {
  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
  }

  // Load configurations
  await loadConfig();

  // Load sniffed resources
  await loadResources();

  // Bind event listeners
  bindEvents();

  // Update connection status
  updateConnectionStatus();

  // Initialize proxy toggle switch
  initProxyToggle();

  // Listen for tab reload to automatically refresh resource list
  if (currentTabId) {
    chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
      if (tabId === currentTabId && changeInfo.status === 'complete') {
        // Page finished loading, reload resources
        loadResources();
      }
    });
  }

  // Listen for resource update messages from the background script
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.type === 'resourceAdded' && message.tabId === currentTabId) {
      // New resource added, reload resource list
      loadResources();
    }
  });

  // Clear request header rules when popup closes
  window.addEventListener('beforeunload', function() {
    chrome.runtime.sendMessage({ type: 'clearRequestHeaders' });
  });

  // Listen for storage changes and update accordingly
  chrome.storage.onChanged.addListener(function(changes) {
    // Check if proxy settings changed
    if (changes.proxyEnable || changes.proxyType || changes.proxyHost || changes.proxyPort ||
        changes.proxyAuth || changes.proxyUsername || changes.proxyPassword) {
      loadConfig().then(() => {
        updateProxyToggleState();
        updateConnectionStatus();
      });
    }

    // Check if server settings changed
    if (changes.server || changes.username || changes.password) {
      loadConfig().then(() => {
        updateConnectionStatus();
        updateSelectedCount();
      });
    }

    // Check if AI translation settings changed
    if (changes.aiTranslateEnable || changes.aiBaseUrl || changes.aiModelId || changes.aiApiKey || changes.aiPrompt) {
      loadConfig().then(() => {
        updateConnectionStatus();
      });
    }
  });
}

/**
 * Load server and extension configurations
 */
async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ['server', 'username', 'password', 'proxyEnable', 'proxyType', 'proxyHost', 'proxyPort', 'proxyAuth', 'proxyUsername', 'proxyPassword',
       'aiTranslateEnable', 'aiBaseUrl', 'aiModelId', 'aiApiKey', 'aiPrompt'],
      function(data) {
        serverConfig = {
          server: data.server || '',
          username: data.username || '',
          password: data.password || ''
        };
        proxyConfig = {
          enable: data.proxyEnable || false,
          type: data.proxyType || 'http',
          host: data.proxyHost || '',
          port: data.proxyPort || 0,
          auth: data.proxyAuth || false,
          username: data.proxyUsername || '',
          password: data.proxyPassword || ''
        };
        aiTranslateConfig = {
          enable: data.aiTranslateEnable || false,
          baseUrl: data.aiBaseUrl || '',
          modelId: data.aiModelId || '',
          apiKey: data.aiApiKey || '',
          prompt: data.aiPrompt || 'As a professional translator, please translate this title into concise English: keep key info, stay under 50 characters, output only the translated result without extra explanations:\n\n{text}'
        };
        resolve();
      }
    );
  });
}

/**
 * Update connection status display
 */
function updateConnectionStatus() {
  const isConnected = serverConfig.server && serverConfig.username;
  elements.statusDot.classList.toggle('connected', isConnected);
  let statusText = isConnected ? 'Configured' : 'Not Configured';
  if (proxyConfig.enable && proxyConfig.host) {
    statusText += ' | Proxy: ' + proxyConfig.host;
  }
  elements.statusText.textContent = statusText;

  // Show/hide translation button
  const btnTranslate = document.getElementById('btnTranslate');
  if (btnTranslate) {
    if (aiTranslateConfig.enable && aiTranslateConfig.baseUrl && aiTranslateConfig.modelId && aiTranslateConfig.apiKey) {
      btnTranslate.classList.remove('hide');
    } else {
      btnTranslate.classList.add('hide');
    }
  }
}

/**
 * Initialize proxy toggle
 */
function initProxyToggle() {
  // Set initial state
  updateProxyToggleState();

  // Listen for toggle changes
  elements.proxyToggle.addEventListener('change', async function() {
    const isEnabled = this.checked;

    // Save to sync storage
    await new Promise((resolve) => {
      chrome.storage.sync.set({ proxyEnable: isEnabled }, resolve);
    });

    // Update local config
    proxyConfig.enable = isEnabled;

    // Update status display
    updateConnectionStatus();

    showToast(isEnabled ? 'Proxy enabled' : 'Proxy disabled');
  });
}

/**
 * Update proxy toggle state
 */
function updateProxyToggleState() {
  elements.proxyToggle.checked = proxyConfig.enable;

  // Disable toggle if no proxy is configured
  if (!proxyConfig.host || !proxyConfig.port) {
    elements.proxyToggle.disabled = true;
    elements.proxyToggle.title = 'Please configure proxy in settings first';
  } else {
    elements.proxyToggle.disabled = false;
    elements.proxyToggle.title = 'Proxy Toggle';
  }
}

/**
 * Load sniffed resources from background
 */
async function loadResources() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'getResources', tabId: currentTabId },
      function(response) {
        if (chrome.runtime.lastError) {
          console.error('Error loading resources:', chrome.runtime.lastError);
          resources = [];
        } else {
          resources = response?.resources || [];
        }
        renderResources();
        resolve();
      }
    );
  });
}

/**
 * Render resource list
 */
function renderResources() {
  // Update count display
  elements.resourceCount.textContent = `${resources.length} resources`;

  // Empty state
  if (resources.length === 0) {
    elements.resourceList.innerHTML = '';
    elements.resourceList.appendChild(elements.emptyState);
    elements.emptyState.style.display = 'block';
    return;
  }

  elements.emptyState.style.display = 'none';

  // Generate list items HTML
  const html = resources.map((resource, index) => {
    const ext = resource.ext || 'unknown';
    const originalTitle = resource.originalTitle || resource.title || getFileName(resource.url);
    const fileName = resource.translatedTitle || originalTitle;
    const sizeStr = resource.size > 0 ? formatSize(resource.size) : '';
    const isSelected = selectedIndices.has(index);
    const isM3u8 = ['m3u8', 'm3u'].includes(ext);
    const isPlayable = isM3u8 || ext === 'mp4';
    const titleAttr = resource.translatedTitle
      ? `${escapeHtml(originalTitle)}\n${escapeHtml(resource.translatedTitle)}`
      : escapeHtml(resource.url);

    return `
      <div class="resource-panel" data-index="${index}">
        <div class="panel-heading">
          <input type="checkbox" class="check-item" ${isSelected ? 'checked' : ''} data-index="${index}">
          <span class="resource-name" title="${titleAttr}">${escapeHtml(fileName)}</span>
          <span class="resource-size ${sizeStr ? '' : 'hide'}">${sizeStr}</span>
          <span class="resource-ext ${ext}">${ext}</span>
          ${isPlayable ? `<button class="btn-icon btn-play" data-index="${index}" title="Preview"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg></button>` : ''}
          <button class="btn-icon btn-copy-url" data-index="${index}" title="Copy URL"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        </div>
        <div class="panel-body hide" id="panel-${index}">
          <div class="media-info" id="media-info-${index}" data-loaded="false">
            <span class="info-url">${escapeHtml(resource.url)}</span>
          </div>
          <video class="preview-video hide" id="video-${index}" controls></video>
        </div>
      </div>
    `;
  }).join('');

  elements.resourceList.innerHTML = html;
  updateSelectedCount();
}

/**
 * Bind UI event listeners
 */
function bindEvents() {
  // Checkbox change event
  elements.resourceList.addEventListener('change', function(e) {
    if (e.target.classList.contains('check-item')) {
      const index = parseInt(e.target.dataset.index);
      if (e.target.checked) {
        selectedIndices.add(index);
      } else {
        selectedIndices.delete(index);
      }
      updateSelectedCount();
    }
  });

  // Delegated click events for resources
  elements.resourceList.addEventListener('click', function(e) {
    const target = e.target;

    // Play/Preview button click
    if (target.classList.contains('btn-play')) {
      e.stopPropagation();
      const index = parseInt(target.dataset.index);
      togglePanel(index);
      return;
    }

    // Copy URL button click
    if (target.classList.contains('btn-copy-url')) {
      e.stopPropagation();
      const index = parseInt(target.dataset.index);
      copyToClipboard(resources[index].url);
      showToast('URL copied');
      return;
    }

    // Panel header click (expand / collapse)
    const heading = target.closest('.panel-heading');
    if (heading) {
      const panel = heading.closest('.resource-panel');
      const index = parseInt(panel.dataset.index);
      // Do not trigger toggle if clicked directly on checkboxes or action buttons
      if (target.type === 'checkbox' || target.classList.contains('btn-icon')) {
        return;
      }
      // Toggle checkbox selection
      const checkbox = heading.querySelector('.check-item');
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // Refresh button
  elements.btnRefresh.addEventListener('click', async function() {
    cleanupResources();

    // Clear resources in background for this tab
    await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'clearResources', tabId: currentTabId },
        resolve
      );
    });

    // Reload tab
    if (currentTabId) {
      chrome.tabs.reload(currentTabId);
      setTimeout(async () => {
        await loadResources();
        showToast('Refreshed');
      }, 1000);
    } else {
      resources = [];
      selectedIndices.clear();
      renderResources();
      showToast('Refreshed');
    }
  });

  // Clear button
  elements.btnClear.addEventListener('click', function() {
    cleanupResources();
    chrome.runtime.sendMessage(
      { type: 'clearResources', tabId: currentTabId },
      function() {
        resources = [];
        selectedIndices.clear();
        renderResources();
        showToast('Cleared');
      }
    );
  });

  // Select all button
  elements.btnSelectAll.addEventListener('click', function() {
    if (selectedIndices.size === resources.length) {
      selectedIndices.clear();
    } else {
      resources.forEach((_, i) => selectedIndices.add(i));
    }
    renderResources();
  });

  // Translate button
  const btnTranslate = document.getElementById('btnTranslate');
  if (btnTranslate) {
    btnTranslate.addEventListener('click', handleTranslate);
  }

  // Send download task button
  elements.btnSend.addEventListener('click', handleSend);
}

/**
 * Toggle collapse/expand of a resource panel
 */
function togglePanel(index) {
  const panel = document.getElementById(`panel-${index}`);
  const mediaInfo = document.getElementById(`media-info-${index}`);
  const video = document.getElementById(`video-${index}`);

  if (!panel.classList.contains('hide')) {
    // Collapse
    panel.classList.add('hide');
    if (video && !video.paused) {
      video.pause();
    }
    return;
  }

  // Expand
  panel.classList.remove('hide');

  // Load video info if not loaded yet
  if (mediaInfo.dataset.loaded === 'false') {
    mediaInfo.dataset.loaded = 'true';
    loadVideoInfo(index);
  }
}

/**
 * Load video information and preview
 */
async function loadVideoInfo(index) {
  const resource = resources[index];
  const mediaInfo = document.getElementById(`media-info-${index}`);
  const video = document.getElementById(`video-${index}`);

  if (!resource || !mediaInfo) return;

  const isM3u8 = ['m3u8', 'm3u'].includes(resource.ext);

  if (isM3u8) {
    // Attempt playback using HLS.js
    if (Hls.isSupported()) {
      const headers = parseHeaders(resource.headers);

      // Set headers using declarativeNetRequest via background
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'setRequestHeaders', headers: headers },
          resolve
        );
      });

      const hlsConfig = { enableWorker: false };
      const hls = new Hls(hlsConfig);
      hls.loadSource(resource.url);
      hls.attachMedia(video);

      // On manifest parsed
      hls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
        if (data.levels && data.levels.length > 1) {
          appendMediaInfo(mediaInfo, 'Quality', `${data.levels.length} variants`);
          data.levels.forEach((level, i) => {
            const resolution = level.width && level.height ? `${level.width}×${level.height}` : '';
            const bitrate = level.bitrate ? formatBitrate(level.bitrate) : '';
            const quality = resolution ? getQualityLabel(resolution) : `Stream ${i + 1}`;
            appendMediaInfo(mediaInfo, quality, `${resolution} ${bitrate}`);
          });
        }
        video.classList.remove('hide');
      });

      // On level loaded
      hls.on(Hls.Events.LEVEL_LOADED, function(event, data) {
        if (data.details && data.details.totalduration) {
          appendMediaInfo(mediaInfo, 'Duration', formatDuration(data.details.totalduration));
        }
      });

      // On video metadata loaded
      video.addEventListener('loadedmetadata', function() {
        if (video.duration && video.duration !== Infinity) {
          appendMediaInfo(mediaInfo, 'Duration', formatDuration(video.duration));
        }
        if (video.videoWidth && video.videoHeight) {
          appendMediaInfo(mediaInfo, 'Resolution', `${video.videoWidth}×${video.videoHeight}`);
        }
        video.classList.remove('hide');
      });

      // Error handling - fallback to text parsing mode
      hls.on(Hls.Events.ERROR, function(event, data) {
        if (data.fatal) {
          hls.destroy();
          chrome.runtime.sendMessage({ type: 'clearRequestHeaders' });
          console.warn('[m3u8DL] HLS playback failed, falling back to parsing mode');
          loadM3u8InfoByParsing(index);
        }
      });
    } else {
      // HLS not supported, parse directly
      loadM3u8InfoByParsing(index);
    }
  } else {
    // Non-m3u8 files (MP4, etc.)
    video.src = resource.url;
    video.classList.remove('hide');
    appendMediaInfo(mediaInfo, 'Type', resource.ext.toUpperCase());
  }
}

/**
 * Fetch and parse m3u8 text directly (fallback)
 */
async function loadM3u8InfoByParsing(index) {
  const resource = resources[index];
  const mediaInfo = document.getElementById(`media-info-${index}`);

  mediaInfo.innerHTML = '<span class="info-url">' + escapeHtml(resource.url) + '</span>';

  const headers = parseHeaders(resource.headers);
  const referer = headers['Referer'] || headers['referer'];
  const fetchHeaders = referer ? { Referer: referer } : {};

  appendMediaInfo(mediaInfo, 'Status', 'Parsing...');

  try {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'fetchM3u8', url: resource.url, headers: fetchHeaders },
        resolve
      );
    });

    if (result.success) {
      const info = parseM3u8Content(result.data, resource.url);
      displayM3u8Info(mediaInfo, info);
    } else {
      mediaInfo.innerHTML = '<span class="info-url">' + escapeHtml(resource.url) + '</span>';
      appendMediaInfo(mediaInfo, 'Error', result.error || 'Failed to load');
    }
  } catch (e) {
    mediaInfo.innerHTML = '<span class="info-url">' + escapeHtml(resource.url) + '</span>';
    appendMediaInfo(mediaInfo, 'Error', e.message);
  }
}

/**
 * Parse m3u8 playlist content
 */
function parseM3u8Content(content, baseUrl) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  const info = {
    isMaster: false,
    duration: 0,
    segments: 0,
    variants: []
  };

  // Check if master playlist
  if (content.includes('#EXT-X-STREAM-INF')) {
    info.isMaster = true;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
        const attrs = parseM3u8Attributes(lines[i]);
        const nextLine = lines[i + 1] || '';
        const url = nextLine.startsWith('#') ? '' : resolveUrl(nextLine, baseUrl);

        info.variants.push({
          bandwidth: parseInt(attrs['BANDWIDTH'] || '0'),
          resolution: attrs['RESOLUTION'] || '',
          codecs: attrs['CODECS'] || '',
          url: url
        });
      }
    }

    // Sort variants by bandwidth descending
    info.variants.sort((a, b) => b.bandwidth - a.bandwidth);
  } else {
    // Media playlist, calculate total duration and segment count
    let totalDuration = 0;
    let segmentCount = 0;

    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/#EXTINF:([\d.]+)/);
        if (match) {
          totalDuration += parseFloat(match[1]);
          segmentCount++;
        }
      }
    }

    info.duration = totalDuration;
    info.segments = segmentCount;
  }

  return info;
}

/**
 * Parse m3u8 line attributes
 */
function parseM3u8Attributes(line) {
  const attrs = {};
  const match = line.match(/([A-Z-]+)=(?:"([^"]+)"|([^,]+))/g);
  if (match) {
    match.forEach(m => {
      const [key, value] = m.split('=');
      attrs[key] = value.replace(/"/g, '');
    });
  }
  return attrs;
}

/**
 * Resolve relative URL against base URL
 */
function resolveUrl(url, baseUrl) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  try {
    const base = new URL(baseUrl);
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

/**
 * Display parsed m3u8 information
 */
function displayM3u8Info(mediaInfo, info) {
  mediaInfo.innerHTML = '';

  if (info.isMaster) {
    // Master playlist - show all variants
    appendMediaInfo(mediaInfo, 'Type', 'Master Playlist');
    appendMediaInfo(mediaInfo, 'Quality', `${info.variants.length} variants`);

    info.variants.forEach((v, i) => {
      const resolution = v.resolution ? v.resolution.replace('x', '×') : '';
      const bitrate = v.bandwidth > 0 ? formatBitrate(v.bandwidth) : '';
      const quality = resolution ? getQualityLabel(resolution) : `Stream ${i + 1}`;
      const infoStr = [resolution, bitrate].filter(Boolean).join(' ');
      appendMediaInfo(mediaInfo, quality, infoStr || 'Unknown');
    });
  } else {
    // Media playlist - show duration and segments
    appendMediaInfo(mediaInfo, 'Type', 'Media Playlist');
    if (info.duration > 0) {
      appendMediaInfo(mediaInfo, 'Duration', formatDuration(info.duration));
    }
    if (info.segments > 0) {
      appendMediaInfo(mediaInfo, 'Segments', `${info.segments}`);

      // Estimated size assuming 2Mbps bitrate
      if (info.duration > 0) {
        const estimatedSize = (2000000 / 8) * info.duration;
        appendMediaInfo(mediaInfo, 'Estimated Size', `~${formatSize(estimatedSize)} (assuming 2Mbps)`);
      }
    }
  }
}

/**
 * Append label-value pair to media info container
 */
function appendMediaInfo(container, label, value) {
  const existing = container.querySelector(`[data-label="${label}"]`);
  if (existing) {
    existing.querySelector('.info-value').textContent = value;
    return;
  }

  const infoItem = document.createElement('div');
  infoItem.className = 'info-item';
  infoItem.setAttribute('data-label', label);
  infoItem.innerHTML = `<span class="info-label">${label}:</span> <span class="info-value">${value}</span>`;
  container.appendChild(infoItem);
}

/**
 * Update selected items count in UI
 */
function updateSelectedCount() {
  elements.selectedCount.textContent = selectedIndices.size;
  elements.btnSend.disabled = selectedIndices.size === 0 || !serverConfig.server;
}

/**
 * Handle sending selected items to remote downloader
 */
async function handleSend() {
  if (selectedIndices.size === 0) return;

  if (!serverConfig.server || !serverConfig.username || !serverConfig.password) {
    showToast('Please configure the server first', 'error');
    chrome.runtime.openOptionsPage();
    return;
  }

  // Reload latest proxy configuration
  await loadConfig();

  const selectedResources = Array.from(selectedIndices).map(i => resources[i]);

  elements.btnSend.disabled = true;
  elements.btnSend.querySelector('.btn-label').textContent = 'Sending...';

  let successCount = 0;
  let failCount = 0;

  for (const resource of selectedResources) {
    try {
      const headers = parseHeaders(resource.headers);
      const referer = headers['Referer'] || headers['referer'] || '';

      const task = {
        url: resource.url,
        output_name: generateOutputName(resource),
        headers: referer ? `Referer: ${referer}` : '',
        auto_select: true,
        thread_count: 32,
        retry_count: 15
      };

      // Apply proxy settings if enabled
      if (proxyConfig.enable && proxyConfig.host && proxyConfig.port) {
        let proxyUrl = `${proxyConfig.type}://${proxyConfig.host}:${proxyConfig.port}`;
        if (proxyConfig.auth && proxyConfig.username) {
          const auth = proxyConfig.password
            ? `${proxyConfig.username}:${proxyConfig.password}`
            : proxyConfig.username;
          proxyUrl = `${proxyConfig.type}://${auth}@${proxyConfig.host}:${proxyConfig.port}`;
        }
        task.custom_proxy = proxyUrl;
      }

      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'sendTask',
            server: serverConfig.server,
            auth: {
              username: serverConfig.username,
              password: serverConfig.password
            },
            task: task
          },
          resolve
        );
      });

      if (result.success) {
        successCount++;
      } else {
        failCount++;
        console.error('Failed to send task:', result.error);
      }
    } catch (e) {
      failCount++;
      console.error('Error sending task:', e);
    }
  }

  elements.btnSend.disabled = false;
  elements.btnSend.querySelector('.btn-label').textContent = 'Send to Remote Downloader';

  if (failCount === 0) {
    showToast(`Successfully sent ${successCount} task(s)`, 'success');
  } else {
    showToast(`${successCount} succeeded, ${failCount} failed`, 'error');
  }
}

/**
 * Handle AI title translation
 */
async function handleTranslate() {
  if (isTranslating) return;

  if (!aiTranslateConfig.enable || !aiTranslateConfig.baseUrl || !aiTranslateConfig.modelId || !aiTranslateConfig.apiKey) {
    showToast('Please configure AI translation first', 'error');
    chrome.runtime.openOptionsPage();
    return;
  }

  // Get resources to translate (selected or all)
  const indicesToTranslate = selectedIndices.size > 0
    ? Array.from(selectedIndices)
    : resources.map((_, i) => i);

  if (indicesToTranslate.length === 0) {
    showToast('No resources to translate', 'error');
    return;
  }

  isTranslating = true;
  const btnTranslate = document.getElementById('btnTranslate');
  if (btnTranslate) {
    btnTranslate.disabled = true;
    btnTranslate.querySelector('.btn-label').textContent = 'Translating...';
  }

  let successCount = 0;
  let failCount = 0;

  for (const index of indicesToTranslate) {
    const resource = resources[index];
    if (!resource) continue;

    const title = resource.title || getFileName(resource.url);
    if (!title) continue;

    try {
      console.log(`[Translate] Starting #${index}: "${title}"`);
      const translatedTitle = await callAiTranslate(title);

      if (!translatedTitle || translatedTitle.trim() === '') {
        console.error(`[Translate] #${index} returned empty result`);
        failCount++;
        continue;
      }

      if (!resource.originalTitle) {
        resource.originalTitle = title;
      }
      resource.translatedTitle = translatedTitle;
      successCount++;
      console.log(`[Translate] #${index} success: "${title}" → "${translatedTitle}"`);
    } catch (e) {
      console.error(`[Translate] #${index} failed:`, e.message);
      failCount++;
    }
  }

  renderResources();

  isTranslating = false;
  if (btnTranslate) {
    btnTranslate.disabled = false;
    btnTranslate.querySelector('.btn-label').textContent = 'Translate';
  }

  if (failCount === 0) {
    showToast(`Successfully translated ${successCount} title(s)`, 'success');
  } else {
    showToast(`${successCount} succeeded, ${failCount} failed`, 'error');
  }
}

/**
 * Call AI API for translation
 */
async function callAiTranslate(text) {
  const url = `${aiTranslateConfig.baseUrl}/v1/chat/completions`;
  const prompt = aiTranslateConfig.prompt.replace('{text}', text);

  console.log('[Translate] Request URL:', url);
  console.log('[Translate] Prompt:', prompt.substring(0, 100) + '...');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiTranslateConfig.apiKey}`
    },
    body: JSON.stringify({
      model: aiTranslateConfig.modelId,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })
  });

  console.log('[Translate] Response status:', response.status);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[Translate] API Error:', errorData);
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    console.error('[Translate] Invalid API response:', data);
    throw new Error('Invalid API response');
  }

  const result = data.choices[0].message.content.trim();
  console.log('[Translate] Result:', result);

  if (!result) {
    throw new Error('Translation result is empty');
  }

  return result;
}

/**
 * Generate output file name
 */
function generateOutputName(resource) {
  let name = '';

  // Priority: translated title > original title > filename
  if (resource.translatedTitle && resource.translatedTitle.trim()) {
    name = resource.translatedTitle.trim();
  } else if (resource.title && resource.title.trim()) {
    name = resource.title.trim();
  } else {
    name = getFileName(resource.url);
    name = name.replace(/\.[^.]+$/, '');
  }

  name = name.replace(/[<>:"/\\|?*]/g, '_');
  name = name.replace(/^[\s.]+|[\s.]+$/g, '');

  if (name.length > 50) {
    name = name.substring(0, 50);
  }

  return name || 'media';
}

/**
 * Extract filename from URL
 */
function getFileName(url) {
  try {
    const urlObj = new URL(url);
    let pathName = urlObj.pathname;
    let name = pathName.split('/').filter(Boolean).pop() || 'media';
    try { name = decodeURIComponent(name); } catch {}
    return name;
  } catch {
    return 'media';
  }
}

/**
 * Format file size
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * Format duration into readable string
 */
function formatDuration(seconds) {
  if (!seconds || seconds === Infinity) return 'Unknown';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

/**
 * Format bitrate into readable string
 */
function formatBitrate(bps) {
  if (!bps) return 'Unknown';
  if (bps >= 1000000) return (bps / 1000000).toFixed(2) + ' Mbps';
  if (bps >= 1000) return (bps / 1000).toFixed(0) + ' kbps';
  return bps + ' bps';
}

/**
 * Get quality label according to resolution
 */
function getQualityLabel(resolution) {
  if (!resolution) return 'Unknown';
  const parts = resolution.split(/[×x]/);
  const height = parseInt(parts[1]);
  if (height >= 2160) return '4K';
  if (height >= 1440) return '2K';
  if (height >= 1080) return '1080P';
  if (height >= 720) return '720P';
  if (height >= 480) return '480P';
  if (height >= 360) return '360P';
  return `${height}P`;
}

/**
 * Parse headers string into object
 */
function parseHeaders(headerStr) {
  const headers = {};
  if (!headerStr) return headers;
  headerStr.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      headers[key.trim()] = valueParts.join(':').trim();
    }
  });
  return headers;
}

/**
 * Copy string to clipboard
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback method
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Show toast notification
 */
function showToast(message, type = '') {
  elements.toast.textContent = message;
  elements.toast.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => {
    elements.toast.className = 'toast';
  }, 2000);
}

/**
 * Cleanup resources
 */
function cleanupResources() {
  // Reserved cleanup logic
}

// Initialize script
init();
