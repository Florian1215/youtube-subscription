const api = typeof browser !== 'undefined' ? browser : chrome;
const SUBSCRIPTIONS_KEY = 'subscriptions';
const subscribeState = {
  map: {},
  ready: false
};
let subscribeRefreshScheduled = false;
let lastUrl = window.location.href;
let lastHomeNotified = null;
const SUBSCRIBE_EVENT_TYPES = ['click', 'keydown', 'pointerdown', 'mousedown', 'touchstart'];
const HANDLER_STORAGE_KEY = '_ytSubManagerHandlers';
const CHANNEL_CONTEXT_ANCESTOR_SELECTOR = [
  'ytd-channel-renderer',
  'ytd-video-renderer',
  'ytd-rich-item-renderer',
  'ytd-rich-grid-media',
  'ytd-rich-grid-row',
  'ytd-mini-channel-renderer',
  'ytd-compact-channel-renderer',
  'ytd-video-owner-renderer',
  'ytd-grid-channel-renderer',
  'ytd-grid-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-playlist-panel-video-renderer',
  'ytd-watch-metadata',
  'ytd-search',
  'ytd-two-column-browse-results-renderer',
  'ytd-c4-tabbed-header-renderer',
  'ytd-browse'
].join(', ');
const CHANNEL_ANCHOR_SELECTORS = [
  'a[href*="/channel/"]',
  'a[href*="youtube.com/channel/"]',
  'a[href^="/@"]',
  'a[href*="youtube.com/@"]'
];
const STANDALONE_SUBSCRIBE_BUTTON_SELECTORS = [
  '#subscribe-button tp-yt-paper-button',
  '#subscribe-button yt-button-shape button',
  '#subscribe-button button'
];
const CHANNEL_NAME_FALLBACK_SELECTORS = [
  '#owner-name a',
  '#channel-name a',
  'yt-formatted-string.ytd-channel-name a',
  'ytd-channel-name a',
  '#owner-name yt-formatted-string',
  '#channel-name yt-formatted-string'
];

function isYoutubeHome() {
  return window.location.origin === 'https://www.youtube.com' && (window.location.pathname === '/' || window.location.pathname === '');
}

function cleanTitle(raw) {
  if (!raw) {
    return null;
  }
  return raw.replace(/ - YouTube$/i, '').trim();
}

function getChannelInfo() {
  const channelIdMeta = document.querySelector('meta[itemprop="channelId"]');
  const channelId = channelIdMeta ? channelIdMeta.getAttribute('content') : null;
  let channelName = null;
  const channelLink = document.querySelector('ytd-channel-name a, #channel-name a, yt-formatted-string.ytd-channel-name a');
  if (channelLink && channelLink.textContent) {
    channelName = channelLink.textContent.trim();
  }
  if (!channelName) {
    const authorMeta = document.querySelector('meta[itemprop="name"], meta[name="author"], meta[itemprop="author"]');
    if (authorMeta) {
      channelName = authorMeta.getAttribute('content');
    }
  }
  if (!channelName) {
    channelName = cleanTitle(document.title);
  }
  return channelId ? { id: channelId, name: channelName || channelId } : null;
}

function getPlaylistInfo() {
  const url = new URL(window.location.href);
  const playlistId = url.searchParams.get('list');
  if (!playlistId) {
    return null;
  }
  let title = null;
  const titleNode = document.querySelector('ytd-playlist-sidebar-primary-info-renderer h1 yt-formatted-string');
  if (titleNode && titleNode.textContent) {
    title = titleNode.textContent.trim();
  }
  if (!title) {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      title = ogTitle.getAttribute('content');
    }
  }
  if (!title) {
    title = cleanTitle(document.title);
  }
  return { id: playlistId, title };
}

