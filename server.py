import os
from queue import Queue
from argparse import ArgumentParser
import os.path as p
import json
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
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

parser = ArgumentParser()
parser.add_argument("note_directory", type=str)
parser.add_argument("--bind-address", default="127.0.0.1", type=str, required=False)
parser.add_argument("--port", default=3322, type=int, required=False)
parser.add_argument("--dry-run", action="store_true",default=False,required=False)
parser.add_argument("--verbose")
args = parser.parse_args()
note_directory = p.abspath(args.note_directory)

class MyHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        logger.debug(f"Received POST request for {self.path}")
        if self.path == "/pull-lfs":
            content_length = int(self.headers.get('Content-Length', 0))
            user_agent = self.headers.get('User-Agent', "")
            body = self.rfile.read(content_length)
            data = json.loads(body.decode(encoding="utf-8"))
            note_path = data["note"]
            logger.log(f"Processing note path: {note_path}")
            result = []
            
            for resource_path in data["resources"]:
                logger.debug(f"Adding resource {resource_path} to task queue")
                logger.debug(f"Task fetched: note_path={note_path}, resource_path={resource_path}")
                args1 = [
                    "git","lfs","pull","--include",",".join(data["resources"])
                ]
                last_modified_time = os.stat(p.join(note_directory,resource_path)).st_mtime
                if args.dry_run:
                    args1.insert(0,"echo")
                res = subprocess.run(
                    args=args1,
                    cwd=note_directory
                )
                if res.returncode == 0:
                    logger.log(f"Completed pulling LFS file for {resource_path}")
                    if os.stat(p.join(note_directory,resource_path)).st_mtime != last_modified_time:
                        res_code = 0
                    else:
                        res_code = 1
                else:
                    logger.error(f"Failed to pull LFS file for {resource_path}")
                    res_code = 2
                result.append(res_code)
            self.send_response(200)
            if "Android" in user_agent:
                self.send_header('Access-Control-Allow-Origin', 'http://localhost') # Mobile
            else:
                self.send_header("Access-Control-Allow-Origin","app://obsidian.md") # Desktop
            self.send_header("Access-Control-Allow-Methods","POST")
            self.send_header("Access-Control-Allow-Headers","*")
            self.send_header("Content-Type","application/json")
            self.end_headers()
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
task_queue = Queue()
server = HTTPServer(
    server_address=(args.bind_address, args.port),
    RequestHandlerClass=MyHandler
)

logger.log(f"Listening on {args.bind_address}:{args.port}...")
server.serve_forever()