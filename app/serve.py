#!/usr/bin/env python3
"""Simple static file server for the Fairlight app."""
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(SimpleHTTPRequestHandler):
    pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"Serving Fairlight app on http://localhost:{port}")
    httpd = HTTPServer(("", port), Handler)
    httpd.serve_forever()
