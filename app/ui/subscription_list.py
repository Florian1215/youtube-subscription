from __future__ import annotations

import webbrowser
from typing import Dict, List, Optional

from app.domain.models import Subscription
from app.services.subscription_service import SubscriptionManager
from app.ui.async_utils import Worker
from app.ui.qt_compat import QtCore, QtWidgets, Signal


class SubscriptionListWidget(QtWidgets.QWidget):
    statusMessage = Signal(str)
    subscriptionRemoved = Signal(str)

    def __init__(self, manager: SubscriptionManager, parent: Optional[QtWidgets.QWidget] = None) -> None:
        super().__init__(parent)
        self._manager = manager
        self._thread_pool = QtCore.QThreadPool.globalInstance()
        self._items: Dict[str, Subscription] = {}
        self._setup_ui()
        self.reload()

    def _setup_ui(self) -> None:
        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        controls = QtWidgets.QHBoxLayout()
        self._refresh_button = QtWidgets.QPushButton("Actualiser")
        self._refresh_button.clicked.connect(self._refresh_selected)
        self._refresh_button.setEnabled(False)
        controls.addWidget(self._refresh_button)

        self._refresh_all_button = QtWidgets.QPushButton("Actualiser tout")
        self._refresh_all_button.clicked.connect(self._refresh_all)
        controls.addWidget(self._refresh_all_button)

        self._remove_button = QtWidgets.QPushButton("Supprimer")
        self._remove_button.clicked.connect(self._remove_selected)
        self._remove_button.setEnabled(False)
        controls.addWidget(self._remove_button)
        controls.addStretch(1)
        layout.addLayout(controls)

        splitter = QtWidgets.QSplitter()
        splitter.setOrientation(QtCore.Qt.Orientation.Horizontal)
        layout.addWidget(splitter)

        self._list = QtWidgets.QListWidget()
        self._list.itemSelectionChanged.connect(self._on_selection_changed)
        splitter.addWidget(self._list)

        detail_container = QtWidgets.QWidget()
        detail_layout = QtWidgets.QVBoxLayout(detail_container)
        detail_layout.setContentsMargins(8, 8, 8, 8)
        self._detail_title = QtWidgets.QLabel("Sélectionnez un abonnement pour voir les détails")
        self._detail_title.setWordWrap(True)
        detail_layout.addWidget(self._detail_title)

        self._videos_list = QtWidgets.QListWidget()
        self._videos_list.itemDoubleClicked.connect(self._open_video)
        detail_layout.addWidget(self._videos_list)

        splitter.addWidget(detail_container)
        splitter.setStretchFactor(1, 2)

    def reload(self, select_uid: Optional[str] = None) -> None:
        if select_uid is None:
            current = self._current_subscription()
            select_uid = current.uid if current else None
        subscriptions = self._manager.list_subscriptions()
        self._populate_list(subscriptions)
        if select_uid:
            self._select_uid(select_uid)

    def add_subscription(self, subscription: Subscription) -> None:
        self.reload(subscription.uid)

    def _populate_list(self, subscriptions: List[Subscription]) -> None:
        self._list.clear()
        self._items.clear()
        for subscription in subscriptions:
            item = QtWidgets.QListWidgetItem(self._format_subscription(subscription))
            item.setData(QtCore.Qt.ItemDataRole.UserRole, subscription.uid)
            self._list.addItem(item)
            self._items[subscription.uid] = subscription
        self._refresh_button.setEnabled(False)
        self._remove_button.setEnabled(False)
        self._videos_list.clear()
        self._detail_title.setText("Sélectionnez un abonnement pour voir les détails")

    def _format_subscription(self, subscription: Subscription) -> str:
        return f"{subscription.name} ({'Chaîne' if subscription.resource_type == 'channel' else 'Playlist'})"

    def _on_selection_changed(self) -> None:
        items = self._list.selectedItems()
        has_selection = bool(items)
        self._refresh_button.setEnabled(has_selection)
        self._remove_button.setEnabled(has_selection)
        if not has_selection:
            self._videos_list.clear()
            self._detail_title.setText("Sélectionnez un abonnement pour voir les détails")
            return
        uid = items[0].data(QtCore.Qt.ItemDataRole.UserRole)
        subscription = self._find_subscription(uid)
        if not subscription:
            return
        self._detail_title.setText(
            f"{subscription.name}\nType: {subscription.resource_type}\nDernières vidéos:"
        )
        self._render_videos(subscription)

    def _render_videos(self, subscription: Subscription) -> None:
        self._videos_list.clear()
        for video_id in subscription.last_videos:
            item = QtWidgets.QListWidgetItem(f"https://www.youtube.com/watch?v={video_id}")
            item.setData(QtCore.Qt.ItemDataRole.UserRole, video_id)
            self._videos_list.addItem(item)

    def _open_video(self, item: QtWidgets.QListWidgetItem) -> None:  # pragma: no cover - UI action
        video_id = item.data(QtCore.Qt.ItemDataRole.UserRole)
        if not video_id:
            return
        url = f"https://www.youtube.com/watch?v={video_id}"
        webbrowser.open_new_tab(url)

    def _refresh_selected(self) -> None:
        subscription = self._current_subscription()
        if not subscription:
            return
        self._set_busy(True)
        worker = Worker(self._manager.refresh_subscription, subscription)
        worker.signals.finished.connect(lambda _: self._on_refreshed(subscription.uid))
        worker.signals.error.connect(self._on_error)
        self._thread_pool.start(worker)

    def _refresh_all(self) -> None:
        self._set_busy(True)
        worker = Worker(self._manager.refresh_all)
        worker.signals.finished.connect(self._on_refresh_all)
        worker.signals.error.connect(self._on_error)
        self._thread_pool.start(worker)

    def _on_refresh_all(self, _: object) -> None:
        self.reload()
        self._set_busy(False)
        self.statusMessage.emit("Abonnements actualisés")

    def _on_refreshed(self, uid: str) -> None:
        self.reload(uid)
        self._set_busy(False)
        self.statusMessage.emit("Abonnement actualisé")

    def _remove_selected(self) -> None:
        subscription = self._current_subscription()
        if not subscription:
            return
        confirm = QtWidgets.QMessageBox.question(
            self,
            "Confirmer la suppression",
            f"Supprimer {subscription.name}?",
        )
        if confirm != QtWidgets.QMessageBox.StandardButton.Yes:
            return
        self._manager.remove_subscription(subscription.uid)
        self.subscriptionRemoved.emit(subscription.uid)
        self.reload()
        self.statusMessage.emit("Abonnement supprimé")

    def _current_subscription(self) -> Optional[Subscription]:
        items = self._list.selectedItems()
        if not items:
            return None
        uid = items[0].data(QtCore.Qt.ItemDataRole.UserRole)
        return self._find_subscription(uid)

    def _find_subscription(self, uid: Optional[str]) -> Optional[Subscription]:
        if not uid:
            return None
        return self._items.get(uid)

    def _set_busy(self, busy: bool) -> None:
        self.setDisabled(busy)

    def _select_uid(self, uid: str) -> None:
        for row in range(self._list.count()):
            item = self._list.item(row)
            if item.data(QtCore.Qt.ItemDataRole.UserRole) == uid:
                self._list.setCurrentItem(item)
                return

    def _on_error(self, error: Exception) -> None:  # pragma: no cover - UI feedback
        self._set_busy(False)
        self.statusMessage.emit(str(error))
