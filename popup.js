const api = typeof browser !== 'undefined' ? browser : chrome;
const SUBSCRIPTIONS_KEY = 'subscriptions';
const EMPTY_MESSAGE = "No subscriptions yet.";
const NO_RESULTS_MESSAGE = 'No subscriptions match your search.';
const state = {
  subscriptions: {},
  context: null,
  tabId: null,
  tabUrl: null,
  searchQuery: '',
  sortBy: 'latest'
};
let statusTimeout = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindUi();
  await loadSubscriptions();
  await loadContext();
  renderSubscriptions();
  renderContext();
}

function bindUi() {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const addButton = document.getElementById('add-button');
  const sortSelect = document.getElementById('sort-select');

  searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleAddFromSearch();
  });

  addButton.addEventListener('click', async (event) => {
    event.preventDefault();
    await handleAddFromSearch();
  });

  searchInput.addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    clearAddError();
    renderSubscriptions();
  });

  const refreshButton = document.getElementById('refresh');
  refreshButton.addEventListener('click', async () => {
    await runManualCheck();
  });

  if (sortSelect) {
    sortSelect.value = state.sortBy;
    sortSelect.addEventListener('change', (event) => {
      state.sortBy = event.target.value;
      renderSubscriptions();
    });
  }
}

async function loadSubscriptions() {
  try {
    const response = await api.runtime.sendMessage({ type: 'get-subscriptions' });
    if (response && response.ok) {
      const subs = response.result.subscriptions || {};
      for (const [key, sub] of Object.entries(subs)) {
        if (sub && typeof sub === 'object') {
          sub.key = sub.key || key;
        }
      }
      state.subscriptions = subs;
    }
  } catch (error) {
    showStatus(`Error loading subscriptions: ${error.message || error}`, { error: true, persist: true });
  }
}

async function loadContext() {
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      state.context = null;
      return;
    }
    const tab = tabs[0];
    state.tabId = tab.id;
    state.tabUrl = tab.url;
    if (!/^https:\/\/www\.youtube\.com\//.test(tab.url || '')) {
      state.context = null;
      return;
    }
    const response = await api.tabs.sendMessage(tab.id, { type: 'getPageContext' });
    if (response && response.ok) {
      state.context = response.context;
    } else {
      state.context = null;
    }
  } catch (error) {
    state.context = null;
  }
}

function renderContext() {
  const section = document.getElementById('context-section');
  const container = document.getElementById('context-content');
  container.innerHTML = '';
  if (!state.context) {
    section.classList.add('hidden');
    return;
  }
  const entries = [];
  if (state.context.channel && state.context.channel.id) {
    const channelEntryName = state.context.channel.name || state.context.channel.id;
    entries.push({
      type: 'channel',
      id: state.context.channel.id,
      name: channelEntryName,
      channelName: channelEntryName
    });
  }
  if (state.context.playlist && state.context.playlist.id) {
    const playlistName = formatPlaylistDisplayName(state.context.playlist, state.context.channel);
    entries.push({
      type: 'playlist',
      id: state.context.playlist.id,
      name: playlistName,
      channelName: state.context.channel?.name || state.context.channel?.id || null
    });
  }
  if (!entries.length) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  const template = document.getElementById('context-template');
  entries.forEach((entry) => {
    const clone = template.content.firstElementChild.cloneNode(true);
    const details = clone.querySelector('.context-details');
    const action = clone.querySelector('.context-action');
    details.textContent = entry.type === 'channel'
      ? `Channel: ${entry.name}`
      : `Playlist: ${entry.name}`;
    const key = makeKey(entry.type, entry.id);
    const subscribed = Boolean(state.subscriptions[key]);
    if (subscribed) {
      action.textContent = entry.type === 'channel' ? 'Subscribed' : 'Playlist followed';
      action.classList.add('subscribed');
      action.disabled = true;
    } else {
      action.textContent = entry.type === 'channel' ? "Subscribe" : 'Follow playlist';
      action.addEventListener('click', async () => {
        await subscribeFromContext(entry);
      });
    }
    container.appendChild(clone);
  });
}

