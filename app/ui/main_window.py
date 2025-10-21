from __future__ import annotations

from typing import Optional, Tuple

from app.domain.models import SearchResult, Subscription
from app.services.subscription_service import SubscriptionManager
from app.ui.async_utils import Worker
from app.ui.qt_compat import QtCore, QtWidgets
from app.ui.search_widget import SearchWidget
from app.ui.subscription_list import SubscriptionListWidget


class MainWindow(QtWidgets.QMainWindow):
    def __init__(self, manager: Optional[SubscriptionManager] = None) -> None:
        super().__init__()
        self._manager = manager or SubscriptionManager()
        self._thread_pool = QtCore.QThreadPool.globalInstance()
        self._setup_ui()

    def _setup_ui(self) -> None:
        self.setWindowTitle("YouTube Subscriptions Manager")
        self.resize(1100, 700)

        central = QtWidgets.QWidget()
        layout = QtWidgets.QVBoxLayout(central)

        self._search_widget = SearchWidget(self._manager)
        self._search_widget.subscribeRequested.connect(self._handle_subscription_request)
        self._search_widget.statusMessage.connect(self._show_status)
        layout.addWidget(self._search_widget)

        separator = QtWidgets.QFrame()
        separator.setFrameShape(QtWidgets.QFrame.Shape.HLine)
        separator.setFrameShadow(QtWidgets.QFrame.Shadow.Sunken)
        layout.addWidget(separator)

        self._subscription_widget = SubscriptionListWidget(self._manager)
        self._subscription_widget.statusMessage.connect(self._show_status)
        layout.addWidget(self._subscription_widget, 1)

        self.setCentralWidget(central)
        self.statusBar().showMessage("Prêt")

    def _handle_subscription_request(self, payload: Tuple[SearchResult, bool]) -> None:
        result, reverse = payload
        try:
            subscription = self._manager.add_subscription(result, reverse_playlist=reverse)
        except ValueError as exc:
            QtWidgets.QMessageBox.warning(self, "Impossible d'ajouter", str(exc))
            return
        self._subscription_widget.add_subscription(subscription)
        self._show_status(f"Abonné à {subscription.name}")
        self._refresh_new_subscription(subscription)

    def _refresh_new_subscription(self, subscription: Subscription) -> None:
        worker = Worker(self._manager.refresh_subscription, subscription)
        worker.signals.finished.connect(lambda _: self._on_refresh_completed(subscription.uid))
        worker.signals.error.connect(self._on_worker_error)
        self._thread_pool.start(worker)
        self._show_status("Récupération des dernières vidéos…")

    def _on_refresh_completed(self, uid: str) -> None:
        self._subscription_widget.reload(uid)
        self._show_status("Dernières vidéos mises à jour")

    def _on_worker_error(self, error: Exception) -> None:  # pragma: no cover - UI feedback
        QtWidgets.QMessageBox.critical(self, "Erreur", str(error))
        self._show_status("Erreur lors de la mise à jour")

    def _show_status(self, message: str) -> None:
        self.statusBar().showMessage(message, 5000)
