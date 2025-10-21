from __future__ import annotations

import sys

from app.ui.main_window import MainWindow
from app.ui.qt_compat import QT_LIB, QtWidgets


def main() -> int:
    app = QtWidgets.QApplication(sys.argv)
    app.setApplicationName("YouTube Subscriptions")
    app.setOrganizationName("YoutubeSubscriptions")
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
