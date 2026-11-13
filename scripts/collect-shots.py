#!/usr/bin/env python3
"""Rebuild screenshots from an app console log written by scripts/ios-device.sh (PK3SHOT lines)."""
import sys, base64, collections, os
log, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
parts = collections.defaultdict(dict)
for line in open(log, errors='ignore'):
    k = line.find('PK3SHOT ')
    if k < 0: continue
    _, name, i, n, data = line[k:].rstrip('\n').split(' ', 4)
    parts[name][int(i)] = (int(n), data)
for name, chunks in parts.items():
    n = next(iter(chunks.values()))[0]
    if len(chunks) != n: print('incomplete', name, len(chunks), n); continue
    open(os.path.join(out, name + '.jpg'), 'wb').write(base64.b64decode(''.join(chunks[i][1] for i in range(n))))
    print('wrote', name)