function buildContext() {
  const url = new URL(window.location.href);
  const channel = getChannelInfo();
  const playlist = getPlaylistInfo();
  let pageType = 'other';
  if (isYoutubeHome()) {
    pageType = 'home';
  } else if (playlist && url.pathname.includes('/playlist')) {
    pageType = 'playlist';
  } else if (url.searchParams.has('v')) {
    pageType = 'video';
  } else if (channel && (/\/channel\//.test(url.pathname) || /\/@/.test(url.pathname))) {
    pageType = 'channel';
  }
  return {
    href: url.href,
    pageType,
    channel,
    playlist
  };
}

async function initSubscriptionIntegration() {
  await refreshSubscriptionState();
  subscribeState.ready = true;
  scheduleSubscribeButtonRefresh();

  if (api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes[SUBSCRIPTIONS_KEY]) {
        return;
      }
      subscribeState.map = changes[SUBSCRIPTIONS_KEY].newValue || {};
      scheduleSubscribeButtonRefresh();
    });
  }
}

async function refreshSubscriptionState() {
  if (!api.storage || !api.storage.local) {
    subscribeState.map = {};
    return;
  }
  try {
    const stored = await api.storage.local.get({ [SUBSCRIPTIONS_KEY]: {} });
    subscribeState.map = stored[SUBSCRIPTIONS_KEY] || {};
  } catch (error) {
    console.error('Impossible de charger les abonnements', error);
    subscribeState.map = {};
  }
}

function scheduleSubscribeButtonRefresh() {
  if (subscribeRefreshScheduled) {
    return;
  }
  subscribeRefreshScheduled = true;
  requestAnimationFrame(() => {
    subscribeRefreshScheduled = false;
    overrideSubscribeButtons();
  });
}

function overrideSubscribeButtons() {
  if (!subscribeState.ready) {
    return;
  }
  const renderers = document.querySelectorAll('ytd-subscribe-button-renderer');
  renderers.forEach((renderer) => processSubscribeRenderer(renderer));

  const standaloneButtons = collectStandaloneSubscribeButtons();
  standaloneButtons.forEach((button) => processSubscribeRenderer(button));
}

function collectStandaloneSubscribeButtons() {
  const results = [];
  const seen = new Set();
  STANDALONE_SUBSCRIBE_BUTTON_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((candidate) => {
      if (!candidate || seen.has(candidate)) {
        return;
      }
      if (candidate.closest('ytd-subscribe-button-renderer')) {
        return;
      }
      seen.add(candidate);
      results.push(candidate);
    });
  });
  return results;
}

function ensureSubscribeOverride(target, renderer, channelId) {
  if (!target) {
    return;
  }
  const stored = target[HANDLER_STORAGE_KEY] || {};
  const desiredChannel = channelId || null;

  SUBSCRIBE_EVENT_TYPES.forEach((eventName) => {
    const existing = stored[eventName];
    if (existing && existing.channelId === desiredChannel) {
      return;
    }
    if (existing) {
      target.removeEventListener(eventName, existing.listener, true);
    }
    const listener = (event) => handleSubscribeEvent(event, renderer, channelId);
    target.addEventListener(eventName, listener, true);
    stored[eventName] = {
      listener,
      channelId: desiredChannel
    };
  });

  target[HANDLER_STORAGE_KEY] = stored;
}

function handleSubscribeEvent(event, renderer, channelId) {
  if (!event) {
    return;
  }
  if (event.type === 'keydown' && !isActivationKey(event)) {
    return;
  }

  if (event.type === 'click' || event.type === 'keydown') {
    if (event.type === 'keydown' && event.repeat) {
      preventEvent(event);
      return;
    }
    preventEvent(event);
    onSubscribeButtonClick(event, renderer, channelId);
    return;
  }

  // For pointer-based events, block propagation so YouTube does not handle them
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation();
  }
}

function preventEvent(event) {
  if (!event) {
    return;
  }
  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  if (typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation();
  }
}

