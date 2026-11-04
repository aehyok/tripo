#!/usr/bin/env python3
"""Inspect local GLB exports without modifying them; standard-library only."""
import argparse
import hashlib
import json
import struct
from pathlib import Path


def image_size(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n') and len(data) >= 24:
        return list(struct.unpack_from('>II', data, 16))
    if data.startswith(b'\xff\xd8'):
        offset = 2
        sof = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
               0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
        while offset < len(data):
            if data[offset] != 0xFF:
                raise ValueError('Invalid JPEG marker')
            while offset < len(data) and data[offset] == 0xFF:
                offset += 1
            if offset >= len(data):
                break
            marker = data[offset]
            offset += 1
            if marker in (0xD9, 0xDA):
                break
            if marker == 0x01 or 0xD0 <= marker <= 0xD8:
                continue
            size = struct.unpack_from('>H', data, offset)[0]
            if size < 2 or offset + size > len(data):
                raise ValueError('JPEG segment exceeds image data')
            if marker in sof:
                height, width = struct.unpack_from('>HH', data, offset + 3)
                return [width, height]
            offset += size
    return None


def inspect(path):
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError('GLB is too short')
    magic, version, length = struct.unpack_from('<4sII', data)
    if (magic, version, length) != (b'glTF', 2, len(data)):
        raise ValueError('Invalid GLB magic, version or declared length')
    chunks, offset = [], 12
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError('Truncated chunk header')
        size, kind = struct.unpack_from('<I4s', data, offset)
        offset += 8
        if size % 4 or offset + size > len(data):
            raise ValueError('Unaligned or truncated GLB chunk')
        chunks.append((kind, data[offset:offset + size]))
        offset += size
    if not chunks or chunks[0][0] != b'JSON' or sum(t == b'JSON' for t, _ in chunks) != 1:
        raise ValueError('Expected exactly one leading JSON chunk')
    doc = json.loads(chunks[0][1])
    if doc.get('asset', {}).get('version') != '2.0':
        raise ValueError('Expected glTF asset version 2.0')
    bins = [payload for kind, payload in chunks if kind == b'BIN\x00']
    if len(bins) != 1:
        raise ValueError('Expected one embedded binary chunk')
    binary = bins[0]
    buffers = doc.get('buffers', [])
    if len(buffers) != 1 or 'uri' in buffers[0]:
        raise ValueError('Export must use one embedded buffer')
    buffer_length = buffers[0]['byteLength']
    if not 0 <= len(binary) - buffer_length <= 3:
        raise ValueError('Embedded buffer length does not match BIN chunk')
    views = doc.get('bufferViews', [])
    for view in views:
        start, size = view.get('byteOffset', 0), view['byteLength']
        if view.get('buffer', 0) != 0 or start < 0 or size < 0 or start + size > buffer_length:
            raise ValueError('bufferView is outside its embedded buffer')
    accessors = doc.get('accessors', [])
    components = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4,
              'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
    warnings = []
    for accessor in accessors:
        if 'sparse' in accessor:
            warnings.append('Sparse accessor payload not fully checked')
        if 'bufferView' not in accessor:
            continue
        view = views[accessor['bufferView']]
        component_size = components[accessor['componentType']]
        if accessor['type'] in ('MAT2', 'MAT3') and component_size < 4:
            warnings.append('Packed matrix accessor layout not checked')
            continue
        item_size = widths[accessor['type']] * component_size
        stride = view.get('byteStride', item_size)
        count, start = accessor['count'], accessor.get('byteOffset', 0)
        end = start + ((count - 1) * stride + item_size if count else 0)
        if count < 0 or start < 0 or stride < item_size or end > view['byteLength']:
            raise ValueError('Accessor exceeds its bufferView')
    triangles, weighted, modes = 0, 0, set()
    meshes = doc.get('meshes', [])
    for mesh in meshes:
        for primitive in mesh['primitives']:
            attributes = primitive['attributes']
            position = accessors[attributes['POSITION']]
            indices = accessors[primitive['indices']] if 'indices' in primitive else None
            if indices is not None and (indices['type'] != 'SCALAR' or indices['componentType'] not in (5121, 5123, 5125)):
                raise ValueError('Invalid index accessor type')
            count = indices['count'] if indices is not None else position['count']
            mode = primitive.get('mode', 4)
            modes.add(mode)
            if mode == 4:
                if count % 3:
                    raise ValueError('Triangle primitive count is not divisible by three')
                triangles += count // 3
            elif mode in (5, 6):
                triangles += max(0, count - 2)
            weighted += int('JOINTS_0' in attributes and 'WEIGHTS_0' in attributes)
    if not meshes or triangles == 0:
        raise ValueError('No triangle mesh found')
    images = []
    for image in doc.get('images', []):
        if 'bufferView' not in image:
            raise ValueError('Image is external or not embedded in a bufferView')
        view = views[image['bufferView']]
        start = view.get('byteOffset', 0)
        dimensions = image_size(binary[start:start + view['byteLength']])
        if dimensions is None:
            warnings.append('Image dimensions unsupported; inspect this format separately')
        images.append({'name': image.get('name'), 'mimeType': image.get('mimeType'), 'size': dimensions})
    skins = doc.get('skins', [])
    for skin in skins:
        if any(not 0 <= joint < len(doc.get('nodes', [])) for joint in skin['joints']):
            raise ValueError('Skin references an invalid node')
    return {'file': str(path.resolve()), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(), 'triangles': triangles,
            'primitive_modes': sorted(modes), 'meshes': len(meshes),
            'materials': len(doc.get('materials', [])), 'embedded_images': images,
            'skins': len(skins), 'joint_count': sum(len(s['joints']) for s in skins),
            'weighted_primitives': weighted,
            'skinned_nodes': sum('skin' in n and 'mesh' in n for n in doc.get('nodes', [])),
            'animations': [a.get('name', f'unnamed_{i}') for i, a in enumerate(doc.get('animations', []))],
            'warnings': sorted(set(warnings)), 'errors': []}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--expect-texture', type=int)
    parser.add_argument('--max-triangles', type=int)
    parser.add_argument('--require-rig', action='store_true')
    parser.add_argument('--require-animation', action='append', default=[])
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    reports = []
    for path in args.files:
        try:
            report = inspect(path)
            if args.expect_texture and (not report['embedded_images'] or any(
                    image['size'] != [args.expect_texture] * 2 for image in report['embedded_images'])):
                report['errors'].append('Missing images or unexpected texture dimensions')
            if args.max_triangles and report['triangles'] > args.max_triangles:
                report['warnings'].append(f'Triangle budget exceeded: {report["triangles"]} > {args.max_triangles}')
            if args.require_rig and not (report['skins'] and report['joint_count'] and
                                        report['weighted_primitives'] and report['skinned_nodes']):
                report['errors'].append('Missing skin, joints, weights or skinned mesh node')
            for name in args.require_animation:
                if name not in report['animations']:
                    report['errors'].append(f'Missing required animation: {name}')
        except (OSError, ValueError, KeyError, IndexError, TypeError, struct.error) as exc:
            report = {'file': str(path.resolve()), 'errors': [str(exc)], 'warnings': []}
        reports.append(report)
    rendered = json.dumps(reports, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(rendered, encoding='utf-8')
    print(rendered, end='')
    return int(any(report['errors'] for report in reports))


if __name__ == '__main__':
    raise SystemExit(main())
