# AGC runtime and corresponding source

The `yaAGC.wasm` binary is built from the included sources. It keeps the
flight ROMs intact and adds two LM interfaces to
[Michael Karl Franzl's webAGC](https://github.com/michaelfranzl/webAGC/tree/0575ea7a1231e3948bae7d2c22a6ac146da0c38d).
Channel 016 raises KEYRUPT2 on a switch press. Channel 014 bit 4 gates the
transfer of thrust pulses from register 055 to output channel 0142. These
interfaces follow [Project Apollo NASSP](https://github.com/orbiternassp/NASSP/tree/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo).
The exported base version is `2020-12-24 ddc65e7be`. Binary SHA-256:
`f901c3ab7a9a162ce56e76f221b4db1ef85bdbdf93f8136b98727bea47b9dbc3`.

The corresponding C implementation is Ronald S. Burkey's yaAGC with Michael Karl
Franzl's WebAssembly entry points, at commit
[`ddc65e7bed41f1301921b934fcbaaee93db99dda`](https://github.com/michaelfranzl/virtualagc/tree/ddc65e7bed41f1301921b934fcbaaee93db99dda).
The C files, headers and original build rules needed by the WASM target are
included in `source/`. The original root build files are prefixed `root-` to
distinguish them from `source/Makefile`, the original yaAGC-directory Makefile.

To rebuild the current binary, use [WASI SDK 27.0](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-27).

```sh
sh vendor/agc/build-wasm.sh /path/to/wasi-sdk-27.0 vendor/agc/yaAGC.wasm
```

This runtime and its C source are GPL-2.0-or-later. Preserve `COPYING`, the
copyright notices and original source. `console/` is also distributed under
GPL-2.0-or-later, with its license in `console/LICENSE`. The exterior viewer is
a separate page and retains its existing licensing status.

`source/webDSKY.js`, `source/webDSKY-digit.svg` and
`source/webDSKY-sign.svg` preserve the reference decoder and glyph paths from
Michael Karl Franzl's **webDSKY 1.1.4**, distributed under GPL-2.0-or-later.
The published npm tarball SHA-1 is
`cf23daf630b57a6f5fd7e4eacc6afc5e14513d6d`.
Only the numeric glyph paths and checked relay mapping are reused in the
console. **The Apollo 16 photo backgrounds from that package are not used.**
The console's key locations, legends and CM/LM indicator differences are
traced separately to the original drawings listed in
[`assets/agc/provenance.json`](../../assets/agc/provenance.json).

The two historical flight-program images are from webAGC's `demo/agc/` at
commit `0575ea7a1231e3948bae7d2c22a6ac146da0c38d`. Its own build provenance
identifies Virtual AGC program-source commit
[`92a74ef1c88aede2e4ba0a86c6585c9ea911226d`](https://github.com/virtualagc/virtualagc/tree/92a74ef1c88aede2e4ba0a86c6585c9ea911226d).
The complete Comanche055 and Luminary099 source directories from that commit
are included in `assets/agc/flight-source.zip`, without rewriting the source.
Program/ROM SHA-256 values are checked before execution in `console/agc-core.mjs`.

The browser adapter replaces the upstream webAGC dependency on general
WASI/filesystem packages with bounded WASI imports. The ROM produces the
flight-program responses. The emulator has no filesystem or network access.
The standalone validation fixture for thrust pulses starts at a documented
ROM routine. The interactive console and landing page boot normally.
