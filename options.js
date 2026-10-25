/**
 * m3u8DL Sniffer - Options Script
 */

// DOM Elements
const elements = {
  server: document.getElementById('server'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  threadCount: document.getElementById('threadCount'),
  retryCount: document.getElementById('retryCount'),
  autoSelect: document.getElementById('autoSelect'),
  btnTest: document.getElementById('btnTest'),
  btnSave: document.getElementById('btnSave'),
  testResult: document.getElementById('testResult'),
  saveResult: document.getElementById('saveResult'),
  extGrid: document.getElementById('extGrid'),
  proxyEnable: document.getElementById('proxyEnable'),
  proxySettings: document.getElementById('proxySettings'),
  proxyType: document.getElementById('proxyType'),
  proxyHost: document.getElementById('proxyHost'),
  proxyPort: document.getElementById('proxyPort'),
  proxyAuth: document.getElementById('proxyAuth'),
  proxyAuthSettings: document.getElementById('proxyAuthSettings'),
  proxyUsername: document.getElementById('proxyUsername'),
  proxyPassword: document.getElementById('proxyPassword'),
  // AI Translation Configuration
  aiTranslateEnable: document.getElementById('aiTranslateEnable'),
  aiTranslateSettings: document.getElementById('aiTranslateSettings'),
  aiBaseUrl: document.getElementById('aiBaseUrl'),
  aiModelId: document.getElementById('aiModelId'),
  aiApiKey: document.getElementById('aiApiKey'),
  aiPrompt: document.getElementById('aiPrompt'),
  btnTestAi: document.getElementById('btnTestAi'),
  aiTestResult: document.getElementById('aiTestResult')
};

// Default supported resource extensions
const DEFAULT_EXTENSIONS = [
  { ext: 'm3u8', label: 'M3U8', enabled: true },
  { ext: 'mp4', label: 'MP4', enabled: true },
  { ext: 'ts', label: 'TS', enabled: true },
  { ext: 'm4s', label: 'M4S', enabled: true },
  { ext: 'm4a', label: 'M4A', enabled: true },
  { ext: 'mpd', label: 'MPD', enabled: true },
  { ext: 'flv', label: 'FLV', enabled: true },
  { ext: 'webm', label: 'WebM', enabled: true },
  { ext: 'mp3', label: 'MP3', enabled: true },
  { ext: 'wav', label: 'WAV', enabled: true },
  { ext: 'ogg', label: 'OGG', enabled: true },
  { ext: 'aac', label: 'AAC', enabled: true },
  { ext: 'mkv', label: 'MKV', enabled: true },
  { ext: 'mov', label: 'MOV', enabled: true },
  { ext: 'avi', label: 'AVI', enabled: true }
];

/**
 * Initialization - Load saved configuration
 */
async function init() {
  const config = await loadConfig();

  // Populate form fields
  elements.server.value = config.server || '';
  elements.username.value = config.username || '';
  elements.password.value = config.password || '';
  elements.threadCount.value = config.threadCount || 32;
  elements.retryCount.value = config.retryCount || 15;
  elements.autoSelect.checked = config.autoSelect !== false;

  // Proxy settings
  elements.proxyEnable.checked = config.proxyEnable || false;
  elements.proxyType.value = config.proxyType || 'http';
  elements.proxyHost.value = config.proxyHost || '';
  elements.proxyPort.value = config.proxyPort || '';
  elements.proxyAuth.checked = config.proxyAuth || false;
  elements.proxyUsername.value = config.proxyUsername || '';
  elements.proxyPassword.value = config.proxyPassword || '';

  // AI Translation settings
  elements.aiTranslateEnable.checked = config.aiTranslateEnable || false;
  elements.aiBaseUrl.value = config.aiBaseUrl || '';
  elements.aiModelId.value = config.aiModelId || '';
  elements.aiApiKey.value = config.aiApiKey || '';
  elements.aiPrompt.value = config.aiPrompt || 'As a professional translator, please translate the title into concise English: keep key info, stay under 50 characters, output only the translated result without extra explanations:\n\n{text}';

  // Toggle visibility of Proxy settings
  toggleProxySettings();
  toggleProxyAuthSettings();

  // Toggle visibility of AI Translation settings
  toggleAiTranslateSettings();

  // Render resource types grid
  renderExtGrid(config.enabledExtensions);

  // Bind events
  bindEvents();
}

/**
 * Load configuration from sync storage
 */
function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ['server', 'username', 'password', 'threadCount', 'retryCount', 'autoSelect', 'enabledExtensions',
       'proxyEnable', 'proxyType', 'proxyHost', 'proxyPort', 'proxyAuth', 'proxyUsername', 'proxyPassword',
       'aiTranslateEnable', 'aiBaseUrl', 'aiModelId', 'aiApiKey', 'aiPrompt'],
      function(data) {
        resolve(data);
      }
    );
  });
}

