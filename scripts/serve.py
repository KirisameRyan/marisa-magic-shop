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

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090


class Handler(http.server.SimpleHTTPRequestHandler):
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
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("serve.py running on http://127.0.0.1:%d" % PORT)
    server.serve_forever()
