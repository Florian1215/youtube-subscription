from __future__ import annotations

from typing import Any, Callable

from app.ui.qt_compat import QtCore, Signal, Slot


class WorkerSignals(QtCore.QObject):
    finished = Signal(object)
    error = Signal(Exception)


class Worker(QtCore.QRunnable):
    def __init__(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        super().__init__()
        self.fn = fn
        self.args = args
        self.kwargs = kwargs
        self.signals = WorkerSignals()

    @Slot()
    def run(self) -> None:
        try:
            result = self.fn(*self.args, **self.kwargs)
        except Exception as exc:  # pragma: no cover - runtime path
            self.signals.error.emit(exc)
        else:
            self.signals.finished.emit(result)