function isActivationKey(event) {
  const key = event?.key;
  if (!key) {
    return false;
  }
  return key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 'Space';
}

function processSubscribeRenderer(renderer) {
  if (!renderer) {
    return;
  }
  const channelId = getChannelIdFromRenderer(renderer);
  const handle = getChannelHandleFromRenderer(renderer);
  if (channelId) {
    renderer.dataset.ytSubManagerChannel = channelId;
  } else {
    delete renderer.dataset.ytSubManagerChannel;
  }
  if (handle) {
    renderer.dataset.ytSubManagerHandle = handle;
  } else {
    delete renderer.dataset.ytSubManagerHandle;
  }
  let button = findClickableSubscribeButton(renderer);
  if (!button && isStandaloneClickable(renderer)) {
    button = renderer;
  }
  if (button && button._ytSubManagerHandler) {
    button.removeEventListener('click', button._ytSubManagerHandler, true);
    delete button._ytSubManagerHandler;
  }
  ensureSubscribeOverride(renderer, renderer, channelId || null);
  if (button) {
    ensureSubscribeOverride(button, renderer, channelId || null);
  }
  if (channelId) {
    if (button) {
      button.dataset.ytSubManagerChannel = channelId;
    }
  } else {
    if (button) {
      delete button.dataset.ytSubManagerChannel;
    }
  }
  if (handle && button) {
    button.dataset.ytSubManagerHandle = handle;
  } else if (button) {
    delete button.dataset.ytSubManagerHandle;
  }
  updateSubscribeButton(renderer, button || null, channelId || null);
}

function findClickableSubscribeButton(renderer) {
  return renderer.querySelector('yt-button-shape button')
    || renderer.querySelector('button')
    || renderer.querySelector('tp-yt-paper-button');
}

function isStandaloneClickable(element) {
  if (!element || !element.tagName) {
    return false;
  }
  const tag = element.tagName.toUpperCase();
  return tag === 'BUTTON' || tag === 'TP-YT-PAPER-BUTTON';
}

function extractChannelIdFromNode(node) {
  if (!node) {
    return null;
  }
  const attrCandidates = [
    node.getAttribute?.('data-channel-id'),
    node.getAttribute?.('data-yt-channel-id'),
    node.getAttribute?.('data-channel-external-id'),
    node.getAttribute?.('data-yt-external-id')
  ];
  for (const candidate of attrCandidates) {
    const extracted = extractChannelId(candidate);
    if (extracted) {
      return extracted;
    }
  }
  if (node.dataset) {
    const dataCandidates = [
      node.dataset.ytChannelId,
      node.dataset.channelId,
      node.dataset.channelExternalId,
      node.dataset.uixContextMenuItemId,
      node.dataset.externalChannelId,
      node.dataset.targetId
    ];
    for (const candidate of dataCandidates) {
      const extracted = extractChannelId(candidate);
      if (extracted) {
        return extracted;
      }
    }
  }
  const propCandidates = [
    node.channelId,
    node.channel?.channelId,
    node.browseId,
    node.navigationEndpoint?.browseEndpoint?.browseId,
    node.commandMetadata?.webCommandMetadata?.url
  ];
  for (const candidate of propCandidates) {
    const extracted = extractChannelId(candidate);
    if (extracted) {
      return extracted;
    }
  }

  const dataSources = [
    node.data,
    node.__data,
    node.__data?.data,
    node.__dataHost?.data,
    node.__dataHost?.data?.subscribeButton
  ];

  for (const source of dataSources) {
    const extracted = deepSearchForChannelId(source);
    if (extracted) {
      return extracted;
    }
  }
  return null;
}