/**
 * Render resource extension checkboxes
 */
function renderExtGrid(enabledExtensions) {
  // Use defaults if not saved before
  const enabledSet = new Set(enabledExtensions || DEFAULT_EXTENSIONS.filter(e => e.enabled).map(e => e.ext));

  const html = DEFAULT_EXTENSIONS.map(item => {
    const isChecked = enabledSet.has(item.ext);
    return `
      <div class="ext-item">
        <input type="checkbox" id="ext_${item.ext}" value="${item.ext}" ${isChecked ? 'checked' : ''}>
        <label for="ext_${item.ext}">${item.label}</label>
      </div>
    `;
  }).join('');

  elements.extGrid.innerHTML = html;
}

/**
 * Save configuration to sync storage
 */
function saveConfig() {
  // Get enabled extensions
  const enabledExtensions = [];
  elements.extGrid.querySelectorAll('input[type="checkbox"]:checked').forEach(function(checkbox) {
    enabledExtensions.push(checkbox.value);
  });

  const config = {
    server: elements.server.value.trim().replace(/\/+$/, ''), // Remove trailing slash
    username: elements.username.value.trim(),
    password: elements.password.value,
    threadCount: parseInt(elements.threadCount.value) || 32,
    retryCount: parseInt(elements.retryCount.value) || 15,
    autoSelect: elements.autoSelect.checked,
    enabledExtensions: enabledExtensions,
    // Proxy configuration
    proxyEnable: elements.proxyEnable.checked,
    proxyType: elements.proxyType.value,
    proxyHost: elements.proxyHost.value.trim(),
    proxyPort: parseInt(elements.proxyPort.value) || 0,
    proxyAuth: elements.proxyAuth.checked,
    proxyUsername: elements.proxyUsername.value.trim(),
    proxyPassword: elements.proxyPassword.value,
    // AI Translation configuration
    aiTranslateEnable: elements.aiTranslateEnable.checked,
    aiBaseUrl: elements.aiBaseUrl.value.trim().replace(/\/+$/, ''),
    aiModelId: elements.aiModelId.value.trim(),
    aiApiKey: elements.aiApiKey.value,
    aiPrompt: elements.aiPrompt.value
  };

  return new Promise((resolve) => {
    chrome.storage.sync.set(config, function() {
      resolve(config);
    });
  });
}

/**
 * Toggle proxy settings display
 */
function toggleProxySettings() {
  if (elements.proxyEnable.checked) {
    elements.proxySettings.classList.remove('hide');
  } else {
    elements.proxySettings.classList.add('hide');
  }
}

/**
 * Toggle proxy authentication settings display
 */
function toggleProxyAuthSettings() {
  if (elements.proxyAuth.checked) {
    elements.proxyAuthSettings.classList.remove('hide');
  } else {
    elements.proxyAuthSettings.classList.add('hide');
  }
}

/**
 * Toggle AI translation settings display
 */
function toggleAiTranslateSettings() {
  if (elements.aiTranslateEnable.checked) {
    elements.aiTranslateSettings.classList.remove('hide');
  } else {
    elements.aiTranslateSettings.classList.add('hide');
  }
}

