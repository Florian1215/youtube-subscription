from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from typing import Dict, Iterable, Optional, cast

from app.domain.models import Subscription, SubscriptionType


class SubscriptionRepository:
    def __init__(self, data_path: Optional[Path] = None) -> None:
        default_path = Path(__file__).resolve().parents[2] / "utils" / "youtube.json"
        self._data_path = data_path or default_path
        self._lock = threading.RLock()

    @property
    def data_path(self) -> Path:
        return self._data_path

    def load_all(self) -> Dict[str, Subscription]:
        with self._lock:
            if not self._data_path.exists():
                return {}
            raw = json.loads(self._data_path.read_text(encoding="utf-8"))
            return {uid: Subscription.from_dict(uid, payload) for uid, payload in raw.items()}

    def save_all(self, subscriptions: Iterable[Subscription]) -> None:
        with self._lock:
            payload = {sub.uid: sub.to_dict() for sub in subscriptions}
            self._data_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def create(self, subscription: Subscription) -> Subscription:
        with self._lock:
            data = self.load_all()
            data[subscription.uid] = subscription
            self._persist(data)
            return subscription

    def add(self, name: str, resource_type: str, resource_id: str, reverse: bool = False) -> Subscription:
        uid = uuid.uuid1().hex
        if resource_type not in {"channel", "playlist"}:
            raise ValueError("resource_type must be 'channel' or 'playlist'")
        sub = Subscription(
            uid=uid,
            name=name,
            resource_type=cast(SubscriptionType, resource_type),
            resource_id=resource_id,
            reverse_playlist=reverse,
        )
        return self.create(sub)

    def update(self, subscription: Subscription) -> None:
        with self._lock:
            data = self.load_all()
            if subscription.uid not in data:
                raise KeyError(f"Unknown subscription {subscription.uid}")
            data[subscription.uid] = subscription
            self._persist(data)

    def delete(self, uid: str) -> None:
        with self._lock:
            data = self.load_all()
            if uid in data:
                data.pop(uid)
                self._persist(data)

    def _persist(self, mapping: Dict[str, Subscription]) -> None:
        payload = {uid: sub.to_dict() for uid, sub in mapping.items()}
        self._data_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