function extractChannelHandleFromNode(node) {
  if (!node) {
    return null;
  }
  const attrCandidates = [
    node.getAttribute?.('data-yt-channel-handle'),
    node.getAttribute?.('data-channel-handle'),
    node.getAttribute?.('data-handle')
  ];
  for (const candidate of attrCandidates) {
    if (candidate && candidate.includes('@')) {
      return normaliseHandle(candidate);
    }
  }
  if (node.dataset) {
    const dataCandidates = [
      node.dataset.ytChannelHandle,
      node.dataset.channelHandle,
      node.dataset.handle,
      node.dataset.ytHandle
    ];
    for (const candidate of dataCandidates) {
      if (candidate && candidate.includes('@')) {
        return normaliseHandle(candidate);
      }
    }
  }
  const propCandidates = [
    node.channelHandle,
    node.handle,
    node.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl,
    node.commandMetadata?.webCommandMetadata?.url
  ];
  for (const candidate of propCandidates) {
    if (typeof candidate === 'string' && candidate.includes('@')) {
      return normaliseHandle(candidate);
    }
  }

  const dataSources = [
    node.data,
    node.__data,
    node.__data?.data,
    node.__dataHost?.data,
    node.__dataHost?.data?.subscribeButton
  ];

  for (const source of dataSources) {
    const extracted = deepSearchForChannelHandle(source);
    if (extracted) {
      return extracted;
    }
  }
  return null;
}

