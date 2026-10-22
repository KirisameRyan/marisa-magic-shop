"""Package the pinned upstream engines as isolated, offline srcdoc documents."""
from pathlib import Path
import base64
import json
import re

ROOT = Path(__file__).resolve().parent

def engine_payload():
    payload = {}
    vendor = ROOT / 'vendor/retro-style-studio'
    for mode, filename in [('pixel', 'index')]:
        html = (vendor / (filename + '.html')).read_text(encoding='utf-8')
        html = re.sub(r'<script>\s*tailwind.config\s*=.*?</script>', '', html, flags=re.S)
        html = re.sub(r'<script src="https://cdn.tailwindcss.com/3.4.17"></script>', '', html)
        html = re.sub(r'<link[^>]+(?:fonts.googleapis.com|fonts.gstatic.com)[^>]*>', '', html)
        if mode == 'pixel':
            gif = (ROOT / 'vendor/omggif-1.0.10.js').read_text(encoding='utf-8')
            html = html.replace('<script src="https://cdn.jsdelivr.net/npm/omggif@1.0.10/omggif.js"></script>', '<script>' + gif + '</script>')
            html = html.replace("loadBuiltInDemo('synth');", "loadBuiltInDemo('synth').then(()=>window.dispatchEvent(new Event('mms-engine-ready')));")
            html = html.replace('if (!file) return;', "if (!file) return; if(file.size>40*1024*1024){showToast('文件超过 40MB，请压缩后导入');return;}")
            html = html.replace('const numFrames = reader.numFrames();', "const numFrames = reader.numFrames(); if(numFrames>80||gw*gh>4000000||gw*gh*numFrames>24000000)throw Error('GIF 超出限制：最多80帧、单帧4MP、合计24MP');")
            html = html.replace("showToast(state.lang === 'zh' ? '图像解析失败，请尝试其他图片或GIF' : 'Failed to decode image');", "showToast('图像解析失败：'+(err.message||'请尝试其他文件'));")
            html = html.replace("c.width = img.naturalWidth || img.width;", "if(img.naturalWidth*img.naturalHeight>16000000)throw Error('静态图片超过16MP，请缩小后导入'); c.width = img.naturalWidth || img.width;")
        else:
            html = html.replace('const decoded = atob(clean.slice(4));', "const decoded = atob(clean.slice(4)); if(decoded.trim().startsWith('{')){showToast('这是记忆工作台配方，请在记忆工作台读取');return false;}")
            html = html.replace("if (!file || !file.type.startsWith('image/')) return;", "if (!file || !file.type.startsWith('image/')) return; if(file.size>40*1024*1024){showToast('文件超过40MB，请压缩后导入');return;} if(file.type==='image/gif'){showToast('GIF 请使用 8-bit / GIF 工作区');return;}")
            html = html.replace('maximum-scale=1.0, user-scalable=no', 'maximum-scale=5.0')
            html = html.replace('// --- Initial Boot ---', "window.mmsFilm={example(scene,preset){if(['corridor','meadow','school','poolrooms','arcade','nightcars'].includes(scene))generateProceduralScene(scene);if(PRESETS[preset])applyPresetWithIntensity(preset,100);},source:()=>rawSourceCanvas}; // --- Initial Boot ---")
        # Keep the original snapshots untouched; apply integration styling at build time.
        html = re.sub('[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200D]', '', html)
        css = (vendor / (filename + '.tailwind.css')).read_text(encoding='utf-8')
        adapter_css = (ROOT / 'retro-adapter.css').read_text(encoding='utf-8')
        csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; connect-src \'none\'">'
        notice = '<!-- Integrated from zhaoyuming3647-design/Retro-Style-Studio, commit 5514b7dbbf5258cc3e8842cd26b724885455692b.\nTailwind CSS 3.4.17 license:\n' + (ROOT / 'vendor/tailwind-LICENSE.txt').read_text(encoding='utf-8') + '\n-->'
        html = html.replace('<head>', '<head>' + notice + csp + '<style>' + css + '</style>', 1)
        html = html.replace('</head>', '<style>' + adapter_css + '</style></head>', 1)
        html = html.replace('</head>', '<style>' + (ROOT / 'retro-tools.css').read_text(encoding='utf-8') + '</style></head>', 1)
        bridge = (ROOT / 'retro-adapter.js').read_text(encoding='utf-8').replace('__MODE__', mode)
        bridge += '\n' + (ROOT / 'retro-tools.js').read_text(encoding='utf-8')
        html = html.replace('</body>', '<script>' + bridge + '</script></body>')
        payload[mode] = base64.b64encode(html.encode('utf-8')).decode('ascii')
    return json.dumps(payload, separators=(',', ':'))
