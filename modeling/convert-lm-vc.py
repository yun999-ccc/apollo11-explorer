"""Convert the pinned NASSP MSHX1 virtual cockpit to web glTF.

The source coordinate transform is (x, y, -z), in metres. Named moving
mesh groups stay separate and retain their source index. Static triangles
are batched by material. Geometry, texture coordinates and pivots come
from the source, independently of the old two-dimensional panel.
"""
import argparse
from array import array
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import struct

from PIL import Image

COMMIT = "a4ed25511e626823f9c83b457cf9371375b82094"
VC_BASE = "Orbitersdk/samples/ProjectApollo/src_lm/"
KEYS = dict(zip(
    "Verb Noun Plus Minus Zero One Two Three Four Five Six Seven Eight Nine Clear Proceed KeyRel Enter Reset".split(),
    "VERB NOUN + − 0 1 2 3 4 5 6 7 8 9 CLR PRO KEY_REL ENTR RSET".split(),
))


def file_sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reflected(values):
    x, y, z = values
    return [x, y, -z]


def read_controls(source, resources, panel):
    ids = dict(re.findall(r"(?m)^#define (VC_GRP_\w+)\s+(\d+)\s*$", resources))
    arrays = {}
    for name, block in re.findall(r"const VECTOR3\s+(\w+)\[\w+\]\s*=\s*\{(.*?)\n\};", source, re.S):
        arrays[name] = [list(map(float, row.split(","))) for row in re.findall(r"\{([^}]+)\}", block)]
    fixed = {"LeftMasterAlarmSwitch": "VC_GRP_MasterAlarm1", "RightMasterAlarmSwitch": "VC_GRP_MasterAlarm2"}
    mapping = {}
    for name, kind in [(c["id"], c["kind"]) for c in panel] + [("DskySwitch" + k, "key") for k in KEYS]:
        group = re.search(r"(?m)^\s*" + name + r"\.DefineMeshGroup\((VC_GRP_\w+)", source)
        group_id = int(ids[group[1] if group else fixed[name]])
        ref = re.search(r"(?m)^\s*" + name + r"\.SetReference\((\w+)\[(\d+)\]", source)
        result = {"group": group_id, "kind": kind, "name": name}
        if ref:
            result["pivot"] = reflected(arrays[ref[1]][int(ref[2])])
        if kind == "rotary":
            tilt = 7.95581
            from math import cos, radians, sin
            result["axis"] = [0, -sin(radians(tilt)), -cos(radians(tilt))]
        elif kind in {"two", "three"}:
            result["axis"] = [-1, 0, 0]
        if kind == "key":
            result["key"] = KEYS[name.removeprefix("DskySwitch")].replace("_", " ")
        line_offset = group.start(1) if group else source.index(name + ".SetReference")
        result["line"] = source.count("\n", 0, line_offset) + 1
        mapping[group_id] = result
    assert len(mapping) == len(panel) + len(KEYS), "control groups must be unique"
    return mapping


def load_source(root):
    path = root / "LM_VC.msh"
    lines = path.read_text().splitlines()
    cursor = iter(lines)
    assert next(cursor) == "MSHX1"
    group_count = int(next(cursor).split()[1])
    groups = []
    for group_id in range(group_count):
        label = next(cursor).split(maxsplit=1)[1]
        mat = int(next(cursor).split()[1])
        tex = int(next(cursor).split()[1])
        assert next(cursor) == "FLAG 0"
        nv, nf = map(int, next(cursor).split()[1:3])
        verts = [tuple(map(float, next(cursor).split())) for _ in range(nv)]
        faces = [tuple(map(int, next(cursor).split())) for _ in range(nf)]
        assert all(len(row) in {3, 6, 8} for row in verts), label
        verts = [(*row, 0, 1, 0, 0, 0) if len(row) == 3 else
                 (*row, 0, 0) if len(row) == 6 else row for row in verts]
        assert all(len(row) == 3 and min(row) >= 0 and max(row) < nv for row in faces)
        groups.append((group_id, label, mat, tex, verts, faces))
    material_count = int(next(cursor).split()[1])
    names = [next(cursor) for _ in range(material_count)]
    materials = []
    for name in names:
        assert next(cursor) == "MATERIAL " + name
        rgba = list(map(float, next(cursor).split()))
        next(cursor)
        next(cursor)
        next(cursor)
        materials.append((name, rgba))
    texture_count = int(next(cursor).split()[1])
    textures = [next(cursor).replace("\\", "/") for _ in range(texture_count)]
    return groups, materials, textures