function deepSearchForChannelId(source, maxDepth = 5, seen = new Set()) {
  if (!source || maxDepth < 0) {
    return null;
  }
  if (typeof source === 'string') {
    return extractChannelId(source);
  }
  if (typeof source !== 'object') {
    return null;
  }
  if (seen.has(source)) {
    return null;
  }
  seen.add(source);

  const keys = [
    'channelId',
    'channelIds',
    'browseId',
    'externalChannelId',
    'navigationEndpoint',
    'commandMetadata',
    'url',
    'apiUrl',
    'webPageType',
    'targetId',
    'trackingParams',
    'subscribeEndpoint'
  ];

  for (const key of keys) {
    const value = source[key];
    if (!value) {
      continue;
    }
    if (typeof value === 'string') {
      const extracted = extractChannelId(value);
      if (extracted) {
        return extracted;
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        const extracted = deepSearchForChannelId(item, maxDepth - 1, seen);
        if (extracted) {
          return extracted;
        }
      }
    } else if (typeof value === 'object') {
      const extracted = deepSearchForChannelId(value, maxDepth - 1, seen);
      if (extracted) {
        return extracted;
      }
    }
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const extracted = deepSearchForChannelId(item, maxDepth - 1, seen);
      if (extracted) {
        return extracted;
      }
    }
  } else {
    for (const value of Object.values(source)) {
      if (typeof value === 'string') {
        const extracted = extractChannelId(value);
        if (extracted) {
          return extracted;
        }
      }
    }
    for (const value of Object.values(source)) {
      const extracted = deepSearchForChannelId(value, maxDepth - 1, seen);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}

function deepSearchForChannelHandle(source, maxDepth = 5, seen = new Set()) {
  if (!source || maxDepth < 0) {
    return null;
  }
  if (typeof source === 'string') {
    if (source.includes('@')) {
      return normaliseHandle(source);
    }
    return null;
  }
  if (typeof source !== 'object') {
    return null;
  }
  if (seen.has(source)) {
    return null;
  }
  seen.add(source);

  const keys = [
    'handle',
    'handles',
    'channelHandle',
    'canonicalBaseUrl',
    'url',
    'subscriptionChannelHandle'
  ];

  for (const key of keys) {
    const value = source[key];
    if (!value) {
      continue;
    }
    if (typeof value === 'string' && value.includes('@')) {
      return normaliseHandle(value);
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const extracted = deepSearchForChannelHandle(item, maxDepth - 1, seen);
        if (extracted) {
          return extracted;
        }
      }
    } else if (typeof value === 'object') {
      const extracted = deepSearchForChannelHandle(value, maxDepth - 1, seen);
      if (extracted) {
        return extracted;
      }
    }
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const extracted = deepSearchForChannelHandle(item, maxDepth - 1, seen);
      if (extracted) {
        return extracted;
      }
    }
  } else {
    for (const value of Object.values(source)) {
      if (typeof value === 'string' && value.includes('@')) {
        return normaliseHandle(value);
      }
    }
    for (const value of Object.values(source)) {
      const extracted = deepSearchForChannelHandle(value, maxDepth - 1, seen);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}

function findChannelContextNodes(renderer) {
  const nodes = [];
  const visited = new Set();

  const addNode = (node) => {
    if (!node || typeof node.querySelector !== 'function' || visited.has(node)) {
      return;
    }
    visited.add(node);
    nodes.push(node);
  };

  addNode(renderer);

  if (renderer && typeof renderer.closest === 'function') {
    let ancestor = renderer.closest(CHANNEL_CONTEXT_ANCESTOR_SELECTOR);
    while (ancestor) {
      addNode(ancestor);
      if (ancestor.parentElement && typeof ancestor.parentElement.closest === 'function') {
        const next = ancestor.parentElement.closest(CHANNEL_CONTEXT_ANCESTOR_SELECTOR);
        if (!next || visited.has(next)) {
          break;
        }
        ancestor = next;
      } else {
        break;
      }
    }
  }

  if (renderer && renderer.parentElement) {
    let parent = renderer.parentElement;
    while (parent) {
      addNode(parent);
      parent = parent.parentElement;
    }
  }

  if (renderer && typeof renderer.getRootNode === 'function') {
    const root = renderer.getRootNode();
    if (root && root.host) {
      addNode(root.host);
    } else if (root && root !== document && typeof root.querySelector === 'function') {
      addNode(root);
    }
  }

  return nodes;
}

function findChannelAnchor(renderer) {
  const nodes = findChannelContextNodes(renderer);
  for (const node of nodes) {
    if (!node || typeof node.querySelector !== 'function') {
      continue;
    }
    if (node === document || node === document.documentElement || node === document.body) {
      continue;
    }
    for (const selector of CHANNEL_ANCHOR_SELECTORS) {
      const anchor = node.querySelector(selector);
      if (anchor) {
        return anchor;
      }
    }
  }
  if (typeof document !== 'undefined') {
    for (const selector of CHANNEL_ANCHOR_SELECTORS) {
      const anchor = document.querySelector(selector);
      if (anchor) {
        return anchor;
      }
    }
  }
  return null;
}

function findChannelTextNode(renderer) {
  const anchor = findChannelAnchor(renderer);
  if (anchor && anchor.textContent && anchor.textContent.trim()) {
    return anchor;
  }
  const nodes = findChannelContextNodes(renderer);
  for (const node of nodes) {
    if (!node || typeof node.querySelector !== 'function') {
      continue;
    }
    if (node === document || node === document.documentElement || node === document.body) {
      continue;
    }
    for (const selector of CHANNEL_NAME_FALLBACK_SELECTORS) {
      const candidate = node.querySelector(selector);
      if (candidate && candidate.textContent && candidate.textContent.trim()) {
        return candidate;
      }
    }
  }
  if (typeof document !== 'undefined') {
    for (const selector of CHANNEL_NAME_FALLBACK_SELECTORS) {
      const candidate = document.querySelector(selector);
      if (candidate && candidate.textContent && candidate.textContent.trim()) {
        return candidate;
      }
    }
  }
  return null;
}

function extractChannelId(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const match = value.match(/UC[0-9A-Za-z_-]{22}/);
  return match ? match[0] : null;
}

function onSubscribeButtonClick(event, renderer, channelId) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const button = findClickableSubscribeButton(renderer);
  const busy = (button && button.dataset.ytSubManagerBusy === 'true')
    || (renderer && renderer.dataset.ytSubManagerBusy === 'true');
  if (!renderer || busy) {
    return;
  }

  const info = buildChannelInfo(renderer, channelId);

  if (!info.channelId && !info.handle && !info.name) {
    console.warn('Impossible d\'identifier la chaîne depuis le bouton YouTube.', renderer);
    return;
  }

  if (info.channelId && isChannelSubscribed(info.channelId)) {
    updateSubscribeButton(renderer, button, info.channelId);
    if (button && typeof button.blur === 'function') {
      button.blur();
    }
    return;
  }

  setSubscribeControlBusy(renderer, button, true);
  const message = buildSubscribeMessage(info);

  api.runtime.sendMessage(message)
    .then(async (response) => {
      if (response && response.ok && response.result && response.result.subscription) {
        const subscription = response.result.subscription;
        if (subscription && subscription.id) {
          renderer.dataset.ytSubManagerChannel = subscription.id;
          const btn = findClickableSubscribeButton(renderer);
          if (btn) {
            btn.dataset.ytSubManagerChannel = subscription.id;
          }
          info.channelId = subscription.id;
        }
        await refreshSubscriptionState();
      } else if (response && !response.ok) {
        throw new Error(response.error || 'Erreur inconnue');
      }
    })
    .catch((error) => {
      console.error('Impossible d\'ajouter la chaîne via le bouton', error);
    })
    .finally(() => {
      setSubscribeControlBusy(renderer, button, false);
      const refreshedId = info.channelId || renderer.dataset.ytSubManagerChannel || null;
      updateSubscribeButton(renderer, button, refreshedId);
      scheduleSubscribeButtonRefresh();
    });
}

