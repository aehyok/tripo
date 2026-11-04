"""Prepare the existing Tripo dog in an isolated Blender process; keep raw intact.
Run: Blender --background --factory-startup --python scripts/prepare_dog.py
"""
import bpy
import bmesh
import hashlib
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'assets/models/raw/dog_jina_tripo.glb'
OUT = ROOT / 'public/assets/models/dog_jina.glb'
REVIEW = ROOT / 'assets/models/review'
BLEND = ROOT / 'assets/models/blender/dog_jina.blend'
for folder in [OUT.parent, REVIEW, BLEND.parent, ROOT/'public/assets/ui']:
    folder.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(RAW))
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
meshes = [o for o in scene.objects if o.type == 'MESH']
assert len(meshes) == 1, 'Inspect multi-mesh input before processing'
dog = meshes[0]
bpy.context.view_layer.objects.active = dog
bpy.ops.object.select_all(action='DESELECT')
dog.select_set(True)
dog.name = 'dog_jina'
raw_triangles = sum(len(p.vertices)-2 for p in dog.data.polygons)
# Input already faces Blender -Y, verified in the source six-view render.
# Use the manual's bounding-box dimensions; shoulder height is not measured here.
dog.dimensions = (.35, .55, .5)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
source = dog.copy()
source.data = dog.data.copy()
source.name = 'bake_source'
scene.collection.objects.link(source)
source.select_set(False)
bm = bmesh.new()
bm.from_mesh(dog.data)
before_vertices = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0001)
bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=.00001)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
merged_vertices = before_vertices - len(bm.verts)
# Keep UV island borders and their immediate neighbours stable during collapse.
uv = bm.loops.layers.uv.active
protected = set()
if uv:
    for edge in bm.edges:
        if len(edge.link_faces) != 2:
            continue
        for vert in edge.verts:
            coords = [next(l[uv].uv.copy() for l in f.loops if l.vert == vert)
                      for f in edge.link_faces]
            if (coords[0] - coords[1]).length > 1e-6:
                protected.update(edge.verts)
    protected |= {e.other_vert(v) for v in list(protected) for e in v.link_edges}
bm.verts.index_update()
protected_indices = [v.index for v in protected]
bm.to_mesh(dog.data)
bm.free()
group = dog.vertex_groups.new(name='Decimate_away_from_UV_borders')
group.add(list(range(len(dog.data.vertices))), 1.0, 'REPLACE')
if protected_indices:
    group.add(protected_indices, 0.15, 'REPLACE')
mod = dog.modifiers.new('Budget_7500_triangles', 'DECIMATE')
mod.decimate_type = 'COLLAPSE'
mod.ratio = min(1, 7500 / raw_triangles)
mod.use_collapse_triangulate = True
mod.vertex_group = group.name
mod.vertex_group_factor = 1
bpy.ops.object.modifier_apply(modifier=mod.name)
# Reassert dimensions and put the geometry's base at the scene origin.
bpy.context.view_layer.update()
dog.dimensions = (.35, .55, .5)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
vertices = dog.data.vertices
lo = Vector(tuple(min(v.co[i] for v in vertices) for i in range(3)))
hi = Vector(tuple(max(v.co[i] for v in vertices) for i in range(3)))
offset = Vector((-(lo.x+hi.x)/2, -(lo.y+hi.y)/2, -lo.z))
for v in vertices:
    v.co += offset
for p in dog.data.polygons:
    p.use_smooth = True
