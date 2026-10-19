"""Assemble the editable studio sources into the portable single-file HTML."""
from pathlib import Path

root = Path(__file__).resolve().parent
output = root / 'DREAMCORE __ 旧核·梦核·怪核图片滤镜实验室.html'
data = (root / 'studio-scenes.js').read_text(encoding='utf-8')
html = (root / 'studio-template.html').read_text(encoding='utf-8')
script = (root / 'studio.js').read_text(encoding='utf-8') + '\n' + (root / 'studio-guide.js').read_text(encoding='utf-8')
for marker, content in [('STUDIO_CSS', (root / 'studio.css').read_text(encoding='utf-8')), ('LEGACY_DATA', data), ('STUDIO_JS', script)]:
    html = html.replace('/* ' + marker + ' */', content)
output.write_text(html, encoding='utf-8')
print(f'Built {output.name}: {len(html.encode("utf-8"))} bytes')
