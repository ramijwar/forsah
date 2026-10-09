#!/usr/bin/env python3
"""Stream command logs and expose a bounded failure tail in GitHub annotations."""
import collections
import subprocess
import sys

lines = collections.deque(maxlen=45)
process = subprocess.Popen(sys.argv[1:], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
for line in process.stdout:
    print(line, end='', flush=True)
    lines.append(line)
code = process.wait()
if code:
    message = ''.join(lines)[-12000:].replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print(f'::error title=Build command failed::{message}', flush=True)
sys.exit(code)
