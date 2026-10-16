"""Package an ARTIFACT=1 build (`ARTIFACT=1 npx vite build --outDir dist-artifact`) as one claude.ai page.

The artifact host only runs inline scripts and only loads fonts from Google or data: URIs, so:
  - the JS bundle and CSS are inlined into the page
  - CSS @font-face woff2 files are inlined as data: URIs (the woff fallbacks are dropped)
  - files the JS fetches at runtime (troika's .woff fonts, the portrait) are published beside the page
For a normal host, deploy dist/ from `npm run build` as-is; none of this is needed.
"""
import base64, pathlib, re, shutil, sys

src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'dist-artifact')
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'artifact')
if out.exists():
    shutil.rmtree(out)
out.mkdir(parents=True)

html = (src / 'index.html').read_text()
js_files = list(src.glob('assets/*.js'))
assert len(js_files) == 1, f'expected a single bundle, got {js_files}'
js = js_files[0].read_text().replace('</script', '<\\/script')
css = next(src.glob('assets/*.css')).read_text()

def inline_font(m):
    name = m.group(1)
    data = base64.b64encode((src / 'assets' / name).read_bytes()).decode()
    return f"url(data:font/woff2;base64,{data}) format('woff2')"

# url(./x.woff2) format("woff2"),url(./x.woff) format("woff")  ->  data URI woff2 only
css = re.sub(r"url\(\.?/?([^)]+?\.woff2)\)\s*format\([\"']woff2[\"']\)\s*,\s*url\([^)]+?\.woff\)\s*format\([\"']woff[\"']\)", inline_font, css)
assert '.woff2)' not in css, 'a woff2 reference was not inlined'

head = re.search(r'<head>(.*)</head>', html, re.S).group(1)
head = re.sub(r'<meta charset[^>]*>|<meta name="viewport"[^>]*>|<script[^>]*></script>|<link rel="stylesheet"[^>]*>|<link rel="modulepreload"[^>]*>', '', head)
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
body = re.sub(r'<script[^>]*></script>', '', body)
page = head.strip() + f'\n<style>{css}</style>\n' + body.strip() + f'\n<script type="module">{js}</script>\n'
(out / 'index.html').write_text(page)

# runtime-fetched files: anything the bundle builds with new URL("name", import.meta.url)
for name in sorted(set(re.findall(r'new URL\("([^"]+)",import\.meta\.url\)', js))):
    shutil.copy(src / 'assets' / name, out / name)

print(f'{len(page) // 1024} KB page;', sorted(p.name for p in out.iterdir() if p.name != 'index.html'))
