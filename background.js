/**
 * m3u8DL Sniffer - Background Service Worker
 * Sniffs web media resources
 */

// Global state
const state = {
  // Stores sniffed resources grouped by tabId
  tabResources: new Map(),
  // Temporarily stores request headers
  requestHeaders: new Map(),
  // Set of processed requestIds (for deduplication)
  processedRequests: new Set(),
  // List of enabled file extensions (all enabled by default)
  enabledExtensions: null
};

// Load configuration for enabled file extensions
async function loadEnabledExtensions() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['enabledExtensions'], function(data) {
      if (data.enabledExtensions && data.enabledExtensions.length > 0) {
        state.enabledExtensions = new Set(data.enabledExtensions);
      } else {
        // Enable all by default
        state.enabledExtensions = new Set([
          'm3u8', 'mp4', 'ts', 'm4s', 'm4a', 'mpd', 'flv', 'webm',
          'mp3', 'wav', 'ogg', 'aac', 'mkv', 'mov', 'avi'
        ]);
      }
      resolve();
    });
  });
}

// Load configuration on initialization
loadEnabledExtensions();

// Periodically clean up declarativeNetRequest rules (every 5 minutes)
setInterval(function() {
  chrome.declarativeNetRequest.getSessionRules(function(rules) {
    if (rules.length > 0) {
      console.log('[m3u8DL] Cleaned up session rules:', rules.length);
      chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.map(r => r.id) });
    }
  });
}, 5 * 60 * 1000);

// Listen for configuration changes
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.enabledExtensions) {
    loadEnabledExtensions();
  }
});

// Media MIME type matching
const MEDIA_TYPES = [
  'video/', 'audio/',
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/mpegurl',
  'application/dash+xml',
  'application/octet-stream'
];

// M3U8-related Content-Types (used to detect m3u8 files with non-standard extensions)
const M3U8_CONTENT_TYPES = [
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
  'video/mp2t'  // TS file
];

