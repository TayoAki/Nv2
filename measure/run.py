"""
Starts the service on one dual-stack socket: IPv4 for Railway's health check and IPv6 for its
private network. (Binding uvicorn to "::" directly makes the socket IPv6-only.)
"""

import os
import socket

import uvicorn

from app import app

port = int(os.environ.get("PORT", "8000"))
try:
    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    address = ("::", port)
except OSError:
    # No IPv6 on this machine (some local setups): IPv4 only.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    address = ("0.0.0.0", port)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(address)

uvicorn.Server(uvicorn.Config(app, log_level="info")).run(sockets=[sock])
