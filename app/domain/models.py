from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, cast

SubscriptionType = Literal["channel", "playlist"]


@dataclass
class Subscription:
    uid: str
    name: str
    resource_type: SubscriptionType
    resource_id: str
    last_videos: List[str] = field(default_factory=list)
    reverse_playlist: bool = False

    @classmethod
    def from_dict(cls, uid: str, payload: Dict[str, object]) -> "Subscription":
        resource_type = str(payload.get("type", "channel"))
        if resource_type not in {"channel", "playlist"}:
            resource_type = "channel"
        return cls(
            uid=uid,
            name=str(payload.get("name", "")),
            resource_type=cast(SubscriptionType, resource_type),
            resource_id=str(payload.get("id", "")),
            last_videos=list(payload.get("last_vid", [])),
            reverse_playlist=bool(payload.get("reverse", False)),
        )

    def to_dict(self) -> Dict[str, object]:
        data: Dict[str, object] = {
            "name": self.name,
            "type": self.resource_type,
            "id": self.resource_id,
            "last_vid": self.last_videos[:],
        }
        if self.resource_type == "playlist":
            data["reverse"] = self.reverse_playlist
        return data

    def videos_with_urls(self) -> List[str]:
        base = "https://www.youtube.com/watch?v="
        return [base + vid for vid in self.last_videos]


@dataclass
class SearchResult:
    resource_type: SubscriptionType
    resource_id: str
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
