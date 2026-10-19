"""Assemble the editable studio sources into the portable single-file HTML."""
from pathlib import Path
import base64
import re

root = Path(__file__).resolve().parent
output = root / 'DREAMCORE __ 旧核·梦核·怪核图片滤镜实验室.html'
data = (root / 'studio-scenes.js').read_text(encoding='utf-8')
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
for marker, content in [('STUDIO_CSS', (root / 'studio.css').read_text(encoding='utf-8')), ('LEGACY_DATA', data), ('STUDIO_JS', script)]:
    html = html.replace('/* ' + marker + ' */', content)
output.write_text(html, encoding='utf-8')
print(f'Built {output.name}: {len(html.encode("utf-8"))} bytes')
