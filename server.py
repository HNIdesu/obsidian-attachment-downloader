import os
from queue import Queue
from argparse import ArgumentParser
import os.path as p
import json
import socket
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
import colorama
from datetime import datetime as DateTime
import select

class Logger:
    def __init__(self, name="server",verbose=False):
        self.name = name
        self.verbose = verbose
        colorama.init(autoreset=True)

    def _prefix(self, level: str) -> str:
        ts = DateTime.now().strftime("%Y-%m-%d %H:%M:%S")
        return f"[{ts}] [{self.name}] [{level}]"

    def log(self, message: str):
        print(f"{self._prefix('LOG')} {message}")

    def warn(self, message: str):
        print(f"{self._prefix('WARN')} {colorama.Fore.YELLOW}{colorama.Style.DIM}{message}")

    def error(self, message: str):
        print(f"{self._prefix('ERROR')} {colorama.Fore.RED}{colorama.Style.BRIGHT}{message}")

    def debug(self, message: str):
        if self.verbose:
            print(f"{self._prefix('DEBUG')} {colorama.Fore.GREEN}{message}")

parser = ArgumentParser()
parser.add_argument("note_directory", type=str)
parser.add_argument("--bind-address", default="127.0.0.1", type=str, required=False)
parser.add_argument("--port", default=3322, type=int, required=False)
parser.add_argument("--dry-run", action="store_true",default=False,required=False)
parser.add_argument("--verbose", action="store_true",default=False,required=False)
args = parser.parse_args()
note_directory = p.abspath(args.note_directory)

class MyHandler(BaseHTTPRequestHandler):
    def is_client_disconnected(self):
        sock = self.connection
        try:
            rlist, _, _ = select.select([sock], [], [], 0)
            if rlist:
                data = sock.recv(1, socket.MSG_PEEK)
                if not data:
                    return True
        except (OSError, ConnectionResetError):
            return True
        return False
    def do_POST(self):
        logger.debug(f"Received POST request for {self.path}")
        if self.is_client_disconnected():
            logger.warn("Client disconnected")
            return
        if self.path == "/pull-lfs":
            content_length = int(self.headers.get('Content-Length', 0))
            user_agent = self.headers.get('User-Agent', "")
            body = self.rfile.read(content_length)
            data = json.loads(body.decode(encoding="utf-8"))
            logger.debug(f"Request body parsed, resources: {data['resources']}")
            args1 = [
                "git","lfs","pull","--include",",".join(data["resources"])
            ]
            if args.dry_run:
                args1.insert(0, "echo")
                logger.debug(f"Dry run enabled, command: {' '.join(args1)}")
            else:
                logger.debug(f"Running command: {' '.join(args1)}")
            proc = subprocess.Popen(
                args=args1,
                cwd=note_directory
            )
            try:
                while True:
                    try:
                        retcode = proc.wait(timeout=1)
                        logger.debug(f"git lfs pull finished with return code: {retcode}")
                        break
                    except subprocess.TimeoutExpired:
                        if self.is_client_disconnected():
                            logger.warn("Client disconnected, terminating git lfs pull process")
                            proc.terminate()
                            proc.wait()
                            return
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    proc.wait()
            if retcode == 0:
                result = [(os.stat(p.join(note_directory, resource_path)).st_mtime_ns // 1000000) for resource_path in data["resources"]]
                logger.debug(f"Successfully fetched resources, sending 200 response")
                self.send_response(200)
            else:
                result = None
                logger.error(f"git lfs pull failed with code {retcode}, sending 500 response")
                self.send_response(500)
            if "Android" in user_agent:
                self.send_header('Access-Control-Allow-Origin', 'http://localhost') # Mobile
            else:
                self.send_header("Access-Control-Allow-Origin","app://obsidian.md") # Desktop
            self.send_header("Access-Control-Allow-Methods","POST")
            self.send_header("Access-Control-Allow-Headers","*")
            self.send_header("Content-Type","application/json")
            self.end_headers()
            if result:
                self.wfile.write(json.dumps(result).encode("utf-8"))
    def do_OPTIONS(self):
        self.send_response(204)
        user_agent = self.headers.get('User-Agent', "")
        if "Android" in user_agent:
            self.send_header('Access-Control-Allow-Origin', 'http://localhost') # Mobile
        else:
            self.send_header("Access-Control-Allow-Origin","app://obsidian.md") # Desktop
        self.send_header("Access-Control-Allow-Methods","POST")
        self.send_header("Access-Control-Allow-Headers","*")
        self.end_headers()

logger = Logger(verbose=args.verbose)
server = HTTPServer(
    server_address=(args.bind_address, args.port),
    RequestHandlerClass=MyHandler
)

logger.log(f"Listening on {args.bind_address}:{args.port}...")
server.serve_forever()