// Extensions that might be m3u8 (requires further Content-Type checks)
const MAYBE_M3U8_EXTENSIONS = /\.(txt|json|m3u8|html|htm)(\?|$|#)/i;

// Media extension matching
const MEDIA_EXTENSIONS = /\.(m3u8|m3u|mp4|m4s|m4a|m4v|ts|f4v|flv|webm|mpd|mp3|wav|ogg|ogv|aac|mov|mkv|avi|wmv)(\?|$|#)/i;

// Ignored URL patterns
const IGNORE_PATTERNS = [
  /^https?:\/\/.*\.facebook\.com\//i,
  /^https?:\/\/.*\.fbcdn\.net\//i,
  /^https?:\/\/.*\.twitter\.com\//i,
  /^https?:\/\/.*\.twimg\.com\//i,
  /^https?:\/\/.*\.googlevideo\.com\/videoplayback.*ratebypass/i,
  /^data:/i,
  /^blob:/i,
  /^chrome-extension:\/\//i
];

/**
 * Checks whether a URL should be ignored
 */
function shouldIgnoreUrl(url) {
  return IGNORE_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Extracts file extension from a URL
 */
function getExtensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * Infers file extension from Content-Type
 */
function getExtFromContentType(contentType) {
  if (!contentType) return '';
  const ct = contentType.toLowerCase();
  if (ct.includes('mpegurl') || ct.includes('m3u8')) return 'm3u8';
  if (ct.includes('video/mp4')) return 'mp4';
  if (ct.includes('video/webm')) return 'webm';
  if (ct.includes('audio/mp4')) return 'm4a';
  if (ct.includes('audio/mpeg')) return 'mp3';
  if (ct.includes('video/mp2t')) return 'ts';
  if (ct.includes('application/dash+xml')) return 'mpd';
  if (ct.includes('video/x-flv')) return 'flv';
  if (ct.includes('video/quicktime')) return 'mov';
  if (ct.includes('video/x-msvideo') || ct.includes('video/avi')) return 'avi';
  if (ct.includes('video/x-matroska')) return 'mkv';
  if (ct.includes('audio/ogg') || ct.includes('video/ogg')) return 'ogg';
  if (ct.includes('audio/aac')) return 'aac';
  if (ct.includes('audio/wav')) return 'wav';
  return '';
}

/**
 * Checks whether an extension is enabled
 */
function isExtensionEnabled(ext) {
  if (!ext) return true;
  if (!state.enabledExtensions) return true;
  return state.enabledExtensions.has(ext.toLowerCase());
}

/**
 * Determines whether a resource is a media resource
 */
function isMediaResource(url, contentType) {
  if (shouldIgnoreUrl(url)) return false;

  const ext = getExtensionFromUrl(url);
  const contentTypeExt = getExtFromContentType(contentType);

  // Special case: .txt/.json etc. extensions, but Content-Type is m3u8
  // This case must be checked first and cannot be filtered out by extension
  if (ext && MAYBE_M3U8_EXTENSIONS.test('.' + ext)) {
    if (contentType) {
      const ct = contentType.toLowerCase();
      if (M3U8_CONTENT_TYPES.some(type => ct.includes(type))) {
        // Content-Type is m3u8; check if m3u8 is enabled
        return isExtensionEnabled('m3u8');
      }
    }
    // Neither m3u8 Content-Type nor a media extension, skip
    return false;
  }

  // First check whether the extension is enabled
  const detectedExt = ext || contentTypeExt;
  if (detectedExt && !isExtensionEnabled(detectedExt)) return false;

  // Check whether Content-Type is a media type
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (MEDIA_TYPES.some(type => ct.includes(type))) return true;
  }

  // Check whether the URL extension matches media extensions
  if (MEDIA_EXTENSIONS.test(url)) return true;

  return false;
}

/**
 * Generates a file name from a URL
 */
function generateFileName(url, ext) {
  try {
    const urlObj = new URL(url);
    let pathName = urlObj.pathname;
    // Use the last segment of the path as the file name
    let name = pathName.split('/').filter(Boolean).pop() || 'media';
    // Decode URI-encoded characters
    try { name = decodeURIComponent(name); } catch {}
    // If there is no extension, append one
    if (ext && !name.match(/\.[a-z0-9]+$/i)) {
      name += '.' + ext;
    }
    return name;
  } catch {
    return 'media.' + (ext || 'mp4');
  }
}

/**
 * Extracts key information from request headers
 */
function extractHeaders(requestHeaders) {
  if (!requestHeaders) return '';
  const headers = {};
  const importantHeaders = ['referer', 'origin', 'cookie', 'user-agent', 'authorization'];

  for (const header of requestHeaders) {
    const name = header.name.toLowerCase();
    if (importantHeaders.includes(name) || name.startsWith('x-')) {
      headers[header.name] = header.value;
    }
  }

  const result = Object.keys(headers).length > 0
    ? Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')
    : '';

  if (result) {
    console.log('[m3u8DL] Extracted headers:', result);
  }

  return result;
}

/**
 * Adds a resource to a specific tab
 */
function addResource(tabId, resource) {
  if (!state.tabResources.has(tabId)) {
    state.tabResources.set(tabId, new Map());
  }

  const resources = state.tabResources.get(tabId);
  const key = resource.url.split('?')[0]; // Deduplicate by URL path (ignoring query parameters)

  if (!resources.has(key)) {
    resources.set(key, resource);
    // Notify popup to update (if open)
    chrome.runtime.sendMessage({
      type: 'resourceAdded',
      tabId,
      resource
    }).catch(() => {});
  }
}

// Listen to request headers
chrome.webRequest.onSendHeaders.addListener(
  function(details) {
    if (details.requestHeaders) {
      state.requestHeaders.set(details.requestId, details.requestHeaders);
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders', chrome.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS].filter(Boolean)
);

// Listen to responses - media resource types only
chrome.webRequest.onResponseStarted.addListener(
  function(details) {
    try {
      const url = details.url;
      if (shouldIgnoreUrl(url)) return;

      // Get Content-Type
      let contentType = '';
      if (details.responseHeaders) {
        const ctHeader = details.responseHeaders.find(
          h => h.name.toLowerCase() === 'content-type'
        );
        if (ctHeader) contentType = ctHeader.value || '';
      }

      // Determine if it is a media resource
      if (!isMediaResource(url, contentType)) return;

      // Get request headers
      const requestHeaders = state.requestHeaders.get(details.requestId);
      const headersStr = extractHeaders(requestHeaders);
      state.requestHeaders.delete(details.requestId);

      // Get file size
      let size = 0;
      if (details.responseHeaders) {
        const clHeader = details.responseHeaders.find(
          h => h.name.toLowerCase() === 'content-length'
        );
        if (clHeader) size = parseInt(clHeader.value) || 0;
      }

      // Infer file extension
      let ext = getExtFromContentType(contentType) || getExtensionFromUrl(url);

      // Special handling: if URL extension is .txt but Content-Type is m3u8, mark as m3u8
      const urlExt = getExtensionFromUrl(url);
      if (urlExt && MAYBE_M3U8_EXTENSIONS.test('.' + urlExt) && ext === 'm3u8') {
        // Already inferred as m3u8 via Content-Type, keep as-is
      }

      // Generate resource object
      const resource = {
        url: url,
        ext: ext,
        size: size,
        contentType: contentType,
        headers: headersStr,
        tabId: details.tabId,
        title: '',
        timestamp: Date.now()
      };

      // Try to get title from tab
      if (details.tabId > 0) {
        chrome.tabs.get(details.tabId, function(tab) {
          if (chrome.runtime.lastError) return;
          if (tab && tab.title) {
            resource.title = tab.title;
          }
          addResource(details.tabId, resource);
        });
      } else {
        addResource(details.tabId, resource);
      }
    } catch (e) {
      console.error('Error processing response:', e);
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// Clean up request headers for failed requests
chrome.webRequest.onErrorOccurred.addListener(
  function(details) {
    state.requestHeaders.delete(details.requestId);
  },
  { urls: ['<all_urls>'] }
);

// Clean up resources when a tab is closed
chrome.tabs.onRemoved.addListener(function(tabId) {
  state.tabResources.delete(tabId);
});

// Clean up resources on page navigation (reload or redirect)
chrome.webNavigation.onCommitted.addListener(function(details) {
  // Only handle reload or navigation for the main frame (frameId === 0)
  if (details.frameId === 0 && details.tabId > 0) {
    // Reload: reload
    // Navigation: typed, link, auto_bookmark, auto_subframe, manual_subframe, generated, auto_toplevel, form_submit, keyword, keyword_generated
    const transitionTypes = ['reload', 'link', 'typed', 'form_submit', 'auto_bookmark', 'generated'];
    if (transitionTypes.includes(details.transitionType)) {
      state.tabResources.delete(details.tabId);
      // Clean up declarativeNetRequest rules
      chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] });
      console.log('[m3u8DL] Page reloaded/navigated, cleared resources and rules:', details.tabId);
    }
  }
});

// Update resource titles when tab title changes
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.title && state.tabResources.has(tabId)) {
    const resources = state.tabResources.get(tabId);
    resources.forEach(function(resource) {
      if (!resource.title) {
        resource.title = changeInfo.title;
      }
    });
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'getResources') {
    const tabId = message.tabId;
    const resources = state.tabResources.get(tabId) || new Map();
    sendResponse({
      resources: Array.from(resources.values())
    });
    return true;
  }

  if (message.type === 'clearResources') {
    const tabId = message.tabId;
    state.tabResources.delete(tabId);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'testConnection') {
    // Test server connection
    testServerConnection(message.server, message.username, message.password)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'sendTask') {
    // Send download task
    sendDownloadTask(message.server, message.auth, message.task)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'fetchM3u8') {
    // Proxy fetch m3u8 content
    fetchM3u8Content(message.url, message.headers)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'setRequestHeaders') {
    // Set request headers
    setRequestHeaders(message.headers)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'clearRequestHeaders') {
    // Clear request headers
    clearRequestHeaders()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Logs in to the server and retrieves auth_token
 */
async function loginAndSaveCookie(server, username, password) {
  try {
    // Ensure server URL format is correct
    const serverUrl = server.replace(/\/+$/, ''); // Remove trailing slash
    const loginUrl = `${serverUrl}/api/auth/login`;
    console.log('[m3u8DL] Attempting login:', loginUrl);
    console.log('[m3u8DL] Server URL:', serverUrl);

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    console.log('[m3u8DL] Login response status:', response.status);
    console.log('[m3u8DL] Response Content-Type:', response.headers.get('content-type'));

    // Read response text for debugging
    const responseText = await response.text();
    console.log('[m3u8DL] First 200 chars of response:', responseText.substring(0, 200));

    if (!response.ok) {
      try {
        const err = JSON.parse(responseText);
        return { success: false, error: err.error || `Login failed (${response.status})` };
      } catch {
        return { success: false, error: `Server returned non-JSON response (${response.status})` };
      }
    }

    // Parse successful response
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return { success: false, error: 'Server returned an invalid JSON response' };
    }
    console.log('[m3u8DL] Login successful:', data);

    // Wait briefly for the browser to process Set-Cookie
    await new Promise(resolve => setTimeout(resolve, 300));

    // Get auth_token via chrome.cookies API
    const parsedUrl = new URL(serverUrl);
    const cookies = await chrome.cookies.getAll({
      domain: parsedUrl.hostname,
      name: 'auth_token'
    });

    console.log('[m3u8DL] Cookies fetched:', cookies.length);

    let token = null;
    if (cookies.length > 0) {
      token = cookies[0].value;
      // Save to storage for subsequent use
      await chrome.storage.local.set({ authToken: token });
      console.log('[m3u8DL] auth_token saved');
    } else {
      console.warn('[m3u8DL] auth_token cookie not found');
    }

    return { success: true, user: data, token: token };
  } catch (e) {
    console.error('[m3u8DL] Login error:', e);
    return { success: false, error: 'Unable to connect to server: ' + e.message };
  }
}

/**
 * Retrieves saved auth_token
 */
async function getAuthToken(server) {
  const serverUrl = server.replace(/\/+$/, '');
  const parsedUrl = new URL(serverUrl);

  // Check chrome.cookies first
  const cookies = await chrome.cookies.getAll({
    domain: parsedUrl.hostname,
    name: 'auth_token'
  });

  if (cookies.length > 0) {
    return cookies[0].value;
  }

  // Retrieve from storage
  const data = await chrome.storage.local.get(['authToken']);
  return data.authToken || null;
}

/**
 * Tests server connection
 */
async function testServerConnection(server, username, password) {
  return await loginAndSaveCookie(server, username, password);
}

/**
 * Sends download task to remote server
 */
async function sendDownloadTask(server, auth, task) {
  try {
    // Log in first to obtain cookie
    const loginResult = await loginAndSaveCookie(server, auth.username, auth.password);
    if (!loginResult.success) {
      return loginResult;
    }

    // Get token
    const token = loginResult.token || await getAuthToken(server);

    // Create task - manually attach Cookie header
    const serverUrl = server.replace(/\/+$/, '');
    const taskUrl = `${serverUrl}/api/tasks`;
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Cookie'] = `auth_token=${token}`;
    }

    const taskResp = await fetch(taskUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(task)
    });

    if (taskResp.ok) {
      const data = await taskResp.json();
      return { success: true, task: data };
    } else {
      const err = await taskResp.json().catch(() => ({}));
      return { success: false, error: err.error || 'Failed to create task' };
    }
  } catch (e) {
    return { success: false, error: 'Request failed: ' + e.message };
  }
}

/**
 * Proxy fetches m3u8 content
 * Initiates request via background script, allowing Referer header to be set
 */
async function fetchM3u8Content(url, headers) {
  try {
    const fetchOptions = {
      method: 'GET',
      mode: 'cors'
    };

    // Set request headers
    if (headers) {
      fetchOptions.headers = {};
      for (const [key, value] of Object.entries(headers)) {
        fetchOptions.headers[key] = value;
      }
    }

    console.log('[m3u8DL] Proxy request:', url, headers);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    console.log('[m3u8DL] Proxy response:', contentType, text.substring(0, 200));

    return { success: true, data: text, contentType: contentType };
  } catch (e) {
    console.error('[m3u8DL] Proxy request failed:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Sets request headers (using declarativeNetRequest)
 * Inspired by Cat Catch implementation
 */
async function setRequestHeaders(headers) {
  return new Promise((resolve) => {
    // Clear existing rules first
    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] }, function() {
      if (!headers || Object.keys(headers).length === 0) {
        resolve();
        return;
      }

      // Add new rules
      const rules = {
        addRules: [{
          id: 1,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: Object.keys(headers).map(key => ({
              header: key,
              operation: "set",
              value: headers[key]
            }))
          },
          condition: {
            resourceTypes: ["xmlhttprequest", "media"]
          }
        }],
        removeRuleIds: [1]
      };

      chrome.declarativeNetRequest.updateSessionRules(rules, function() {
        console.log('[m3u8DL] Request headers set:', headers);
        resolve();
      });
    });
  });
}

/**
 * Clears request header rules
 */
async function clearRequestHeaders() {
  return new Promise((resolve) => {
    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] }, function() {
      resolve();
    });
  });
}

console.log('m3u8DL Sniffer background loaded');