dog.data.update()
dog.location = (0,0,0)
scene.cursor.location = (0,0,0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
triangles = sum(len(p.vertices)-2 for p in dog.data.polygons)
assert 5000 <= triangles <= 8000, triangles
bm=bmesh.new();bm.from_mesh(dog.data)
mesh_audit={'boundary_edges':sum(e.is_boundary for e in bm.edges),
            'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
            'loose_vertices':sum(not v.link_faces for v in bm.verts)}
bm.free()
# Bake all PBR channels from the untouched high-resolution surface onto a new
# padded UV atlas. Collapse alone can pull old island borders into other colours.
bpy.context.view_layer.objects.active = dog
bpy.ops.object.select_all(action='DESELECT')
dog.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.151917, island_margin=.02)
bpy.ops.object.mode_set(mode='OBJECT')
material = bpy.data.materials.new('jina_pbr_baked')
material.use_nodes = True
dog.data.materials.clear()
dog.data.materials.append(material)
nodes = material.node_tree.nodes
links = material.node_tree.links
bsdf = nodes.get('Principled BSDF')
scene.render.engine = 'CYCLES'
scene.cycles.samples = 8
source.select_set(True)
images = {}
for channel, bake_type in [('basecolor','DIFFUSE'),('normal','NORMAL'),('roughness','ROUGHNESS'),('metallic','EMIT')]:
    img = bpy.data.images.new('jina_'+channel, width=2048, height=2048, alpha=False)
    img.colorspace_settings.name = 'sRGB' if channel == 'basecolor' else 'Non-Color'
    node = nodes.new('ShaderNodeTexImage')
    node.image = img
    nodes.active = node
    images[channel] = node
    if channel == 'metallic':
        source.data.materials[0] = source.data.materials[0].copy()
        mat = source.data.materials[0]
        src_bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        output = next(n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')
        emission = mat.node_tree.nodes.new('ShaderNodeEmission')
        metal = src_bsdf.inputs['Metallic']
        if metal.is_linked:
            mat.node_tree.links.new(metal.links[0].from_socket, emission.inputs['Color'])
        else:
            emission.inputs['Color'].default_value = (metal.default_value,)*3+(1,)
        mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    bpy.ops.object.bake(type=bake_type, pass_filter={'COLOR'} if bake_type == 'DIFFUSE' else set(),
        use_selected_to_active=True, cage_extrusion=.008, max_ray_distance=.03, margin=16)
    img.pack()
links.new(images['basecolor'].outputs['Color'], bsdf.inputs['Base Color'])
links.new(images['roughness'].outputs['Color'], bsdf.inputs['Roughness'])
links.new(images['metallic'].outputs['Color'], bsdf.inputs['Metallic'])
normal = nodes.new('ShaderNodeNormalMap')
links.new(images['normal'].outputs['Color'], normal.inputs['Color'])
links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
bpy.data.objects.remove(source, do_unlink=True)
dog.select_set(True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB',
    use_selection=True, export_yup=True, export_apply=True,
    export_texcoords=True, export_normals=True, export_tangents=True,
    export_materials='EXPORT', export_animations=False,
    export_cameras=False, export_lights=False, export_extras=False,
    export_draco_mesh_compression_enable=False)
report={'asset':'吉拿','date':'2026-11-04','stage':'Blender修整与游戏接入',
        'source':'../raw/dog_jina_tripo.glb',
        'source_sha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),
        'blend':'../blender/dog_jina.blend','file':'../../../public/assets/models/dog_jina.glb',
        'raw_triangles':raw_triangles,'triangles':triangles,'merged_vertices':merged_vertices,
        'dimensions_m':[.35,.55,.5],'dimension_note':'按手册表格的包围盒宽深高校正；未将0.5米称为实测肩高',
        'front_blender':'-Y','origin':'水平包围盒中心、最低点Z=0','mesh_audit':mesh_audit,
        'operations':['米制尺寸','合并0.0001米内重复点','退化边清理','重算法线','Decimate减面','应用变换','脚底原点','从原始高模重新烘焙2K颜色、法线、粗糙度和金属度，16像素边距'],
        'pending':['四足绑定和动画未制作（本阶段静态吉拿）','未自动删除内部壳；保留造型并通过多角度渲染检查'],
        'previews':[]}
# Render the same exported geometry under neutral studio lighting.
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.world.color=(.18,.18,.18)
scene.view_settings.view_transform='AgX'
center=Vector((0,0,.25))
for loc,power,size in [((1,-1,2),65,2),((-1,-.4,1),40,2),((0,1,1.5),60,1.5)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add()
cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=.72;scene.camera=cam
for name,direction in [('front',(0,-1,0)),('back',(0,1,0)),('left',(-1,0,0)),('right',(1,0,0)),('threequarter',(.65,-1,.45)),('top',(0,0,1)),('bottom',(0,0,-1))]:
    cam.location=center+Vector(direction)*2
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    path=REVIEW/f'dog-final-{name}.png';scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    report['previews'].append(path.name)
# Target card from final mesh, 85mm perspective, transparent background.
cam.data.type='PERSP';cam.data.lens=85
cam.location=center+Vector((.65,-1,.30)).normalized()*1.6
cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_x=1024;scene.render.resolution_y=1024
scene.render.filepath=str(ROOT/'public/assets/ui/dog_card.png')
bpy.ops.render.render(write_still=True)
report['card']='../../../public/assets/ui/dog_card.png'
(REVIEW/'dog_jina.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('PREPARED_DOG',json.dumps(report,ensure_ascii=False))