function setSubscribeControlBusy(renderer, button, busy) {
  if (!renderer && !button) {
    return;
  }
  const targets = [];
  if (renderer) {
    targets.push(renderer);
  }
  if (button && button !== renderer) {
    targets.push(button);
  }

  targets.forEach((target) => {
    if (!target) {
      return;
    }
    if (busy) {
      target.dataset.ytSubManagerBusy = 'true';
      target.setAttribute('aria-busy', 'true');
    } else {
      delete target.dataset.ytSubManagerBusy;
      target.removeAttribute('aria-busy');
    }
  });

  if (button) {
    if (busy) {
      setButtonLabel(button, 'Ajout…');
      if (typeof button.disabled !== 'undefined') {
        button.disabled = true;
      }
      button.classList.add('yt-sub-manager-busy');
    } else {
      if (typeof button.disabled !== 'undefined') {
        button.disabled = false;
      }
      button.classList.remove('yt-sub-manager-busy');
    }
  } else if (renderer) {
    renderer.classList.toggle('yt-sub-manager-busy', busy);
  }
}

function updateSubscribeButton(renderer, button, channelId) {
  const subscribed = channelId ? isChannelSubscribed(channelId) : false;
  if (button) {
    const label = subscribed ? 'Abonné' : "S'abonner";
    setButtonLabel(button, label);
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', subscribed ? 'true' : 'false');
    button.dataset.ytSubManagerState = subscribed ? 'subscribed' : 'idle';
    button.classList.toggle('yt-sub-manager-subscribed', subscribed);
  }
  if (renderer) {
    renderer.dataset.ytSubManagerState = subscribed ? 'subscribed' : 'idle';
    renderer.classList.toggle('yt-sub-manager-subscribed', subscribed);
  }
}

function setButtonLabel(button, label) {
  let labelNode = button.querySelector('yt-formatted-string#text');
  if (!labelNode) {
    labelNode = button.querySelector('#text');
  }
  if (!labelNode) {
    labelNode = button.querySelector('span');
  }
  if (labelNode) {
    labelNode.textContent = label;
  } else {
    button.textContent = label;
  }
}

