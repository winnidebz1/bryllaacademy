"""Serve Brylla pages and refuse founder pages without the founder role.

Run from the template folder:
    python brylla_server.py
"""
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

FOUNDER_PREFIXES = ("/admin-", "/api/finance")


class Handler(SimpleHTTPRequestHandler):
    allow_reuse_address = False
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def role(self):
        cookie = self.headers.get("Cookie") or ""
        for part in cookie.split(";"):
            piece = part.strip()
            if piece.startswith("brylla_role="):
                return piece.split("=", 1)[1]
        return ""

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        if path == "/api/logout":
            self.send_response(204)
            self.send_header("Set-Cookie", "brylla_role=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
            self.end_headers()
            return
        if path != "/api/login":
            self.send_error(404)
            return
        try:
            role = json.loads(raw.decode() or "{}").get("role")
        except json.JSONDecodeError:
            role = ""
        if role not in ("founder", "instructor", "student"):
            self.send_error(400)
            return
        self.send_response(204)
        self.send_header("Set-Cookie", "brylla_role=%s; Path=/; HttpOnly; SameSite=Lax" % role)
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        protected = (path.startswith("/admin-") and not path.startswith("/admin-login")) or path.startswith("/api/finance")
        if protected and self.role() != "founder":
            body = b"<!DOCTYPE html><html><body><p>This page is only available to the founder.</p><p><a href='instructor-dashboard.html'>Back to teaching</a></p></body></html>"
            self.send_response(403)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/finance":
            body = b'{"status":"unavailable","reason":"No payment provider is connected. Revenue is not estimated from enrolments."}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 5510), Handler).serve_forever()
