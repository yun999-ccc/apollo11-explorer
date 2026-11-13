"""Crop a westbound landing practice area from NAC_DTM_APOLLO11.TIF."""
import base64
import hashlib
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def extract(path):
    longitude, latitude = 23.47314, 0.67416
    radius = 1737400
    site_east = radius * math.cos(math.radians(1)) * math.radians(longitude - 180)
    site_north = radius * math.radians(latitude)
    # NASA/TM Fig. 14 reconstructed along-track displacement is about 766 m.
    # The exercise uses a westbound approximation with this initial distance.
    east_at_start = site_east + 768
    low_x, high_x, low_y, high_y, step = -256, 2304, -1024, 1024, 8
    x = np.arange(low_x, high_x + step, step)
    y = np.arange(low_y, high_y + step, step)

    with Image.open(path) as image:
        dx, dy, _ = image.tag_v2[33550]
        i, j, _, east, north, _ = image.tag_v2[33922]
        assert image.tag_v2[34736][:3] == (0, 180, 1)
        assert (abs(dx - 2) < 1e-8 and abs(dy - 2) < 1e-8 and i == j == 0)
        column = np.rint((east_at_start - x - east) / dx - .5).astype(int)
        row = np.rint((north - site_north - y) / dy - .5).astype(int)
        assert min(column) >= 0 and max(column) < image.width
        assert min(row) >= 0 and max(row) < image.height
        strips = image.tag_v2[273]
        row_bytes = image.width * 4
        assert image.tag_v2[259] == image.tag_v2[278] == 1
        assert strips[max(row)] - strips[min(row)] == row_bytes * (max(row) - min(row))
        with Path(path).open('rb') as source:
            assert source.read(4) == b'II*\0'
            source.seek(strips[min(row)])
            source_rows = source.read(row_bytes * (max(row) - min(row) + 1))
        crop = np.frombuffer(source_rows, dtype='<f4').reshape(-1, image.width)
        heights = crop[np.ix_(row - min(row), column)].astype(float)

    available = np.isfinite(heights) & (abs(heights) < 10000)
    origin = (-low_y // step, -low_x // step)
    site = (origin[0], (768 - low_x) // step)
    assert available[origin] and available[site]
    # Flat continuation is outside the measured crop. Fade at the crop edge
    # to avoid artificial cliffs and retain a continuous contact surface.
    fade_x = np.minimum((x - low_x) / 160, (high_x - x) / 160).clip(0, 1)
    fade_y = np.minimum((y - low_y) / 160, (high_y - y) / 160).clip(0, 1)
    relative = np.where(available, heights - heights[origin], 0) * fade_y[:, None] * fade_x
    print(f'Coverage {available.mean():.2%}; site relative elevation {relative[site]:.2f} m')
    assert available.mean() > .995
    quantized = np.rint(relative * 100).astype('<i2')
    data = base64.b64encode(quantized.tobytes()).decode('ascii')
    header = '// NASA/GSFC/ASU LROC · NAC_DTM_APOLLO11.TIF\n'
    header += '// SHA-256 of the source TIFF rows used: ' + hashlib.sha256(source_rows).hexdigest() + '\n'
    metadata = f'export const grid = {{lowX:{low_x}, highX:{high_x}, lowY:{low_y}, highY:{high_y}, step:{step}}};\n'
    return header + metadata + f"export const elevationCentimetres = '{data}';\n"


if __name__ == '__main__':
    Path(sys.argv[2]).write_text(extract(sys.argv[1]))
