from __future__ import annotations

import ipaddress
import select
import socket
import socketserver
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler
from typing import Literal
from urllib.parse import urlsplit

MAX_NETWORK_BYTES = 21 * 1024**3


def public_addresses(host: str, port: int) -> list[tuple[int, str]]:
    if not host or host.endswith(".") or "%" in host:
        raise ValueError("invalid_destination")
    try:
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError("dns_failed") from exc
    result: list[tuple[int, str]] = []
    for family, _, _, _, address in addresses:
        ip = ipaddress.ip_address(address[0])
        if not ip.is_global or ip.is_multicast or ip.is_reserved:
            raise ValueError("private_destination")
        if (family, str(address[0])) not in result:
            result.append((family, str(address[0])))
    if not result:
        raise ValueError("dns_failed")
    return result


def validate_url(url: str, *, resolve: bool = True) -> tuple[str, str, int]:
    try:
        parsed = urlsplit(url)
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise ValueError("invalid_url") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("invalid_url")
    if parsed.username or parsed.password or parsed.fragment or port not in {80, 443}:
        raise ValueError("invalid_url")
    if any(ord(character) <= 32 for character in url) or len(url) > 4096:
        raise ValueError("invalid_url")
    if resolve:
        public_addresses(parsed.hostname, port)
    return parsed.scheme, parsed.hostname.lower(), port


def platform_url(url: str) -> Literal["youtube", "bilibili"]:
    scheme, host, _ = validate_url(url)
    if scheme != "https":
        raise ValueError("https_required")
    path = urlsplit(url).path
    if host in {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}:
        if host == "youtu.be" and len(path.strip("/")) == 11:
            return "youtube"
        if path == "/watch" or path.startswith(("/shorts/", "/live/")):
            return "youtube"
    if host in {"bilibili.com", "www.bilibili.com", "m.bilibili.com"} and path.startswith(
        "/video/"
    ):
        return "bilibili"
    raise ValueError("unsupported_platform")


class GuardedProxy(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self) -> None:
        self.total_bytes = 0
        self.counter_lock = threading.Lock()
        self.deadline = time.monotonic() + 7200
        super().__init__(("127.0.0.1", 0), ProxyHandler)

    def spend(self, count: int) -> None:
        with self.counter_lock:
            self.total_bytes += count
            if self.total_bytes > MAX_NETWORK_BYTES or time.monotonic() > self.deadline:
                raise ValueError("network_budget_exceeded")


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: object) -> None:
        pass

    def do_CONNECT(self) -> None:
        self._forward(True)

    def do_GET(self) -> None:
        self._forward(False)

    def do_POST(self) -> None:
        self._forward(False)

    def _forward(self, tunnel: bool) -> None:
        upstream: socket.socket | None = None
        try:
            if tunnel:
                parsed = urlsplit("https://" + self.path)
                host, port = parsed.hostname or "", parsed.port or 443
                if port != 443 or parsed.path not in {"", "/"} or parsed.username:
                    raise ValueError("invalid_destination")
            else:
                _, host, port = validate_url(self.path)
                parsed = urlsplit(self.path)
            addresses = public_addresses(host, port)
            family, ip = addresses[0]
            upstream = socket.socket(family, socket.SOCK_STREAM)
            upstream.settimeout(30)
            # Dial the verified address, never resolve the hostname again while connecting.
            upstream.connect((ip, port))
            if tunnel:
                self.send_response(200, "Connection Established")
                self.end_headers()
            else:
                path = parsed.path or "/"
                if parsed.query:
                    path += "?" + parsed.query
                head = f"{self.command} {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n"
                for key, value in self.headers.items():
                    if key.lower() not in {
                        "host",
                        "connection",
                        "proxy-authorization",
                        "proxy-connection",
                    }:
                        head += f"{key}: {value}\r\n"
                upstream.sendall((head + "\r\n").encode("latin1"))
            self.connection.setblocking(False)
            upstream.setblocking(False)
            sockets = [self.connection, upstream]
            idle = time.monotonic() + 120
            while time.monotonic() < idle:
                ready, _, _ = select.select(sockets, [], [], 1)
                for source in ready:
                    block = source.recv(65536)
                    if not block:
                        return
                    server = self.server
                    assert isinstance(server, GuardedProxy)
                    server.spend(len(block))
                    destination = upstream if source is self.connection else self.connection
                    destination.setblocking(True)
                    destination.settimeout(30)
                    destination.sendall(block)
                    destination.setblocking(False)
                    idle = time.monotonic() + 120
        except (ValueError, OSError):
            if upstream is None:
                self.send_error(403, "Destination denied")
        finally:
            if upstream is not None:
                upstream.close()
            self.close_connection = True


@contextmanager
def guarded_proxy() -> Iterator[str]:
    proxy = GuardedProxy()
    thread = threading.Thread(target=proxy.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{proxy.server_address[1]}"
    finally:
        proxy.shutdown()
        proxy.server_close()
