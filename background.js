const api = typeof browser !== 'undefined' ? browser : chrome;
const SUBSCRIPTIONS_KEY = 'subscriptions';
let isChecking = false;
let lastAutoCheck = 0;
const AUTO_CHECK_COOLDOWN_MS = 60_000;
const BADGE_COLOR = '#d93025';
let badgeColorApplied = false;
let badgeResetTimeout = null;

function getBadgeApi() {
    if (api.browserAction && typeof api.browserAction.setBadgeText === 'function') {
        return api.browserAction;
    }
    if (api.action && typeof api.action.setBadgeText === 'function') {
        return api.action;
    }
    return null;
}

function setBadgeCount(count) {
    const badgeApi = getBadgeApi();
    if (!badgeApi) {
        return;
    }
    if (!badgeColorApplied) {
        try {
            badgeApi.setBadgeBackgroundColor({color: BADGE_COLOR});
        } catch (error) {
            // ignore missing method errors
        }
        badgeColorApplied = true;
    }
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    badgeApi.setBadgeText({text});
}

async function getSubscriptions() {
    const stored = await api.storage.local.get({[SUBSCRIPTIONS_KEY]: {}});
    const subscriptions = stored[SUBSCRIPTIONS_KEY] || {};
    for (const [key, value] of Object.entries(subscriptions)) {
        if (value && typeof value === 'object' && !value.key) {
            value.key = key;
        }
    }
    return subscriptions;
}

async function saveSubscriptions(subscriptions) {
    await api.storage.local.set({[SUBSCRIPTIONS_KEY]: subscriptions});
}

function makeKey(type, id) {
    return `${type}:${id}`;
}

function looksLikeChannelId(value) {
    return /^UC[0-9A-Za-z_-]{22}$/.test(value);
}

function looksLikePlaylistId(value) {
    return /^[PLUC][0-9A-Za-z_-]{10,50}$/.test(value);
}

function formatPlaylistSubscriptionName(playlistName, channelName) {
    const cleanPlaylist = (playlistName || '').trim();
    const cleanChannel = (channelName || '').trim();
    if (cleanPlaylist && cleanChannel && cleanPlaylist !== cleanChannel) {
        return `${cleanPlaylist} - ${cleanChannel}`;
    }
    return cleanPlaylist || cleanChannel || '';
}

async function fetchFeed(subscription) {
    const url = subscription.type === 'channel'
        ? `https://www.youtube.com/feeds/videos.xml?channel_id=${subscription.id}`
        : `https://www.youtube.com/feeds/videos.xml?playlist_id=${subscription.id}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Impossible de récupérer le flux (${response.status})`);
    }
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) {
        throw new Error('Flux YouTube invalide');
    }
    const entries = Array.from(xml.querySelectorAll('entry'));
    const videos = entries.map((entry) => {
        const idNode = entry.querySelector('yt\\:videoId, videoId');
        const titleNode = entry.querySelector('title');
        const publishedNode = entry.querySelector('published');
        const videoId = idNode ? idNode.textContent : null;
        return {
            id: videoId,
            title: titleNode ? titleNode.textContent : '',
            publishedAt: publishedNode ? publishedNode.textContent : null,
            url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
        };
    }).filter((video) => Boolean(video.id));

    let name = subscription.name;
    let owner = subscription.channelName || null;
    const authorNode = xml.querySelector('author > name');
    if (subscription.type === 'channel') {
        if (authorNode) {
            const cleaned = authorNode.textContent.replace(/^Uploads from\s+/i, '').trim();
            name = cleaned || name;
            owner = cleaned || owner;
        }
    } else {
        const titleNode = xml.querySelector('title');
        if (titleNode) {
            name = titleNode.textContent.trim();
        }
        if (authorNode) {
            owner = authorNode.textContent.trim();
        }
    }

    if (!owner && authorNode) {
        owner = authorNode.textContent.trim();
    }

    return {videos, name, owner};
}

async function checkSubscriptionForUpdates(subscription, actionSource) {
    const {videos, name, owner} = await fetchFeed(subscription);
    const latestPublishedAt = videos.length ? videos[0].publishedAt : subscription.latestVideoPublishedAt || null;

    const lastKnown = subscription.lastVideoIds || [];
    const fresh = [];
    for (const video of videos) {
        if (lastKnown.includes(video.id)) {
            break;
        }
        fresh.push(video);
        if (fresh.length >= 5) {
            break;
        }
    }

    let toOpen = fresh;
    if (subscription.reverse && subscription.type === 'playlist') {
        toOpen = [...fresh].reverse();
    }

    const opened = [];
    for (const video of toOpen) {
        opened.push(video);
        if (video.url) {
            await api.tabs.create({url: video.url, active: false});
        }
    }

    const effectiveChannelName = subscription.type === 'playlist'
        ? (subscription.channelName || owner || null)
        : (owner || subscription.channelName || null);

    let displayName = name || subscription.name || subscription.id;
    if (subscription.type === 'playlist') {
        displayName = formatPlaylistSubscriptionName(displayName, effectiveChannelName);
    } else if (!displayName && effectiveChannelName) {
        displayName = effectiveChannelName;
    }

    const resolvedChannelName = effectiveChannelName || subscription.channelName || (subscription.type === 'channel' ? displayName : null);

    const updated = {
        ...subscription,
        key: subscription.key || makeKey(subscription.type, subscription.id),
        name: displayName,
        channelName: resolvedChannelName,
        lastCheckedAt: Date.now(),
        lastVideoIds: videos.slice(0, 5).map((video) => video.id),
        latestVideoPublishedAt: latestPublishedAt
    };

    return {updated, opened};
}

