"""Assemble the editable studio sources into the portable single-file HTML."""
from pathlib import Path
import base64
import re
from retro_bundle import engine_payload
from film_bundle import film_module

root = Path(__file__).resolve().parent
output = root / 'memory-signal.html'
data = (root / 'studio-scenes.js').read_text(encoding='utf-8') + '\n' + film_module()
html = (root / 'studio-template.html').read_text(encoding='utf-8')
font_root = root.parent / 'css/vendor/fontawesome'
if (font_root / 'css/all.min.css').exists():
    icons = (font_root / 'css/all.min.css').read_text(encoding='utf-8')
    def inline_font(match):
        font = font_root / 'webfonts' / match.group(1)
        return 'url(data:font/woff2;base64,' + base64.b64encode(font.read_bytes()).decode('ascii') + ')'
    icons = re.sub(r'url\(\.\./webfonts/([^)]*\.woff2)\)', inline_font, icons)
    # WOFF2 is supported in target browsers. Remove unused TTF fallback requests.
    icons = re.sub(r',url\(\.\./webfonts/[^)]*\.ttf\) format\("truetype"\)', '', icons)
    html = html.replace('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">', '<style>' + icons + '</style>')
script = (root / 'studio.js').read_text(encoding='utf-8') + '\n' + (root / 'studio-guide.js').read_text(encoding='utf-8')
script += '\n' + (root / 'studio-retro.js').read_text(encoding='utf-8').replace('/* RETRO_PAYLOAD */{}', engine_payload())
script += '\n' + (root / 'studio-tools.js').read_text(encoding='utf-8')
import json
examples = {path.stem: 'data:image/webp;base64,' + base64.b64encode(path.read_bytes()).decode('ascii') for path in (root / 'examples').glob('*.webp')}
script += '\n' + (root / 'studio-home.js').read_text(encoding='utf-8').replace('/* STUDIO_EXAMPLES */{}', json.dumps(examples,separators=(',', ':')))
for marker, content in [('STUDIO_CSS', (root / 'studio.css').read_text(encoding='utf-8') + '\n' + (root / 'studio-skin.css').read_text(encoding='utf-8') + '\n' + (root / 'studio-tools.css').read_text(encoding='utf-8')), ('LEGACY_DATA', data), ('STUDIO_JS', script)]:
    html = html.replace('/* ' + marker + ' */', content)
output.write_text(html, encoding='utf-8')
print(f'Built {output.name}: {len(html.encode("utf-8"))} bytes')
