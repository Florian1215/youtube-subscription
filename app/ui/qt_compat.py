from __future__ import annotations

try:  # pragma: no cover - runtime dependency resolution
    from PySide6 import QtCore, QtGui, QtWidgets  # type: ignore

    Signal = QtCore.Signal
    Slot = QtCore.Slot
    QT_LIB = "PySide6"
except ImportError:  # pragma: no cover - fallback when PySide6 absent
    from PyQt6 import QtCore, QtGui, QtWidgets  # type: ignore

    Signal = QtCore.pyqtSignal  # type: ignore[attr-defined]
    Slot = QtCore.pyqtSlot  # type: ignore[attr-defined]
    QT_LIB = "PyQt6"


__all__ = [
    "QtCore",
    "QtGui",
    "QtWidgets",
    "Signal",
    "Slot",
    "QT_LIB",
]
