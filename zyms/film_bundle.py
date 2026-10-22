"""Extract the pinned upstream photo engine into the main, layered editor."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent

def film_module():
    source = (ROOT / 'vendor/retro-style-studio/dreamcore.html').read_text(encoding='utf-8')
    presets = re.search(r'const PRESETS = (\{.*?\n      \});', source, re.S).group(1)
    random = source[source.index('function mulberry32('):source.index('function hashStringToInt(')]
    scene = source[source.index('function generateProceduralScene('):source.index('      // CORE PIXEL-VECTOR RENDERING ENGINE')]
    # Remove the separator comment between this function and the next section.
    scene = scene[:scene.rfind('      // =========================================================================')]
    render = source[source.index('function renderFilterVectorToCanvas('):source.index('function requestRender()',source.index('function renderFilterVectorToCanvas('))]
    # All decorations belong to the main editor's editable layers, not a baked overlay.
    start = render.index('        const distressPct =')
    end = render.index('        targetCtx.save();\n        targetCtx.clearRect(0, 0, w, h);', start)
    render = render[:start] + render[end:]
    start = render.index('        // Draw Decorative Frame & Overflowing')
    end = render.index('        // Scanlines', start)
    render = render[:start] + render[end:]
    setup = '''
const RETRO_FILM=(()=>{
 const makeCanvas=()=>document.createElement('canvas');
 const workCanvas=makeCanvas(),workCtx=workCanvas.getContext('2d',{willReadFrequently:true});
 const lowResCanvas=makeCanvas(),lowResCtx=lowResCanvas.getContext('2d');
 const bloomCanvas=makeCanvas(),bloomCtx=bloomCanvas.getContext('2d');
 const halCanvas=makeCanvas(),halCtx=halCanvas.getContext('2d',{willReadFrequently:true});
 const rawSourceCanvas=makeCanvas(),rawSourceCtx=rawSourceCanvas.getContext('2d');
 let rawUploadedWidth=800,rawUploadedHeight=600,thumbsDirty=false;
 const syncWorkingResolutionFromRaw=()=>{},requestRender=()=>{};
 const clampByte=value=>Math.max(0,Math.min(255,Math.round(value)));
'''
    result = setup + 'const PRESETS=' + presets + ';\n' + random + scene + render + '''
 return {presets:PRESETS,render:renderFilterVectorToCanvas,scene(name){generateProceduralScene(name);return rawSourceCanvas;}};
})();
'''
    clean = re.sub('[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200D]', '', result)
    return '// Photo pipeline and presets adapted from zhaoyuming3647-design/Retro-Style-Studio @ 5514b7d.\n' + '\n'.join(line.rstrip() for line in clean.splitlines()) + '\n'
