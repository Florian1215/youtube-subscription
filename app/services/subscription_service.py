from __future__ import annotations

from typing import Dict, List, Optional

from app.data.repository import SubscriptionRepository
from app.domain.models import SearchResult, Subscription
from app.services.youtube_service import VideoList, YouTubeService


class SubscriptionManager:
    def __init__(self, repository: Optional[SubscriptionRepository] = None, youtube: Optional[YouTubeService] = None) -> None:
        self._repository = repository or SubscriptionRepository()
        self._youtube = youtube or YouTubeService()

    @property
    def repository(self) -> SubscriptionRepository:
        return self._repository

    @property
    def youtube(self) -> YouTubeService:
        return self._youtube

    def list_subscriptions(self) -> List[Subscription]:
        data = self._repository.load_all()
        return sorted(data.values(), key=lambda sub: sub.name.lower())

    def add_subscription(self, result: SearchResult, reverse_playlist: bool = False) -> Subscription:
        existing = self._repository.load_all()
        for subscription in existing.values():
            if (
                subscription.resource_id == result.resource_id
                and subscription.resource_type == result.resource_type
            ):
                raise ValueError("Déjà abonné à cette ressource")
        subscription = self._repository.add(
            name=result.title,
            resource_type=result.resource_type,
            resource_id=result.resource_id,
            reverse=reverse_playlist,
        )
        return subscription

    def remove_subscription(self, uid: str) -> None:
        self._repository.delete(uid)

    def refresh_subscription(self, subscription: Subscription, limit: int = 5) -> VideoList:
        video_list = self._youtube.refresh_videos(subscription, limit=limit)
        subscription.last_videos = video_list.items
        self._repository.update(subscription)
        return video_list

    def refresh_all(self, limit: int = 5) -> Dict[str, VideoList]:
        results: Dict[str, VideoList] = {}
        for subscription in self.list_subscriptions():
            results[subscription.uid] = self.refresh_subscription(subscription, limit=limit)
        return results

    def search(self, query: str) -> List[SearchResult]:
        return self._youtube.search(query)