function getChannelIdFromRenderer(renderer) {
  if (!renderer) {
    return null;
  }
  const dataChannel = renderer.data?.channelId || renderer.data?.channelIds?.[0];
  if (dataChannel) {
    return dataChannel;
  }
  const internal = renderer.__dataHost?.data?.channelId
    || renderer.__data?.channelId
    || renderer.__dataHost?.data?.channelIds?.[0];
  if (internal) {
    return internal;
  }
  const direct = renderer.getAttribute('data-channel-external-id')
    || renderer.dataset.channelExternalId
    || renderer.getAttribute('data-yt-channel-id')
    || renderer.dataset.ytChannelId;
  if (direct) {
    const extracted = extractChannelId(direct);
    if (extracted) {
      return extracted;
    }
    return direct;
  }
  const anchor = findChannelAnchor(renderer);
  if (anchor) {
    const dataAttrId = anchor.dataset?.ytChannelId
      || anchor.dataset?.channelId
      || anchor.dataset?.ytid
      || anchor.dataset?.uixContextMenuItemId
      || anchor.getAttribute('data-channel-id');
    const idFromData = extractChannelId(dataAttrId);
    if (idFromData) {
      return idFromData;
    }
    const endpointAttr = anchor.getAttribute('data-yt-endpoint');
    if (endpointAttr) {
      try {
        const endpoint = JSON.parse(endpointAttr);
        const candidates = [
          endpoint?.browseEndpoint?.browseId,
          endpoint?.navigationEndpoint?.browseEndpoint?.browseId,
          endpoint?.commandMetadata?.webCommandMetadata?.url,
          endpoint?.commandMetadata?.webCommandMetadata?.apiUrl,
          endpoint?.commandMetadata?.webCommandMetadata?.webPageType
        ];
        for (const candidate of candidates) {
          const extracted = extractChannelId(candidate);
          if (extracted) {
            return extracted;
          }
        }
      } catch (error) {
        // ignore malformed endpoint data
      }
    }
    const href = anchor.getAttribute('href') || anchor.href || '';
    const idFromHref = extractChannelId(href);
    if (idFromHref) {
      return idFromHref;
    }
    const serializedEndpoint = anchor.getAttribute('data-serialized-endpoint');
    if (serializedEndpoint) {
      try {
        const endpoint = JSON.parse(serializedEndpoint);
        const extracted = extractChannelId(endpoint?.browseEndpoint?.browseId
          || endpoint?.commandMetadata?.webCommandMetadata?.url);
        if (extracted) {
          return extracted;
        }
      } catch (error) {
        // ignore malformed endpoint data
      }
    }
  }
  const contextNodes = findChannelContextNodes(renderer);
  for (const node of contextNodes) {
    const extracted = extractChannelIdFromNode(node);
    if (extracted) {
      return extracted;
    }
  }
  const button = findClickableSubscribeButton(renderer);
  if (button && button.hasAttribute('data-channel-external-id')) {
    const value = button.getAttribute('data-channel-external-id');
    const extracted = extractChannelId(value);
    return extracted || value;
  }
  if (button && button.dataset && button.dataset.channelId) {
    const extracted = extractChannelId(button.dataset.channelId);
    if (extracted) {
      return extracted;
    }
  }
  const context = getChannelInfo();
  if (context && context.id) {
    return context.id;
  }
  return null;
}

function getChannelHandleFromRenderer(renderer) {
  if (!renderer) {
    return null;
  }
  const handleAttr = renderer.getAttribute('data-yt-channel-handle')
    || renderer.dataset.ytChannelHandle
    || renderer.data?.channelHandle
    || renderer.__data?.channelHandle;
  if (handleAttr) {
    return normaliseHandle(handleAttr);
  }
  const anchor = findChannelAnchor(renderer);
  if (anchor) {
    const href = anchor.getAttribute('href') || anchor.href || '';
    if (href.includes('@')) {
      return normaliseHandle(href);
    }
    const dataHandle = anchor.getAttribute('data-yt-handle')
      || anchor.dataset?.ytHandle
      || anchor.dataset?.handle;
    if (dataHandle) {
      return normaliseHandle(dataHandle);
    }
  }
  const contextNodes = findChannelContextNodes(renderer);
  for (const node of contextNodes) {
    const extracted = extractChannelHandleFromNode(node);
    if (extracted) {
      return extracted;
    }
  }
  const nameNode = findChannelTextNode(renderer);
  if (nameNode && nameNode.textContent && nameNode.textContent.trim().startsWith('@')) {
    return normaliseHandle(nameNode.textContent.trim());
  }
  const context = getChannelInfo();
  if (context && context.name && context.name.startsWith('@')) {
    return normaliseHandle(context.name);
  }
  return null;
}

