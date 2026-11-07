"""Extract individual switches from the pinned NASSP source, never screenshot guesses."""
import re
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'landing/nassp/lempanel.cpp').read_text()
zones = {z['id']: z['rect'] for z in json.loads((ROOT / 'landing/nassp/coordinates.json').read_text())['views']['MAIN']}
rows = dict(re.findall(r'(\w+)\.Init\((AID_\w+), MainPanel\)', source))
sprites = {'SRF_LMTHREEPOSLEVER': 'lemswitch3', 'SRF_LMTWOPOSLEVER': 'lemswitch2',
           'SRF_LMTHREEPOSSWITCH': 'lem_threeposswitch', 'SRF_SWITCHUP': 'lem_switchup',
           'SRF_LEMROTARY': 'LemRotationalSwitch', 'SRF_LMABORTBUTTON': 'LMAbortButton',
           'SRF_LEM_MASTERALARM': 'lem_master_alarm'}
values = {'true': 1, 'false': 0, 'THREEPOSSWITCH_DOWN': 0, 'THREEPOSSWITCH_CENTER': 1,
          'THREEPOSSWITCH_UP': 2, 'TOGGLESWITCH_DOWN': 0, 'TOGGLESWITCH_UP': 1}
controls = []
pattern = r'(\w+)\.Init\((\d+), (\d+), (\d+), (\d+), srf\[(SRF_\w+)\], srf\[SRF_\w+\], (\w+)([^;]*);'
for m in re.finditer(pattern, source):
    name, x, y, w, h, sprite, row, tail = m.groups()
    zone = zones.get(rows.get(row))
    if not zone or sprite not in sprites:
        continue
    x, y, w, h = zone[0] + int(x), zone[1] + int(y), int(w), int(h)
    if not (620 <= x < 2070 and 210 <= y < 1130):
        continue
    register = re.search(r'\b' + name + r'\.Register\s*\(PSH,\s*"[^"]+",\s*([^,;)]+)([^;]*);', source)
    assert register, name
    raw = register[1].strip()
    default = values[raw] if raw in values else int(raw)
    positions = [(int(a), int(b)) for a, b in re.findall(name + r'\.AddPosition\((\d+),\s*(\d+)\)', source)]
    kind = 'rotary' if positions else 'three' if 'THREE' in sprite else 'two'
    if name in ['AbortSwitch', 'AbortStageSwitch']: kind = 'abort'
    if 'MasterAlarm' in name: kind = 'alarm'
    controls.append(dict(id=name, area=rows[row], rect=[x,y,x+w,y+h], sprite=sprites[sprite],
                         kind=kind, default=default, spring='SPRINGLOADEDSWITCH_CENTER' in register[2],
                         delay=1 if re.search(name+r'\.SetDelayTime\(1\)',source) else 0,
                         angles=[b for a,b in positions], line=source[:m.start()].count('\n')+1,
                         registerLine=source[:register.start()].count('\n')+1))
assert len(controls) == len({c['id'] for c in controls}) == 47
(ROOT/'landing/nassp/controls/controls.json').write_text(json.dumps({
    'source':'../lempanel.cpp', 'commit':'a4ed25511e626823f9c83b457cf9371375b82094',
    'initialStateBasis':'NASSP InitSwitches defaults; not an Apollo 11 terminal descent snapshot',
    'controls':controls
},indent=2)+'\n')
print(f'Extracted {len(controls)} individual front-panel controls from pinned source.')