async function checkAllSubscriptions(actionSource = 'manual') {
    if (isChecking) {
        return {skipped: true};
    }
    isChecking = true;
    try {
        const subscriptions = await getSubscriptions();
        const updatedSubs = {...subscriptions};
        const summary = [];
        let totalOpened = 0;
        for (const [key, subscription] of Object.entries(subscriptions)) {
            try {
                const result = await checkSubscriptionForUpdates(subscription, actionSource);
                updatedSubs[key] = {...result.updated, key};
                totalOpened += result.opened.length;
                if (result.opened.length) {
                    summary.push({
                        key,
                        subscription: result.updated,
                        videos: result.opened
                    });
                }
            } catch (error) {
                console.error('Erreur mise à jour abonnement', subscription, error);
                summary.push({key, subscription, error: error.message});
            }
        }
        await saveSubscriptions(updatedSubs);
        setBadgeCount(totalOpened);
        if (badgeResetTimeout) {
            clearTimeout(badgeResetTimeout);
            badgeResetTimeout = null;
        }
        if (totalOpened > 0) {
            badgeResetTimeout = setTimeout(() => {
                setBadgeCount(0);
                badgeResetTimeout = null;
            }, 10_000);
        }
        return {skipped: false, opened: summary};
    } finally {
        isChecking = false;
    }
}

async function resolveChannelFromHandle(handle) {
    const url = `https://www.youtube.com/@${handle}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Impossible de trouver le handle ${handle}`);
    }
    const html = await response.text();
    const idMatch = html.match(/"channelId":"(UC[0-9A-Za-z_-]{22})"/);
    if (!idMatch) {
        throw new Error('Channel ID introuvable pour ce handle');
    }
    const nameMatch = html.match(/"title":"([^"]+)"/);
    return {
        id: idMatch[1],
        name: nameMatch ? nameMatch[1] : `@${handle}`
    };
}

async function resolveSubscriptionDetails(input) {
    let working = input.trim();
    if (!working) {
        throw new Error('Lien ou identifiant manquant');
    }

    let url;
    try {
        url = new URL(working);
    } catch (error) {
        url = null;
    }

    if (url && url.searchParams.has('list')) {
        const playlistId = url.searchParams.get('list');
        return {type: 'playlist', id: playlistId};
    }
    if (url && /\/playlist\//.test(url.pathname) && url.pathname.split('/')[2]) {
        const playlistId = url.pathname.split('/')[2];
        return {type: 'playlist', id: playlistId};
    }

    if (url && /\/channel\//.test(url.pathname)) {
        const channelId = url.pathname.split('/').filter(Boolean).pop();
        return {type: 'channel', id: channelId};
    }

    if (url && /\/@/.test(url.pathname)) {
        const handle = url.pathname.split('/').filter(Boolean).pop();
        const resolved = await resolveChannelFromHandle(handle.replace(/^@/, ''));
        return {type: 'channel', id: resolved.id, name: resolved.name};
    }

    if (url && url.searchParams.has('v') && url.searchParams.has('list')) {
        const playlistId = url.searchParams.get('list');
        return {type: 'playlist', id: playlistId};
    }

    if (looksLikeChannelId(working)) {
        return {type: 'channel', id: working};
    }
    if (looksLikePlaylistId(working)) {
        return {type: 'playlist', id: working};
    }

    if (/^@/.test(working)) {
        const resolved = await resolveChannelFromHandle(working.replace(/^@/, ''));
        return {type: 'channel', id: resolved.id, name: resolved.name};
    }

    const searchResult = await searchChannelByName(working);
    if (searchResult) {
        return {type: 'channel', id: searchResult.id, name: searchResult.name};
    }

    throw new Error('Impossible de trouver cette chaîne. Essaie avec un nom différent ou une URL.');
}

function collectChannelRenderers(node, results = []) {
    if (!node) {
        return results;
    }
    if (Array.isArray(node)) {
        node.forEach((item) => collectChannelRenderers(item, results));
        return results;
    }
    if (typeof node === 'object') {
        if (node.channelRenderer) {
            results.push(node.channelRenderer);
        }
        for (const value of Object.values(node)) {
            if (value && typeof value === 'object') {
                collectChannelRenderers(value, results);
            }
        }
    }
    return results;
}

