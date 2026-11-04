"""Keep the archived cactus shape and paint; close its seams, replace the bled soil, rebake one clean 1K atlas."""
import bpy,bmesh,json,hashlib,math,struct
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];O=R/'public/assets/models';V=R/'assets/models/review';RAW=R/'assets/models/raw/cactus_tripo.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(RAW))
cactus=next(o for o in bpy.context.scene.objects if o.type=='MESH');cactus.name='cactus';scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
bpy.context.view_layer.objects.active=cactus;cactus.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
raw_height=max(v.co.z for v in cactus.data.vertices)

# Raw seams are near-coincident vertices: a 1 mm weld closes the trunk crack and most of the soil ring.
bm=bmesh.new();bm.from_mesh(cactus.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.001);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.0001)
# The welded crack leaves a faceless wire strand.
wire=[e for e in bm.edges if not e.link_faces];bmesh.ops.delete(bm,geom=wire,context='EDGES')
loose=[v for v in bm.verts if not v.link_faces];bmesh.ops.delete(bm,geom=loose,context='VERTS')
# The soil-junction pinhole is a bow-tie that holes_fill cannot cap; collapse it only when it is truly tiny.
pin=list({v for e in bm.edges if e.is_boundary for v in e.verts});pin_span=max(((a.co-b.co).length for a in pin for b in pin),default=0);assert pin_span<.003,pin_span
if pin:bmesh.ops.pointmerge(bm,verts=pin,merge_co=sum((v.co for v in pin),Vector())/len(pin));bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.0001)
bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
# Up-facing faces inside the rim at soil level carry green and spine-dot bleed in the raw atlas.
soil_faces=[f for f in bm.faces if f.normal.z>.7 and .39<f.calc_center_median().z<.425 and math.hypot(*f.calc_center_median().xy)<.229]
for f in soil_faces:f.material_index=1
bm.to_mesh(cactus.data);bm.free()
patched={'weld_mm':1,'removed_wire_edges':len(wire),'removed_loose_vertices':len(loose),'collapsed_pinhole_vertices':len(pin),'pinhole_span_mm':round(pin_span*1000,2),'soil_faces':len(soil_faces)}

# Uniform metric scale: total height 1.1 m, bottom Z=0, horizontal bounding-box centre at the origin.
s=1.1/raw_height;cactus.scale=(s,s,s);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
vs=[v.co for v in cactus.data.vertices];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
cactus.location=(-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2]);bpy.ops.object.transform_apply(location=True,rotation=False,scale=False)
with bpy.context.temp_override(object=cactus,active_object=cactus,selected_objects=[cactus],selected_editable_objects=[cactus]):
 bpy.ops.mesh.customdata_custom_splitnormals_clear();bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))

source=cactus.data.materials[0];soil=bpy.data.materials.new('soil');soil.use_nodes=True;ns=soil.node_tree.nodes;ls=soil.node_tree.links;b=ns.get('Principled BSDF')
noise=ns.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=60;ramp=ns.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.075,.035,.018,1);ramp.color_ramp.elements[1].color=(.16,.08,.04,1)
ls.new(noise.outputs['Fac'],ramp.inputs['Fac']);ls.new(ramp.outputs['Color'],b.inputs['Base Color']);b.inputs['Roughness'].default_value=1;cactus.data.materials.append(soil)
source_uv=cactus.data.uv_layers.active;source_uv.name='SourceUV'
for n in list(source.node_tree.nodes):
 if n.type=='TEX_IMAGE' and not n.inputs['Vector'].is_linked:
  u=source.node_tree.nodes.new('ShaderNodeUVMap');u.uv_map='SourceUV';source.node_tree.links.new(u.outputs[0],n.inputs['Vector'])
atlas=cactus.data.uv_layers.new(name='AtlasUV');cactus.data.uv_layers.active=atlas;atlas.active_render=True
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
scene.render.engine='CYCLES';scene.cycles.samples=8;images={}
for channel,typ in [('basecolor','DIFFUSE'),('normal','NORMAL'),('roughness','ROUGHNESS')]:
 image=bpy.data.images.new('cactus_'+channel,width=1024,height=1024,alpha=False);image.colorspace_settings.name='sRGB' if channel=='basecolor' else 'Non-Color'
 for m in cactus.data.materials:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image;m.node_tree.nodes.active=t
 bpy.ops.object.bake(type=typ,pass_filter={'COLOR'} if typ=='DIFFUSE' else set(),use_selected_to_active=False,margin=12);image.pack();images[channel]=image