function normaliseHandle(raw) {
  if (!raw) {
    return null;
  }
  const cleaned = raw.replace(/^.*@/, '@').trim();
  return cleaned.startsWith('@') ? cleaned : `@${cleaned}`;
}

function deriveChannelName(renderer, channelId) {
  const label = renderer.getAttribute('aria-label');
  if (label) {
    const nameMatch = label.match(/“([^”]+)”/);
    if (nameMatch) {
      return nameMatch[1];
    }
  }
  const textNode = findChannelTextNode(renderer);
  if (textNode && textNode.textContent) {
    const text = textNode.textContent.trim();
    if (text) {
      return text;
    }
  }
  const context = getChannelInfo();
  if (context && context.id && channelId && context.id === channelId && context.name) {
    return context.name;
  }
  if ((!channelId || !context?.id) && context && context.name) {
    return context.name;
  }
  return channelId || null;
}

function isChannelSubscribed(channelId) {
  if (!channelId) {
    return false;
  }
  return Boolean(subscribeState.map[`channel:${channelId}`]);
}

function buildChannelInfo(renderer, initialChannelId) {
  const context = getChannelInfo();
  const channelId = initialChannelId || renderer.dataset.ytSubManagerChannel || context?.id || null;
  const handle = renderer.dataset.ytSubManagerHandle || getChannelHandleFromRenderer(renderer);
  const derivedName = deriveChannelName(renderer, channelId);
  const name = derivedName || context?.name || (handle ? handle.replace(/^@/, '') : null) || channelId;
  return { channelId, handle, name };
}

function buildSubscribeMessage(info) {
  if (info.channelId) {
    return {
      type: 'subscribe',
      details: {
        type: 'channel',
        id: info.channelId,
        name: info.name || info.handle || info.channelId
      }
    };
  }

  const fallback = info.handle || info.name;
  return {
    type: 'subscribe',
    fromPopup: true,
    input: fallback || ''
  };
}

function handleLocationChange() {
  const currentUrl = window.location.href;
  if (currentUrl === lastUrl) {
    return;
  }
  lastUrl = currentUrl;
  if (isYoutubeHome() && lastHomeNotified !== currentUrl) {
    lastHomeNotified = currentUrl;
    api.runtime.sendMessage({ type: 'youtube-home' }).catch(() => {});
  }
}

const observer = new MutationObserver(() => {
  handleLocationChange();
  scheduleSubscribeButtonRefresh();
});

observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('yt-navigate-finish', handleLocationChange);
window.addEventListener('popstate', handleLocationChange);
window.addEventListener('pushstate', handleLocationChange);
window.addEventListener('yt-navigate-finish', scheduleSubscribeButtonRefresh);
window.addEventListener('popstate', scheduleSubscribeButtonRefresh);
window.addEventListener('pushstate', scheduleSubscribeButtonRefresh);

if (isYoutubeHome()) {
  lastHomeNotified = window.location.href;
  api.runtime.sendMessage({ type: 'youtube-home' }).catch(() => {});
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getPageContext') {
    const context = buildContext();
    sendResponse({ ok: true, context });
    return;
  }
  return undefined;
});

initSubscriptionIntegration().catch((error) => {
  console.error('Erreur init abonnement personnalisé', error);
});
