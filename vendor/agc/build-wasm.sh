#!/bin/sh
set -eu

sdk=${1:?Usage: sh build-wasm.sh /path/to/wasi-sdk-27.0 output.wasm}
output=${2:?Usage: sh build-wasm.sh /path/to/wasi-sdk-27.0 output.wasm}
source=$(CDPATH= cd -- "$(dirname -- "$0")/source" && pwd)
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT

for unit in wasm agc_engine agc_engine_init agc_utilities ringbuffer_api ringbuffer version; do
  "$sdk/bin/clang" -I "$source" -DWASI=yes -DNVER='"2020-12-24 ddc65e7be"' \
    -O3 -flto -c "$source/$unit.c" -o "$build/$unit.o"
done

"$sdk/bin/wasm-ld" --no-entry --export-dynamic \
  -L "$sdk/share/wasi-sysroot/lib/wasm32-wasi" -lc \
  --export=malloc --export=free --import-memory --lto-O3 --strip-all \
  -o "$output" "$build"/*.o
