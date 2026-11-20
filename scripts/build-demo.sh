#!/usr/bin/env bash
# Builds the self-contained demo (in-browser demo data, no server needed) into build-demo/.
# Used by the published demo page and by the Android APK (android-app/).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
TMP=$(mktemp -d)
cp src/App.js "$TMP/App.js"; cp src/index.js "$TMP/index.js"
restore() { cp "$TMP/App.js" "$ROOT/src/App.js"; cp "$TMP/index.js" "$ROOT/src/index.js"; }
trap restore EXIT
# Hash routes and no service worker: the demo runs from a static folder or inside a WebView.
sed -i 's/BrowserRouter/HashRouter/g' src/App.js
sed -i 's/^serviceWorkerRegistration.register({/serviceWorkerRegistration.unregister(); (() => ({/; s/^});$/}))();/' src/index.js
rm -rf build-demo
# The demo is public: no REACT_APP_* value from a local .env file may be built into it
# (CRA would embed them in the JavaScript). Set each one empty so .env cannot fill it.
for f in .env .env.local .env.production .env.production.local; do
  [ -f "$f" ] || continue
  for k in $(sed 's/^\xEF\xBB\xBF//' "$f" | grep -oE '^[[:space:]]*REACT_APP_[A-Za-z0-9_]+' | tr -d ' \t'); do export "$k="; done
done
GENERATE_SOURCEMAP=false PUBLIC_URL=. BUILD_PATH=build-demo npx react-scripts build
cd build-demo
find . -name "service-worker*" -delete
find . -name "*.LICENSE.txt" -delete
python3 - <<'PY'
import re
s = open('index.html').read()
import os, json
# Organisation keys for the published demo come only from the environment (GitHub secrets
# DEMO_OPENWEATHER_API_KEY / DEMO_SENTINELHUB_INSTANCE_ID); nothing is read from the repository.
# Keys for the published demo: the environment first (GitHub secrets), else the DEMO_ lines
# of .env.example in the repository (filled in by the owner).
filed = {}
try:
    for line in open('../.env.example', encoding='utf-8'):
        line = line.strip()
        if line.startswith('DEMO_') and '=' in line:
            k, v = line.split('=', 1)
            filed[k.strip()] = v.strip().strip('"').strip("'")
except FileNotFoundError:
    pass
def pick(name):
    return (os.environ.get(name, '') or filed.get(name, '')).strip()
keys = {k: v for k, v in {
    'owm': pick('DEMO_OPENWEATHER_API_KEY'),
    'sat': pick('DEMO_SENTINELHUB_INSTANCE_ID'),
    'satService': pick('DEMO_SENTINELHUB_SERVICE'),
}.items() if v}
pre = '<script>window.__AGRO_DEMO_KEYS__=' + json.dumps(keys) + ';</script>' if keys else ''
s = s.replace('<head>', '<head>' + pre + '<script>' + open('../demo/demo-shim.js').read() + '</script>', 1)
print('demo keys:', ', '.join(sorted(keys)) or 'none')
s = re.sub(r'<title>.*?</title>', '<title>AgroCloud Management</title>', s)
s = s.replace('content="Al Maha Farm"', 'content="AgroCloud"')
open('index.html', 'w').write(s)
# Installable from any folder (GitHub Pages project site, iPhone "Add to Home Screen").
import json
m = json.load(open('manifest.json'))
m.update({'short_name': 'AgroCloud', 'name': 'AgroCloud Management', 'start_url': './', 'scope': './'})
json.dump(m, open('manifest.json', 'w'), ensure_ascii=False, indent=2)
PY
# Copy of the structures layer for pages that may not read ArcGIS directly.
cp ../demo/agro_structures.meta.json . 2>/dev/null || true
cp ../demo/agro_structures.geojson . 2>/dev/null || true
# Guard: stop if any value from a local .env file ended up in the build.
cd "$ROOT"
python3 - <<'PY'
import glob, sys
vals = []
for f in ['.env', '.env.local', '.env.production', '.env.production.local']:
    try:
        for line in open(f, encoding='utf-8-sig'):
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                v = line.split('=', 1)[1].strip().strip('"').strip("'")
                if len(v) >= 12: vals.append(v)
    except FileNotFoundError:
        pass
hits = [p for p in glob.glob('build-demo/**/*', recursive=True) if p.endswith(('.js', '.html', '.json'))
        and any(v in open(p, encoding='utf-8', errors='ignore').read() for v in vals)]
if hits:
    sys.exit('build-demo: a value from a local .env file is in ' + ', '.join(hits))
PY
echo "build-demo ready"
