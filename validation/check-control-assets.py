"""Compare cockpit sprites with the archived, pinned upstream BMPs byte/pixel-wise."""
import hashlib
import io
import json
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'landing/nassp/controls'
manifest = json.loads((root / 'assets.json').read_text())
digest = lambda data: hashlib.sha256(data).hexdigest()
checks = []
with zipfile.ZipFile(root / 'original-assets.zip') as archive:
    for entry in manifest['files']:
        original_bytes = archive.read(Path(entry['original']).name)
        png_bytes = (root / entry['file']).read_bytes()
        assert digest(original_bytes) == entry['originalSha256'], entry['original']
        assert digest(png_bytes) == entry['pngSha256'], entry['file']
        original = np.array(Image.open(io.BytesIO(original_bytes)).convert('RGB'))
        exported = np.array(Image.open(io.BytesIO(png_bytes)).convert('RGBA'))
        assert list(reversed(original.shape[:2])) == entry['size']
        assert original.shape[:2] == exported.shape[:2]
        assert np.array_equal(original, exported[:, :, :3]), entry['file']
        expected_alpha = np.where((original == [255, 0, 255]).all(axis=2), 0, 255)
        assert np.array_equal(exported[:, :, 3], expected_alpha), entry['file']
        checks.append({'file': entry['file'], 'rgbMismatchPixels': 0,
                       'onlyOriginalColorKeyTransparent': True})
    for entry in manifest['sourceFiles']:
        name = Path(entry['path']).name
        assert digest((root / name).read_bytes()) == entry['sha256'], name
        assert archive.read(name) == (root / name).read_bytes(), name
    assert b'General Public License' in archive.read('Project Apollo License.txt')

report = {'commit': manifest['commit'], 'spriteChecks': checks,
          'verifiedSourceFiles': len(manifest['sourceFiles']),
          'validatesSystemBehavior': False}
(root / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
