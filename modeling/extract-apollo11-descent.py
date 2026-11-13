"""Extract NASA/TM-20220007267 Figure 14 vector traces. Requires PyMuPDF."""
import hashlib
import json
import sys
from pathlib import Path

import pymupdf


def extract(pdf):
    # PDF page 30, printed page 26. The graph is rotated on the page.
    with pymupdf.open(pdf) as document:
        traces = [path for path in document[29].get_drawings()
                  if len(path['items']) > 100 and path['color']
                  and path['color'][0] == 0 and .44 < path['color'][1] < .46]
    assert len(traces) == 27, 'Unexpected Figure 14 vector layout'
    samples = []
    # Altitude, vertical rate, downrange, downrange rate and pitch. Coordinates
    # come from labelled grid lines, including the zero line in each plot.
    for chart, zero, points_per_unit, time_zero in [
        (1, 194.105, (194.105 - 106.574) / 400, 435.844),
        (4, 248.087, (321.906 - 223.459) / 20, 435.844),
        (0, 161.289, (194.105 - 95.657) / 3000, 659.490),
        (3, 223.459, (321.906 - 223.459) / 50, 659.490),
        (2, 174.402, (174.402 - 95.657) / 20, 212.198),
    ]:
        values = {}
        for path in traces[3 * chart:3 * chart + 3]:
            for kind, start, end in path['items']:
                assert kind == 'l'
                for point in (start, end):
                    index = round((time_zero - point.y) / (138.912 / 700))
                    values[index] = round((zero - point.x) / points_per_unit, 2)
        samples.append(values)

    # Preserve a visible gap in the published vertical-rate trace as null.
    count = max(samples[0]) + 1
    return {
        'source': 'https://ntrs.nasa.gov/citations/20220007267',
        'pdfSha256': hashlib.sha256(Path(pdf).read_bytes()).hexdigest(),
        'figure': '14, printed page 26 (PDF page 30)',
        'sampleSeconds': 0.2,
        'columns': ['altitudeFt', 'verticalRateFtS', 'rangeFt', 'rangeRateFtS', 'pitchDeg'],
        'samples': [[column.get(i) for column in samples] for i in range(count)],
    }


if __name__ == '__main__':
    result = extract(sys.argv[1])
    Path(sys.argv[2]).write_text(json.dumps(result, separators=(',', ':')) + '\n')