final=bpy.data.materials.new('cactus_1K_PBR');final.use_nodes=True;ns=final.node_tree.nodes;ls=final.node_tree.links;b=ns.get('Principled BSDF');b.inputs['Metallic'].default_value=0
for channel,img in images.items():
 node=ns.new('ShaderNodeTexImage');node.image=img
 if channel=='normal':nm=ns.new('ShaderNodeNormalMap');ls.new(node.outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs[0],b.inputs['Normal'])
 else:ls.new(node.outputs['Color'],b.inputs['Base Color' if channel=='basecolor' else 'Roughness'])
cactus.data.materials.clear();cactus.data.materials.append(final)
for p in cactus.data.polygons:p.material_index=0
cactus.data.uv_layers.remove(cactus.data.uv_layers.get('SourceUV'));cactus.data.uv_layers.active=cactus.data.uv_layers.get('AtlasUV')

bm=bmesh.new();bm.from_mesh(cactus.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
audit={'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_faces for v in bm.verts)};bm.free()
vs=[v.co for v in cactus.data.vertices];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
# The pot outline is the widest ring below the soil; the side branches are wider but higher up.
pot_radius=max(math.hypot(v.x,v.y) for v in vs if v.z<.45)
OUT=O/'cactus.glb';bpy.ops.object.select_all(action='DESELECT');cactus.select_set(True);bpy.context.view_layer.objects.active=cactus
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
data=OUT.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]);tri=sum(g['accessors'][p['indices']]['count']//3 for mesh in g['meshes'] for p in mesh['primitives']);assert tri<=1000,tri
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'assets/models/blender/cactus.blend'))
sha=lambda b:hashlib.sha256(b).hexdigest()
report={'asset':'盆栽仙人掌','date':'2026-11-04','stage':'Blender修整与Cesium接入','source':'../raw/cactus_tripo.glb','source_sha256':sha(RAW.read_bytes()),'file':'../../../public/assets/models/cactus.glb','bytes':len(data),'sha256':sha(data),'triangles':tri,'raw_triangles':978,'triangle_budget':1000,
 'dimensions_m':[round(b-a,4) for a,b in zip(lo,hi)],'uniform_scale':round(s,5),'pot_outer_radius_m':round(pot_radius,4),'origin':'水平包围盒中心、盆底Z=0','front_blender':'-Y','patch':patched,'mesh_audit':audit,
 'operations':['保留Tripo造型与仙人掌/花盆手绘贴图，1毫米焊接合上主干前侧裂缝与盆土交接缝，删除焊接残留悬空边，2.5毫米针孔合并到中心','盆口内朝上的盆土面改为程序深棕土色，去掉绿色溢色与黄点拖影','等比缩放至总高1.1米，清除导入自定义法线后按50度分平滑/硬边','重新展UV并烘焙1K颜色/法线/粗糙度，12像素边距；全哑光、金属度0'],
 'new_tripo_credits':0,'limitations':['按总高1.1米等比缩放，花盆直径与侧枝宽度超出表格0.5米包络','仙人掌表皮少量刺点在原UV岛边缘有轻微拉长，未逐点重绘','全量与真实移动设备性能待验收'],'previews':[]}
scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.world.color=(.28,.28,.28);scene.view_settings.view_transform='AgX';scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100
center=Vector((0,0,.55))
for loc,power in [((3,-4,6),300),((-4,-1,4),220),((0,4,5),260),((0,-2,-4),100)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=4;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=1.3;scene.camera=cam
for name,d in [('front',(0,-1,0)),('back',(0,1,0)),('left',(-1,0,0)),('right',(1,0,0)),('top',(0,0,1)),('bottom',(0,0,-1)),('quarter',(.7,-1,.45))]:
 cam.location=center+Vector(d).normalized()*6;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();p=V/f'cactus-final-{name}.png';scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);report['previews'].append(p.name)
(V/'cactus.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('CACTUS_COMPLETE',json.dumps(report,ensure_ascii=False))