function renderSubscriptions() {
  const list = document.getElementById('subscriptions-list');
  list.innerHTML = '';
  const emptyMessage = document.getElementById('empty-message');
  const subscriptions = Object.values(state.subscriptions);
  const query = (state.searchQuery || '').trim().toLowerCase();
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect && sortSelect.value !== state.sortBy) {
    sortSelect.value = state.sortBy;
  }
  if (!subscriptions.length) {
    emptyMessage.textContent = EMPTY_MESSAGE;
    emptyMessage.classList.remove('hidden');
    return;
  }
  const filtered = query
    ? subscriptions.filter((subscription) => subscription.name.toLowerCase().includes(query))
    : subscriptions;
  if (!filtered.length) {
    emptyMessage.textContent = NO_RESULTS_MESSAGE;
    emptyMessage.classList.remove('hidden');
    return;
  }
  emptyMessage.textContent = EMPTY_MESSAGE;
  emptyMessage.classList.add('hidden');
  const template = document.getElementById('subscription-template');
  sortSubscriptions(filtered).forEach((subscription) => {
    const clone = template.content.firstElementChild.cloneNode(true);
    const subscriptionKey = subscription.key || makeKey(subscription.type, subscription.id);
    clone.dataset.key = subscriptionKey;
    subscription.key = subscriptionKey;
    const nameEl = clone.querySelector('.subscription-name');
    nameEl.textContent = subscription.name;
    nameEl.setAttribute('role', 'button');
    nameEl.setAttribute('tabindex', '0');
    nameEl.title = 'Open on YouTube';
    const openHandler = () => openSubscriptionTarget(subscription);
    nameEl.addEventListener('click', openHandler);
    nameEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openHandler();
      }
    });
    clone.querySelector('.subscription-meta').textContent = buildMeta(subscription);
    const removeButton = clone.querySelector('.remove');
    removeButton.addEventListener('click', async () => {
      await removeSubscription(subscription);
    });
    const reverseButton = clone.querySelector('.reverse');
    if (subscription.type === 'playlist') {
      reverseButton.classList.remove('hidden');
      if (subscription.reverse) {
        reverseButton.classList.add('active');
      }
      reverseButton.addEventListener('click', async () => {
        await toggleReverse(subscription);
      });
    } else {
      reverseButton.classList.add('hidden');
    }
    list.appendChild(clone);
  });
}

async function subscribeFromContext(entry) {
  try {
    showStatus("Adding subscription…");
    const response = await api.runtime.sendMessage({
      type: 'subscribe',
      details: {
        type: entry.type,
        id: entry.id,
        name: entry.name,
        channelName: entry.channelName || null
      }
    });
    if (response && response.ok) {
      const { subscription, alreadySubscribed } = response.result;
      if (subscription) {
        const subscriptionKey = subscription.key || makeKey(subscription.type, subscription.id);
        subscription.key = subscriptionKey;
        state.subscriptions[subscriptionKey] = subscription;
      }
      renderContext();
      renderSubscriptions();
      showStatus(alreadySubscribed ? `${subscription.name} is already followed` : `${subscription.name} added`, { success: true });
    } else if (response && !response.ok) {
      throw new Error(response.error);
    }
  } catch (error) {
    showStatus(error.message || "Unable to add subscription", { error: true, persist: true });
  }
}

async function handleAddFromSearch() {
  const input = document.getElementById('search-input');
  const value = input.value.trim();
  if (!value) {
    const contextEntry = selectAutoContextEntry();
    if (!contextEntry) {
      setAddError('Specify a channel or URL to add.');
      return;
    }
    clearAddError();
    setSearchControlsDisabled(true);
    try {
      await subscribeFromContext(contextEntry);
    } finally {
      setSearchControlsDisabled(false);
    }
    return;
  }
  setSearchControlsDisabled(true);
  clearAddError();
  try {
    const response = await api.runtime.sendMessage({ type: 'subscribe', fromPopup: true, input: value });
    if (!response.ok) {
      throw new Error(response.error);
    }
    const { subscription, alreadySubscribed } = response.result;
    if (subscription) {
      const subscriptionKey = subscription.key || makeKey(subscription.type, subscription.id);
      subscription.key = subscriptionKey;
      state.subscriptions[subscriptionKey] = subscription;
      renderSubscriptions();
      renderContext();
      showStatus(alreadySubscribed ? `${subscription.name} is already followed` : `${subscription.name} added`);
      clearAddError();
      if (!alreadySubscribed) {
        state.searchQuery = subscription.name;
        input.value = subscription.name;
        renderSubscriptions();
      }
    }
  } catch (error) {
    setAddError(error.message || 'Unable to add');
  } finally {
    setSearchControlsDisabled(false);
  }
}

function selectAutoContextEntry() {
  if (!state.context) {
    return null;
  }
  const { context } = state;
  if (context.pageType === 'playlist' && context.playlist?.id) {
    return {
      type: 'playlist',
      id: context.playlist.id,
      name: formatPlaylistDisplayName(context.playlist, context.channel),
      channelName: context.channel?.name || context.channel?.id || null
    };
  }
  if (context.pageType === 'channel' && context.channel?.id) {
    return {
      type: 'channel',
      id: context.channel.id,
      name: context.channel.name || context.channel.id,
      channelName: context.channel.name || context.channel.id
    };
  }
  if (context.playlist?.id) {
    return {
      type: 'playlist',
      id: context.playlist.id,
      name: formatPlaylistDisplayName(context.playlist, context.channel),
      channelName: context.channel?.name || context.channel?.id || null
    };
  }
  if (context.channel?.id) {
    return {
      type: 'channel',
      id: context.channel.id,
      name: context.channel.name || context.channel.id,
      channelName: context.channel.name || context.channel.id
    };
  }
  return null;
}

function formatPlaylistDisplayName(playlist, channel) {
  const playlistName = (playlist && (playlist.title || playlist.id)) || null;
  const channelName = (channel && (channel.name || channel.id)) || null;
  if (playlistName && channelName && playlistName !== channelName) {
    return `${playlistName} - ${channelName}`;
  }
  return playlistName || channelName || '';
}

