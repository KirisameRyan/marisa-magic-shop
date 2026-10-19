#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
霧雨魔法店 · 本地静态服务器(Unity WebGL 测试用)
相比 python -m http.server 增加了:
  - .br 文件回 Content-Encoding: br(Unity WebGL 加载器必需)
  - .gz  文件回 Content-Encoding: gzip
  - .wasm 回 application/wasm
用法: python scripts/serve.py [端口]   默认 8090
"""
import http.server
import mimetypes
import sys
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('public_files', ROOT / 'scripts/public-files.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        from urllib.parse import unquote, urlsplit
        request_path = unquote(urlsplit(self.path).path)
        name = request_path.lstrip('/') or 'index.html'
        if name.endswith('/'): name += 'index.html'
        resolved = (ROOT / name).resolve()
        if not resolved.is_relative_to(ROOT) or not policy.public_file(name):
            self.send_error(404)
            return
        self.path = '/' + name
        super().do_GET()

    def do_HEAD(self):
        # Apply the same publication policy without streaming the response body.
        from urllib.parse import unquote, urlsplit
        name = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        if not policy.public_file(name): self.send_error(404); return
        super().do_HEAD()

    def end_headers(self):
        path = self.path.split("?")[0].lower()
        if path.endswith(".br"):
            self.send_header("Content-Encoding", "br")
            if path.endswith(".wasm.br"):
                self.send_header("Content-Type", "application/wasm")
            else:
                self.send_header("Content-Type", "application/octet-stream")
        elif path.endswith(".gz"):
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Type", "application/octet-stream")
        elif path.endswith(".wasm"):
            self.send_header("Content-Type", "application/wasm")
        if "/unity/" in path:
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


if __name__ == "__main__":
    import os
    os.chdir(ROOT)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("serve.py running on http://127.0.0.1:%d" % PORT)
    server.serve_forever()
