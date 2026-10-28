# AGC runtime and corresponding source

The unmodified `yaAGC.wasm` is the WebAssembly CPU emulator distributed by
[Michael Karl Franzl's webAGC](https://github.com/michaelfranzl/webAGC/tree/0575ea7a1231e3948bae7d2c22a6ac146da0c38d).
Its exported version is `2020-12-24 ddc65e7be`. SHA-256:
`a595f3ad3cc6833638b49879e2d41149a7327b1a10577828f50466d6c7747f14`.

The corresponding C implementation is Ronald S. Burkey's yaAGC with Michael Karl
Franzl's WebAssembly entry points, at commit
[`ddc65e7bed41f1301921b934fcbaaee93db99dda`](https://github.com/michaelfranzl/virtualagc/tree/ddc65e7bed41f1301921b934fcbaaee93db99dda).
The C files, headers and original build rules needed by the WASM target are
included in `source/`. The original root build files are prefixed `root-` to
distinguish them from `source/Makefile`, the original yaAGC-directory Makefile.

The original build invokes `make WASI=yes NVER="2020-12-24 ddc65e7be"` inside
the yaAGC source directory, using wasi-sdk at `/opt/wasi-sdk` (or the
`WASI_SDK_PATH` override), plus `wasm-opt` and `wasm-strip`. The retained
Makefile lists all flags and objects. The upstream prebuilt binary's exact
toolchain versions were not recorded here; byte-identical rebuilding is not
claimed. Platform SDK/compiler libraries are external build prerequisites.

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

The new browser adapter replaces the upstream webAGC dependency on general
WASI/filesystem packages with four bounded diagnostic WASI imports needed by
this exact binary. It neither implements AGC instructions nor substitutes
flight-program responses. The emulator exposes no filesystem or network to
the historical program. No ROM bytes, erasable memory or display registers
are patched to make the examples pass.