async function removeSubscription(subscription) {
  try {
    const subscriptionKey = subscription.key || makeKey(subscription.type, subscription.id);
    const response = await api.runtime.sendMessage({
      type: 'unsubscribe',
      details: { type: subscription.type, id: subscription.id }
    });
    if (response && response.ok && response.result.removed) {
      delete state.subscriptions[subscriptionKey];
      renderSubscriptions();
      renderContext();
      showStatus(`${subscription.name} removed`);
    }
  } catch (error) {
    showStatus(error.message || 'Unable to remove', { error: true, persist: true });
  }
}

async function toggleReverse(subscription) {
  try {
    const response = await api.runtime.sendMessage({
      type: 'toggle-reverse',
      details: { type: subscription.type, id: subscription.id }
    });
    if (response && response.ok) {
      const updated = response.result.subscription;
      const subscriptionKey = updated.key || makeKey(updated.type, updated.id);
      updated.key = subscriptionKey;
      state.subscriptions[subscriptionKey] = updated;
      renderSubscriptions();
      showStatus(`${updated.name}: playback ${updated.reverse ? 'oldest → newest' : 'newest → oldest'}`);
    }
  } catch (error) {
    showStatus(error.message || 'Action failed', { error: true, persist: true });
  }
}

async function runManualCheck() {
  try {
    showStatus('Checking for new videos…');
    const response = await api.runtime.sendMessage({ type: 'check-now' });
    if (response && response.ok) {
      const { opened, skipped } = response.result;
      if (skipped) {
        showStatus('A check is already in progress');
        return;
      }
      if (!opened || !opened.length) {
        showStatus('No new videos found');
      } else {
        const total = opened.reduce((sum, item) => sum + item.videos.length, 0);
        showStatus(`${total} new video(s) opened`);
      }
      await loadSubscriptions();
      renderSubscriptions();
    }
  } catch (error) {
    showStatus(error.message || 'Unable to check', { error: true, persist: true });
  }
}

function buildMeta(subscription) {
  const parts = [];
  parts.push(subscription.type === 'channel' ? 'Channel' : 'Playlist');
  if (subscription.type === 'playlist' && subscription.reverse) {
    parts.push('reversed order');
  }
  if (subscription.latestVideoPublishedAt) {
    const relPublished = formatRelative(subscription.latestVideoPublishedAt);
    if (relPublished !== 'unknown') {
      parts.push(`last video ${relPublished}`);
    }
  }
  return parts.join(' · ');
}

function formatRelative(input) {
  if (input === null || input === undefined) {
    return 'unknown';
  }
  let timestamp = input;
  if (typeof timestamp === 'string') {
    timestamp = Date.parse(timestamp);
  }
  if (!Number.isFinite(timestamp)) {
    return 'unknown';
  }
  const diff = Date.now() - timestamp;
  if (!Number.isFinite(diff) || diff <= 0) {
    return 'just now';
  }
  if (diff < 60_000) {
    return 'a few seconds ago';
  }
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.round(diff / 86_400_000);
  return `${days} d ago`;
}

function setSearchControlsDisabled(disabled) {
  const input = document.getElementById('search-input');
  const button = document.getElementById('add-button');
  input.disabled = disabled;
  button.disabled = disabled;
}

function setAddError(message) {
  const errorBox = document.getElementById('add-error');
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function clearAddError() {
  const errorBox = document.getElementById('add-error');
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
}

function openSubscriptionTarget(subscription) {
  if (!subscription) {
    return;
  }
  let url = 'https://www.youtube.com/';
  if (subscription.type === 'channel') {
    url = `https://www.youtube.com/channel/${subscription.id}`;
  } else if (subscription.type === 'playlist') {
    url = `https://www.youtube.com/playlist?list=${subscription.id}`;
  }
  api.tabs.create({ url, active: true });
}

function makeKey(type, id) {
  return `${type}:${id}`;
}

function sortSubscriptions(subscriptions) {
  const sortBy = state.sortBy;
  if (sortBy === 'alpha') {
    return [...subscriptions].sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...subscriptions].sort((a, b) => compareByLatest(a, b));
}

function compareByLatest(a, b) {
  const latestB = normalizeTimestamp(b.latestVideoPublishedAt);
  const latestA = normalizeTimestamp(a.latestVideoPublishedAt);
  if (latestB !== latestA) {
    return latestB - latestA;
  }
  return a.name.localeCompare(b.name);
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  let timestamp = value;
  if (typeof timestamp === 'string') {
    timestamp = Date.parse(timestamp);
  } else if (timestamp instanceof Date) {
    timestamp = timestamp.getTime();
  }
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    return timestamp;
  }
  return 0;
}

function showStatus(message, options = {}) {
  const status = document.getElementById('status-message');
  status.textContent = message;
  status.classList.remove('hidden', 'error');
  if (options.error) {
    status.classList.add('error');
  }
  clearTimeout(statusTimeout);
  if (!options.persist) {
    statusTimeout = setTimeout(() => {
      hideStatus();
    }, 4000);
  }
}

function hideStatus() {
  const status = document.getElementById('status-message');
  status.classList.add('hidden');
  status.textContent = '';
  status.classList.remove('error');
}
