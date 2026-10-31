#!/usr/bin/env bash
set -euo pipefail

atlas_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
atlas_size="${1:-1024}"
atlas_output="${2:-${atlas_root}/build}"
mkdir -p "${atlas_output}"

blender -b -t 4 --python-exit-code 1 --python "${atlas_root}/01_bake.py" -- "${atlas_root}/assets" "${atlas_output}" "${atlas_size}"
blender -b -t 2 --python-exit-code 1 --python "${atlas_root}/02_uv_regions.py" -- "${atlas_root}/assets" "${atlas_output}"
python3 "${atlas_root}/03_process.py" --out-dir "${atlas_output}" --size "${atlas_size}"
python3 "${atlas_root}/04_verify.py" --asset-dir "${atlas_root}/assets" --out-dir "${atlas_output}" --size "${atlas_size}"
