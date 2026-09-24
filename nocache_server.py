#!/usr/bin/env python3
"""Dev server that disables caching, so the phone always gets the latest
files while this prototype is under active iteration — plain http.server
was serving a stale app.js after an edit, silently breaking testing."""
import http.server

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

if __name__ == "__main__":
    http.server.test(HandlerClass=NoCacheHandler, port=8743)