function getRendererName(renderer) {
    if (!renderer) {
        return null;
    }
    if (renderer.title?.simpleText) {
        return renderer.title.simpleText;
    }
    if (renderer.title?.runs?.length) {
        return renderer.title.runs.map((run) => run.text).join('').trim();
    }
    if (renderer.displayName?.simpleText) {
        return renderer.displayName.simpleText;
    }
    return null;
}

async function searchChannelByName(query) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D`;
    const response = await fetch(url, {
        headers: {
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
        }
    });
    if (!response.ok) {
        throw new Error('Recherche YouTube indisponible pour le moment');
    }
    const html = await response.text();
    const marker = 'ytInitialData = ';
    const start = html.indexOf(marker);
    if (start === -1) {
        throw new Error('Données YouTube introuvables pour cette recherche');
    }
    const sliced = html.slice(start + marker.length);
    const end = sliced.indexOf(';</script>');
    if (end === -1) {
        throw new Error('Données YouTube incomplètes pour cette recherche');
    }
    let data;
    try {
        data = JSON.parse(sliced.slice(0, end));
    } catch (error) {
        throw new Error('Impossible de lire les résultats de recherche YouTube');
    }

    const renderers = collectChannelRenderers(data);
    const seen = new Set();
    for (const renderer of renderers) {
        const channelId = renderer.channelId;
        if (!channelId || seen.has(channelId)) {
            continue;
        }
        seen.add(channelId);
        if (!/^UC[0-9A-Za-z_-]{22}$/.test(channelId)) {
            continue;
        }
        const name = getRendererName(renderer) || channelId;
        return {id: channelId, name};
    }
    return null;
}

async function subscribe(details) {
    const subscriptions = await getSubscriptions();
    const key = makeKey(details.type, details.id);
    if (subscriptions[key]) {
        subscriptions[key].key = subscriptions[key].key || key;
        return {alreadySubscribed: true, subscription: subscriptions[key]};
    }

    let name = details.name || details.title || details.handle || details.id;
    let channelName = details.channelName || null;
    try {
        const feed = await fetchFeed({type: details.type, id: details.id, name, channelName});
        name = feed.name || name;
        channelName = channelName || feed.owner || null;
        if (details.type === 'playlist') {
            name = formatPlaylistSubscriptionName(name, channelName);
        } else if (!name && channelName) {
            name = channelName;
        }
        const lastVideoIds = feed.videos.slice(0, 5).map((video) => video.id);
        subscriptions[key] = {
            key,
            id: details.id,
            type: details.type,
            name,
            channelName,
            lastVideoIds,
            reverse: Boolean(details.reverse) && details.type === 'playlist',
            lastCheckedAt: Date.now(),
            latestVideoPublishedAt: feed.videos.length ? feed.videos[0].publishedAt : null
        };
    } catch (error) {
        throw error;
    }

    await saveSubscriptions(subscriptions);
    return {alreadySubscribed: false, subscription: subscriptions[key]};
}

async function unsubscribe(details) {
    const subscriptions = await getSubscriptions();
    const key = makeKey(details.type, details.id);
    if (!subscriptions[key]) {
        return {removed: false};
    }
    delete subscriptions[key];
    await saveSubscriptions(subscriptions);
    return {removed: true};
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = async () => {
        switch (message.type) {
            case 'get-subscriptions': {
                const subscriptions = await getSubscriptions();
                return {subscriptions};
            }
            case 'subscribe': {
                if (message.fromPopup && message.input) {
                    const resolved = await resolveSubscriptionDetails(message.input);
                    const finalDetails = {...resolved};
                    if (resolved.name) {
                        finalDetails.name = resolved.name;
                    }
                    const result = await subscribe(finalDetails);
                    return result;
                }
                if (message.details) {
                    const result = await subscribe(message.details);
                    return result;
                }
                throw new Error('Aucun détail pour abonnement');
            }
            case 'unsubscribe': {
                const result = await unsubscribe(message.details);
                return result;
            }
            case 'toggle-reverse': {
                const subscriptions = await getSubscriptions();
                const key = makeKey(message.details.type, message.details.id);
                const current = subscriptions[key];
                if (!current || current.type !== 'playlist') {
                    throw new Error('Abonnement introuvable ou non playlist');
                }
                current.reverse = !current.reverse;
                await saveSubscriptions(subscriptions);
                return {subscription: current};
            }
            case 'check-now': {
                const result = await checkAllSubscriptions('manual');
                return result;
            }
            case 'youtube-home': {
                const now = Date.now();
                if (now - lastAutoCheck < AUTO_CHECK_COOLDOWN_MS) {
                    return {skipped: true};
                }
                lastAutoCheck = now;
                const result = await checkAllSubscriptions('auto');
                return result;
            }
            default:
                return null;
        }
    };

    handler()
        .then((result) => sendResponse({ok: true, result}))
        .catch((error) => {
            console.error('Erreur runtime', message, error);
            sendResponse({ok: false, error: error.message || String(error)});
        });
    return true;
});

setBadgeCount(0);