class Gltf:
    def __init__(self):
        self.data = {
            "asset": {"version": "2.0", "generator": "NASSP virtual cockpit converter"},
            "extensionsUsed": ["KHR_materials_unlit", "EXT_texture_webp"],
            "extensionsRequired": ["EXT_texture_webp"],
            "scene": 0, "scenes": [{"nodes": []}], "nodes": [], "meshes": [],
            "bufferViews": [], "accessors": [], "materials": [], "images": [], "textures": [],
            "samplers": [{"wrapS": 10497, "wrapT": 10497, "magFilter": 9729, "minFilter": 9987}],
        }
        self.bin = bytearray()
        self.mat_ids = {}

    def buffer_view(self, raw, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        entry = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(raw)}
        if target is not None:
            entry["target"] = target
        self.data["bufferViews"].append(entry)
        self.bin.extend(raw)
        return len(self.data["bufferViews"]) - 1

    def accessor(self, values, shape, size, component, target, bounds=None):
        assert values.itemsize == 4
        entry = {"bufferView": self.buffer_view(values.tobytes(), target), "componentType": component,
                 "count": len(values) // size, "type": shape}
        if bounds:
            entry.update(min=bounds[0], max=bounds[1])
        self.data["accessors"].append(entry)
        return len(self.data["accessors"]) - 1

    def material(self, name, color, texture, mask):
        key = (tuple(color), texture, mask)
        if key in self.mat_ids:
            return self.mat_ids[key]
        pbr = {"baseColorFactor": color, "metallicFactor": 0, "roughnessFactor": 1}
        entry = {"name": name, "pbrMetallicRoughness": pbr,
                 "extensions": {"KHR_materials_unlit": {}}, "doubleSided": True}
        if texture:
            pbr["baseColorTexture"] = {"index": texture - 1}
            entry["extras"] = {"sourceTexture": texture}
        if color[3] < 0.99:
            entry["alphaMode"] = "BLEND"
        elif mask:
            entry.update(alphaMode="MASK", alphaCutoff=0.4)
        index = len(self.data["materials"])
        self.data["materials"].append(entry)
        self.mat_ids[key] = index
        return index

    def add_mesh(self, name, material, groups, extra, pivot):
        position, normal, uv, indices = array("f"), array("f"), array("f"), array("I")
        low, high = [float("inf")] * 3, [float("-inf")] * 3
        for _, _, _, _, vertices, faces in groups:
            first = len(position) // 3
            for x, y, z, nx, ny, nz, u, v in vertices:
                point = [x - pivot[0], y - pivot[1], -z - pivot[2]]
                for i, value in enumerate(point):
                    low[i], high[i] = min(low[i], value), max(high[i], value)
                position.extend(point)
                normal.extend((nx, ny, -nz))
                uv.extend((u, v))
            for a, b, c in faces:
                indices.extend((first + a, first + c, first + b))
        primitive = {
            "material": material, "indices": self.accessor(indices, "SCALAR", 1, 5125, 34963),
            "attributes": {
                "POSITION": self.accessor(position, "VEC3", 3, 5126, 34962, (low, high)),
                "NORMAL": self.accessor(normal, "VEC3", 3, 5126, 34962),
                "TEXCOORD_0": self.accessor(uv, "VEC2", 2, 5126, 34962),
            },
        }
        self.data["meshes"].append({"name": name, "primitives": [primitive]})
        index = len(self.data["nodes"])
        node = {"name": name, "mesh": len(self.data["meshes"]) - 1, "extras": extra}
        if any(pivot):
            node["translation"] = pivot
        self.data["nodes"].append(node)
        self.data["scenes"][0]["nodes"].append(index)

    def write(self, path):
        self.data["buffers"] = [{"byteLength": len(self.bin)}]
        doc = json.dumps(self.data, separators=(",", ":")).encode()
        doc += b" " * (-len(doc) % 4)
        total = 12 + 8 + len(doc) + 8 + len(self.bin)
        with path.open("wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", compresslevel=6, mtime=0, filename="") as out:
            out.write(struct.pack("<4sII", b"glTF", 2, total))
            out.write(struct.pack("<I4s", len(doc), b"JSON"))
            out.write(doc)
            out.write(struct.pack("<I4s", len(self.bin), b"BIN\0"))
            out.write(self.bin)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source, out = args.source, args.output
    out.mkdir(parents=True, exist_ok=True)
    groups, materials, texture_paths = load_source(source)
    vc_path, resource_path = source / "lemvc.cpp", source / "LM_VC_Resource.h"
    panel_path = Path(__file__).resolve().parents[1] / "landing/nassp/controls/controls.json"
    controls = read_controls(vc_path.read_text(), resource_path.read_text(), json.loads(panel_path.read_text())["controls"])
    gltf = Gltf()
    texture_manifest = []
    alpha = {0: False}
    for idx, rel in enumerate(texture_paths, 1):
        input_path = source / "Textures" / rel
        image = Image.open(input_path).convert("RGBA")
        alpha[idx] = image.getchannel("A").getextrema()[0] < 255
        if not alpha[idx]:
            image = image.convert("RGB")
        high_res = input_path.stem in {"LMVC", "LMVC_2"}
        if not high_res:
            image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        encoded = io.BytesIO()
        image.save(encoded, format="WEBP", lossless=high_res, quality=90, method=4)
        webp = encoded.getvalue()
        view = gltf.buffer_view(webp)
        gltf.data["images"].append({"bufferView": view, "mimeType": "image/webp", "name": input_path.stem})
        gltf.data["textures"].append({"sampler": 0, "extensions": {"EXT_texture_webp": {"source": idx - 1}}})
        texture_manifest.append({"source": "Textures/" + rel, "sha256": file_sha(input_path),
                                 "imageIndex": idx - 1, "webSha256": hashlib.sha256(webp).hexdigest(),
                                 "size": list(image.size), "lossless": high_res})
    buckets = {}
    optional = {"COAS_1", "COAS_2", "COAS_1ovhd", "COAS_2ovhd", "COAS_Reticle",
                "COAS_Reticleovhd", "zzzCOAS_Glass", "zzzCOAS_Glassovhd"}
    for group in groups:
        group_id, label, mat, texture, verts, faces = group
        name, color = materials[mat - 1] if mat else ("Default", [1, 1, 1, 1])
        material = gltf.material(name, color, texture, alpha[texture])
        is_named = group_id in controls or label in optional or label in {
            "LPD", "Panel4_DSKY", "Windows", "WindowsInner", "WindowsRim", "UpperHatch", "FwdHatch",
        }
        if is_named:
            extra = {"sourceGroup": group_id}
            if group_id in controls:
                extra["control"] = controls[group_id]
            if label in optional:
                extra["optionalSight"] = True
            if label == "LPD":
                extra["landingReticle"] = True
            gltf.add_mesh(label, material, [group], extra, controls.get(group_id, {}).get("pivot", [0, 0, 0]))
        else:
            buckets.setdefault(material, []).append(group)
    for material, batch in buckets.items():
        gltf.add_mesh(f"Cabin surfaces {material}", material, batch,
                      {"sourceGroups": [g[0] for g in batch]}, [0, 0, 0])
    mesh_file = out / "LM_VC.glb.gz"
    gltf.write(mesh_file)
    manifest = {
        "upstream": "orbiternassp/NASSP", "commit": COMMIT, "license": "../Project Apollo License.txt",
        "mesh": {"source": "Meshes/ProjectApollo/LM_VC.msh", "sha256": file_sha(source / "LM_VC.msh"),
                 "web": mesh_file.name, "webSha256": file_sha(mesh_file), "groups": len(groups),
                 "vertices": sum(len(g[4]) for g in groups), "triangles": sum(len(g[5]) for g in groups),
                 "drawBatches": len(gltf.data["meshes"]), "coordinateTransform": [1, 1, -1]},
        "textures": texture_manifest, "controls": list(controls.values()),
        "sourceFiles": [VC_BASE + vc_path.name, VC_BASE + resource_path.name, VC_BASE + "lemmesh.cpp", VC_BASE + "LEM.h"],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(groups)} original groups, {manifest['mesh']['triangles']:,} triangles, "
          f"{len(controls)} bound controls, {len(gltf.data['meshes'])} draw batches")


if __name__ == "__main__":
    main()
