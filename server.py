from queue import Queue
import queue
from argparse import ArgumentParser
import os.path as p
import json
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
import colorama
from datetime import datetime as DateTime

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


class MyHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        logger.debug(f"Received POST request for {self.path}")
        if self.path == "/pull-lfs":
            content_length = int(self.headers.get('Content-Length', 0))
            user_agent = self.headers.get('User-Agent', "")
            body = self.rfile.read(content_length)
            data = json.loads(body.decode(encoding="utf-8"))
            new_queue = Queue()
            note_path = data["note"]
            logger.log(f"Processing note path: {note_path}")
            for resource_path in data["resources"]:
                logger.debug(f"Adding resource {resource_path} to task queue")
                new_queue.put(item=(note_path, resource_path))
            global task_queue
            task_queue = new_queue
            self.send_response(200)
            if "Android" in user_agent:
                self.send_header('Access-Control-Allow-Origin', 'http://localhost') # Mobile
            else:
                self.send_header("Access-Control-Allow-Origin","app://obsidian.md") # Desktop
            self.send_header("Access-Control-Allow-Methods","POST")
            self.send_header("Access-Control-Allow-Headers","*")
            self.end_headers()
            self.wfile.write(b"OK")
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

class CancellationToken:
    def __init__(self):
        self.canceled = False

def work(cancellationToken:CancellationToken,note_directory:str,dry_run:bool=False):
    global task_queue
    local_queue = task_queue
    while not cancellationToken.canceled:
        if local_queue != task_queue:
            logger.warn("Current queue was replaced")
            local_queue = task_queue
        try:
            note_path, resource_path = local_queue.get(timeout=1)
            logger.debug(f"Task fetched: note_path={note_path}, resource_path={resource_path}")
            args = [
                "git",
                "lfs",
                "pull",
                "--include",
                resource_path
            ]
            if dry_run:
                args.insert(0,"echo")
            res = subprocess.run(
                args=args,
                cwd=note_directory
            )
            if res.returncode == 0:
                logger.log(f"Completed pulling LFS file for {resource_path}")
            else:
                logger.error(f"Failed to pull LFS file for {resource_path}")
        except queue.Empty:
            continue

parser = ArgumentParser()
parser.add_argument("note_directory", type=str)
parser.add_argument("--bind-address", default="127.0.0.1", type=str, required=False)
parser.add_argument("--port", default=3322, type=int, required=False)
parser.add_argument("--dry-run", action="store_true",default=False,required=False)
parser.add_argument("--verbose")
args = parser.parse_args()

logger = Logger(verbose=args.verbose)
task_queue = Queue()
server = HTTPServer(
    server_address=(args.bind_address, args.port),
    RequestHandlerClass=MyHandler
)
note_directory = p.abspath(args.note_directory)
token = CancellationToken()

Thread(target=work,kwargs={
    "cancellationToken": token,
    "note_directory": note_directory,
    "dry_run": args.dry_run
}).start()
logger.log(f"Listening on {args.bind_address}:{args.port}...")
try:
    server.serve_forever()
finally:
    token.canceled = True