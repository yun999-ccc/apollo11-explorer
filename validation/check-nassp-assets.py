"""Verify the port against shipped upstream source assets, not regenerated expected pictures."""
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path
import numpy as np
from PIL import Image

repo = Path(__file__).resolve().parents[1]
assets = repo / 'landing/nassp'
manifest = json.loads((assets / 'manifest.json').read_text())
checks = []
with zipfile.ZipFile(assets / 'source-assets.zip') as archive:
    for item in manifest['conversionChecks']:
        original = np.array(Image.open(io.BytesIO(archive.read(item['name'] + '.bmp'))).convert('RGB'))
        exported = np.array(Image.open(assets / (item['name'] + '.png')).convert('RGBA'))
        assert original.shape[:2] == exported.shape[:2]
        assert np.array_equal(original, exported[:, :, :3])
        color_key = (original == [255, 0, 255]).all(axis=2)
        assert np.all(exported[color_key, 3] == 0)
        assert np.all(exported[~color_key, 3] == 255)
        assert hashlib.sha256((assets / (item['name'] + '.png')).read_bytes()).hexdigest() == item['sha256']
        checks.append({'asset': item['name'], 'width': int(original.shape[1]), 'height': int(original.shape[0]), 'rgbMismatchPixels': 0, 'onlyOriginalColorKeyTransparent': True})
    source = archive.read('lempanel.cpp').decode(errors='replace')
    coordinates = json.loads((assets / 'coordinates.json').read_text())
    for view, zones in coordinates['views'].items():
        for zone in zones:
            numbers = r'\s*,\s*'.join(str(v) for v in zone['rect'])
            pattern = re.escape(zone['id']) + r'\s*,\s*_R\(\s*' + numbers + r'\s*\)'
            assert re.search(pattern, source), zone
    assert len(coordinates['dskyKeys']) == 19
    assert 'RenderTwoDigitDisplay(surf, digits, 66 + xOffset, 16 + yOffset' in archive.read('dsky.cpp').decode(errors='replace')
    assert 'General Public License' in archive.read('Project Apollo License.txt').decode()
report = {
    'repository': 'orbiternassp/NASSP',
    'commit': manifest['commit'],
    'imageChecks': checks,
    'regionsFromUpstream': {view: len(zones) for view, zones in coordinates['views'].items()},
    'dskyKeys': 19,
    'originalCoordinatesRetained': True,
    'originalGlyphsAndDrawingCoordinatesUsed': True,
    'fullNasspSystemsPorted': False,
    'exactScreenshotSimulatorBuildIdentified': False
}
(assets / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
