"""Cemflix gelistirme sunucusu: onbellegi kapatir, boylece degisiklikler yenileyince hemen gorunur.

Kullanim:  python dev-server.py            -> app/ (8080) ve qr-web/ (8081)
"""
import functools
import http.server
import os
import threading

ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


def serve(folder, port):
    h = functools.partial(NoCache, directory=os.path.join(ROOT, folder))
    http.server.ThreadingHTTPServer(("127.0.0.1", port), h).serve_forever()


if __name__ == "__main__":
    threading.Thread(target=serve, args=("qr-web", 8081), daemon=True).start()
    print("Uygulama:      http://127.0.0.1:8080")
    print("Telefon sayfa: http://127.0.0.1:8081")
    serve("app", 8080)
