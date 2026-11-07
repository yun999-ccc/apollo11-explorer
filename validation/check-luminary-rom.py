"""Compare the packaged LM ROM against the published LMY99 octal listing."""
import hashlib
from pathlib import Path
import re
import struct
import zipfile


assets = Path(__file__).resolve().parents[1] / 'assets' / 'agc'
with zipfile.ZipFile(assets / 'flight-source.zip') as archive:
    source = archive.read('Luminary099/Luminary099.binsource').decode()

banks = {}
for raw_line in source.splitlines():
    line = raw_line.split(';', 1)[0].strip()
    if not line:
        continue
    header = re.match(r'BANK=([0-7]+)(?:,|$)', line)
    if header:
        bank = int(header[1], 8)
        assert bank not in banks
        banks[bank] = []
        continue
    assert re.fullmatch(r'(?:[0-7]{5}|@)(?:\s+(?:[0-7]{5}|@))*', line), line
    banks[bank].extend(0 if word == '@' else int(word, 8) for word in line.split())

order = [2, 3, 0, 1, *range(4, 36)]
assert set(banks) == set(order)
assert all(len(words) == 1024 for words in banks.values())
rom = (assets / 'Luminary099.bin').read_bytes()
assert len(rom) == 2 * 36 * 1024
actual = (word >> 1 for (word,) in struct.iter_unpack('>H', rom))
for bank in order:
    for address, expected in enumerate(banks[bank], start=0o2000):
        assert next(actual) == expected, f'ROM differs at {bank:02o},{address:04o}'

print(f'LMY99 revision 001: 36 banks, 36,864 matching 15-bit words')
print(f'SHA-256 {hashlib.sha256(rom).hexdigest()}')