/**
 * Bind UI event listeners
 */
function bindEvents() {
  // Test connection button
  elements.btnTest.addEventListener('click', handleTest);

  // Save settings button
  elements.btnSave.addEventListener('click', handleSave);

  // Toggle proxy
  elements.proxyEnable.addEventListener('change', toggleProxySettings);

  // Toggle proxy auth
  elements.proxyAuth.addEventListener('change', toggleProxyAuthSettings);

  // Toggle AI translation
  elements.aiTranslateEnable.addEventListener('change', toggleAiTranslateSettings);

  // Test AI translation button
  elements.btnTestAi.addEventListener('click', handleTestAiTranslate);
}

/**
 * Test remote server connection
 */
async function handleTest() {
  const server = elements.server.value.trim();
  const username = elements.username.value.trim();
  const password = elements.password.value;

  if (!server) {
    showTestResult('Please enter the server address', 'error');
    return;
  }

  if (!username || !password) {
    showTestResult('Please enter username and password', 'error');
    return;
  }

  // Disable test button
  elements.btnTest.disabled = true;
  elements.btnTest.querySelector('.btn-label').textContent = 'Testing...';

  try {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'testConnection',
          server: server,
          username: username,
          password: password
        },
        resolve
      );
    });

    if (result.success) {
      showTestResult(`Connection successful! User: ${result.user.username || username}`, 'success');
    } else {
      showTestResult(`Connection failed: ${result.error}`, 'error');
    }
  } catch (e) {
    showTestResult(`Connection error: ${e.message}`, 'error');
  } finally {
    elements.btnTest.disabled = false;
    elements.btnTest.querySelector('.btn-label').textContent = 'Test Connection';
  }
}

/**
 * Save configuration handler
 */
async function handleSave() {
  const config = await saveConfig();
  showSaveResult('Settings saved successfully');
}

/**
 * Show server connection test result
 */
function showTestResult(message, type) {
  elements.testResult.textContent = message;
  elements.testResult.className = 'test-result ' + type;
}

/**
 * Show save confirmation banner
 */
function showSaveResult(message) {
  elements.saveResult.textContent = message;
  elements.saveResult.className = 'save-result show success';
  setTimeout(() => {
    elements.saveResult.className = 'save-result';
  }, 2000);
}

/**
 * Test AI translation functionality
 */
async function handleTestAiTranslate() {
  const baseUrl = elements.aiBaseUrl.value.trim();
  const modelId = elements.aiModelId.value.trim();
  const apiKey = elements.aiApiKey.value;
  const prompt = elements.aiPrompt.value;

  if (!baseUrl || !modelId || !apiKey) {
    showAiTestResult('Please complete all required AI configuration fields', 'error');
    return;
  }

  // Disable AI test button
  elements.btnTestAi.disabled = true;
  elements.btnTestAi.querySelector('.btn-label').textContent = 'Testing...';

  try {
    const testText = 'Hello, World!';
    const translatedText = await callAiTranslate(testText, baseUrl, modelId, apiKey, prompt);
    showAiTestResult(`Translation successful! "${testText}" → "${translatedText}"`, 'success');
  } catch (e) {
    showAiTestResult(`Translation failed: ${e.message}`, 'error');
  } finally {
    elements.btnTestAi.disabled = false;
    elements.btnTestAi.querySelector('.btn-label').textContent = 'Test Translation';
  }
}

/**
 * Call AI API for translation
 */
async function callAiTranslate(text, baseUrl, modelId, apiKey, prompt) {
  const url = `${baseUrl}/v1/chat/completions`;
  const systemPrompt = prompt.replace('{text}', text);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: 'user',
          content: systemPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid API response');
  }

  return data.choices[0].message.content.trim();
}

/**
 * Show AI translation test result
 */
function showAiTestResult(message, type) {
  elements.aiTestResult.textContent = message;
  elements.aiTestResult.className = 'test-result ' + type;
}

// Initialize script
init();
