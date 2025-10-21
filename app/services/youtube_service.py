from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import scrapetube

from app.domain.models import SearchResult, Subscription, SubscriptionType
from utils import ytb


@dataclass
class VideoList:
    items: List[str]
    truncated: bool = False


class YouTubeService:
    def __init__(self, max_search_results: int = 10) -> None:
        self._max_search_results = max_search_results

    def search(self, query: str) -> List[SearchResult]:
        query = query.strip()
        if not query:
            return []

        playlist_id = ytb.get_playlist(query)
        if playlist_id:
            result = self._playlist_result_from_id(playlist_id)
            return [result] if result else []

        channel_id = ytb.get_channel(query)
        if channel_id:
            result = self._channel_result_from_id(channel_id)
            return [result] if result else []

        results: List[SearchResult] = []
        results.extend(self._search_channels(query))
        results.extend(self._search_playlists(query))
        return results[: self._max_search_results]

    def refresh_videos(self, subscription: Subscription, limit: int = 5) -> VideoList:
        if subscription.resource_type == "channel":
            videos = ytb.get_videos_channel(subscription.resource_id, limit=limit or None)
        else:
            playlist_videos = ytb.get_videos_playlist(subscription.resource_id, limit=None if subscription.reverse_playlist else limit)
            videos = playlist_videos[::-1] if subscription.reverse_playlist else playlist_videos
            if limit:
                videos = videos[:limit]
        truncated = limit is not None and len(videos) >= limit
        return VideoList(items=videos, truncated=truncated)

    def _search_channels(self, query: str) -> List[SearchResult]:
        entries = scrapetube.get_search(query, results_type="channel", limit=self._max_search_results)
        results: List[SearchResult] = []
        for entry in entries:
            result = self._channel_result_from_renderer(entry)
            if result:
                results.append(result)
        return results

    def _search_playlists(self, query: str) -> List[SearchResult]:
        entries = scrapetube.get_search(query, results_type="playlist", limit=self._max_search_results)
        results: List[SearchResult] = []
        for entry in entries:
            renderer = entry.get("playlistRenderer") or entry
            playlist_id = renderer.get("playlistId")
            if not playlist_id:
                continue
            title = self._get_simple_text(renderer.get("title")) or playlist_id
            description = self._join_runs(renderer.get("descriptionText", {}))
            thumbnails = renderer.get("thumbnails") or renderer.get("thumbnail")
            thumbnail_url = self._get_thumbnail_url(thumbnails)
            results.append(SearchResult("playlist", playlist_id, title, description, thumbnail_url))
        return results

    def _channel_result_from_id(self, channel_id: str) -> Optional[SearchResult]:
        try:
            entry = next(scrapetube.get_search(channel_id, results_type="channel", limit=1))
        except StopIteration:
            return None
        return self._channel_result_from_renderer(entry)

    def _playlist_result_from_id(self, playlist_id: str) -> Optional[SearchResult]:
        try:
            entry = next(scrapetube.get_search(playlist_id, results_type="playlist", limit=1))
        except StopIteration:
            return None
        renderer = entry.get("playlistRenderer") or entry
        title = self._get_simple_text(renderer.get("title")) or playlist_id
        description = self._join_runs(renderer.get("descriptionText", {}))
        thumbnail_url = self._get_thumbnail_url(renderer.get("thumbnails") or renderer.get("thumbnail"))
        return SearchResult("playlist", playlist_id, title, description, thumbnail_url)

    def _channel_result_from_renderer(self, entry: dict) -> Optional[SearchResult]:
        renderer = entry.get("channelRenderer") or entry
        channel_id = renderer.get("channelId")
        if not channel_id:
            return None
        title = self._get_simple_text(renderer.get("title")) or channel_id
        description = self._join_runs(renderer.get("descriptionSnippet", {}))
        thumbnail_url = self._get_thumbnail_url(renderer.get("thumbnail"))
        return SearchResult("channel", channel_id, title, description, thumbnail_url)

    @staticmethod
    def _get_simple_text(blob: Optional[dict]) -> Optional[str]:
        if not blob:
            return None
        if "simpleText" in blob:
            return blob["simpleText"]
        runs = blob.get("runs") if isinstance(blob, dict) else None
        if runs:
            return "".join(run.get("text", "") for run in runs if isinstance(run, dict)) or None
        return None

    @staticmethod
    def _join_runs(blob: Optional[dict]) -> Optional[str]:
        if not blob:
            return None
        runs = blob.get("runs") if isinstance(blob, dict) else None
        if not runs:
            return None
        text = "".join(run.get("text", "") for run in runs if isinstance(run, dict)).strip()
        return text or None

    @staticmethod
    def _get_thumbnail_url(thumbnail_blob: Optional[dict]) -> Optional[str]:
        if not thumbnail_blob:
            return None
        thumbnails = []
        if isinstance(thumbnail_blob, dict) and "thumbnails" in thumbnail_blob:
            thumbnails = thumbnail_blob["thumbnails"]
        elif isinstance(thumbnail_blob, list):
            thumbnails = thumbnail_blob
        if not thumbnails:
            return None
        best = thumbnails[-1]
        return best.get("url") if isinstance(best, dict) else None
