from __future__ import annotations

from typing import Dict, Optional

from app.domain.models import SearchResult
from app.services.subscription_service import SubscriptionManager
from app.ui.async_utils import Worker
from app.ui.qt_compat import QtCore, QtWidgets, Signal


class SearchWidget(QtWidgets.QWidget):
    subscribeRequested = Signal(object)
    statusMessage = Signal(str)

    def __init__(self, manager: SubscriptionManager, parent: Optional[QtWidgets.QWidget] = None) -> None:
        super().__init__(parent)
        self._manager = manager
        self._thread_pool = QtCore.QThreadPool.globalInstance()
        self._results: Dict[int, SearchResult] = {}
        self._setup_ui()

    def _setup_ui(self) -> None:
        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        form = QtWidgets.QHBoxLayout()
        self._input = QtWidgets.QLineEdit(self)
        self._input.setPlaceholderText("Rechercher une chaîne ou une playlist YouTube…")
        self._input.returnPressed.connect(self._trigger_search)
        form.addWidget(self._input)

        self._search_button = QtWidgets.QPushButton("Rechercher", self)
        self._search_button.clicked.connect(self._trigger_search)
        form.addWidget(self._search_button)
        layout.addLayout(form)

        self._results_view = QtWidgets.QListWidget(self)
        self._results_view.itemSelectionChanged.connect(self._on_selection_changed)
        self._results_view.itemDoubleClicked.connect(self._subscribe_current)
        layout.addWidget(self._results_view)

        options_layout = QtWidgets.QHBoxLayout()
        self._reverse_checkbox = QtWidgets.QCheckBox("Inverser l'ordre des playlists", self)
        self._reverse_checkbox.setEnabled(False)
        options_layout.addWidget(self._reverse_checkbox)
        options_layout.addStretch(1)

        self._subscribe_button = QtWidgets.QPushButton("S'abonner", self)
        self._subscribe_button.setEnabled(False)
        self._subscribe_button.clicked.connect(self._subscribe_current)
        options_layout.addWidget(self._subscribe_button)
        layout.addLayout(options_layout)

        self._status_label = QtWidgets.QLabel()
        self._status_label.setStyleSheet("color: gray")
        layout.addWidget(self._status_label)

    def _trigger_search(self) -> None:
        query = self._input.text().strip()
        if not query:
            self.statusMessage.emit("Veuillez saisir une recherche.")
            return
        self._set_busy(True)
        worker = Worker(self._manager.search, query)
        worker.signals.finished.connect(self._on_search_finished)
        worker.signals.error.connect(self._on_search_error)
        self._thread_pool.start(worker)

    def _set_busy(self, busy: bool) -> None:
        self._search_button.setDisabled(busy)
        self._input.setDisabled(busy)
        if busy:
            self._status_label.setText("Recherche en cours…")
        else:
            if not self._results:
                self._status_label.setText("Aucun résultat")

    def _on_search_finished(self, payload: object) -> None:
        results = list(payload or [])
        self._results_view.clear()
        self._results.clear()
        for index, result in enumerate(results):
            if not isinstance(result, SearchResult):
                continue
            item = QtWidgets.QListWidgetItem(self._format_result(result))
            self._results_view.addItem(item)
            self._results[id(item)] = result
        count = len(self._results)
        if count:
            self._status_label.setText(f"{count} résultat(s)")
        else:
            self._status_label.setText("Aucun résultat")
        self._set_busy(False)

    def _on_search_error(self, exc: Exception) -> None:  # pragma: no cover - UI feedback
        self._set_busy(False)
        self.statusMessage.emit(str(exc))

    def _on_selection_changed(self) -> None:
        items = self._results_view.selectedItems()
        has_selection = bool(items)
        self._subscribe_button.setEnabled(has_selection)
        if not has_selection:
            self._reverse_checkbox.setEnabled(False)
            return
        current = self._results.get(id(items[0]))
        is_playlist = current and current.resource_type == "playlist"
        self._reverse_checkbox.setEnabled(bool(is_playlist))
        if not is_playlist:
            self._reverse_checkbox.setChecked(False)

    def _subscribe_current(self) -> None:
        items = self._results_view.selectedItems()
        if not items:
            return
        result = self._results.get(id(items[0]))
        if not result:
            return
        reverse = self._reverse_checkbox.isChecked() if result.resource_type == "playlist" else False
        self.subscribeRequested.emit((result, reverse))

    def _format_result(self, result: SearchResult) -> str:
        label = f"{result.title} ({'Chaîne' if result.resource_type == 'channel' else 'Playlist'})"
        if result.description:
            label += f"\n{result.description[:120]}"
        return label
