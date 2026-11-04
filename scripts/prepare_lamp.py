"""Keep the archived lamp; weld seams, scale to 3.2 m and light the frosted panes with a pixel mask."""
import bpy,bmesh,json,hashlib,math,struct
import numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];O=R/'public/assets/models';V=R/'assets/models/review';RAW=R/'assets/models/raw/lamp_tripo.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(RAW))
lamp=next(o for o in bpy.context.scene.objects if o.type=='MESH');lamp.name='lamp';scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
bpy.context.view_layer.objects.active=lamp;lamp.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)

# The raw export splits every UV seam; welding closes the shell without changing the silhouette.
bm=bmesh.new();bm.from_mesh(lamp.data);before=len(bm.verts);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));welded=before-len(bm.verts);bm.to_mesh(lamp.data);bm.free()
raw_height=max(v.co.z for v in lamp.data.vertices);s=3.2/raw_height;lamp.scale=(s,s,s);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
vs=[v.co for v in lamp.data.vertices];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
lamp.location=(-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2]);bpy.ops.object.transform_apply(location=True,rotation=False,scale=False)
with bpy.context.temp_override(object=lamp,active_object=lamp,selected_objects=[lamp],selected_editable_objects=[lamp]):
 bpy.ops.mesh.customdata_custom_splitnormals_clear();bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))

# Frosted panes are the only near-white, unsaturated texels; tint them #FFC46B as the emissive map.
mat=lamp.data.materials[0];mat.name='lamp_iron_glass';ns=mat.node_tree.nodes;ls=mat.node_tree.links;bs=next(n for n in ns if n.type=='BSDF_PRINCIPLED')
base=bs.inputs['Base Color'].links[0].from_node;w,h=base.image.size;px=np.array(base.image.pixels[:],dtype=np.float32).reshape(h,w,4)[...,:3]
lum=px@np.array([.3,.6,.1],np.float32);sat=px.max(2)-px.min(2);smooth=lambda e0,e1,x:(lambda c:c*c*(3-2*c))(np.clip((x-e0)/(e1-e0),0,1))
mask=smooth(.5,.7,lum)*(1-smooth(.15,.3,sat));glow=np.array([0xFF,0xC4,0x6B],np.float32)/255
img=bpy.data.images.new('lamp_emissive',w,h,alpha=False);img.colorspace_settings.name='sRGB'
img.pixels.foreach_set(np.dstack([mask[...,None]*glow,np.ones((h,w))]).astype(np.float32).ravel());img.pack()
em=ns.new('ShaderNodeTexImage');em.image=img;uvsrc=base.inputs['Vector'].links[0].from_node if base.inputs['Vector'].is_linked else None
if uvsrc:ls.new(uvsrc.outputs[0],em.inputs['Vector'])
ls.new(em.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=2.0
pane_texels=int((mask>.5).sum())

bm=bmesh.new();bm.from_mesh(lamp.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
audit={'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_faces for v in bm.verts)};bm.free()
vs=[v.co for v in lamp.data.vertices];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
base_radius=max(math.hypot(v.x,v.y) for v in vs if v.z<.3)
OUT=O/'lamp.glb';bpy.ops.object.select_all(action='DESELECT');lamp.select_set(True);bpy.context.view_layer.objects.active=lamp
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
data=OUT.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]);tri=sum(g['accessors'][p['indices']]['count']//3 for mesh in g['meshes'] for p in mesh['primitives']);assert tri<=1500,tri
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'assets/models/blender/lamp.blend'))
sha=lambda b:hashlib.sha256(b).hexdigest()
report={'asset':'路灯','date':'2026-11-04','stage':'Blender修整与Cesium接入','source':'../raw/lamp_tripo.glb','source_sha256':sha(RAW.read_bytes()),'file':'../../../public/assets/models/lamp.glb','bytes':len(data),'sha256':sha(data),'triangles':tri,'raw_triangles':1410,'triangle_budget':1500,
 'dimensions_m':[round(b-a,4) for a,b in zip(lo,hi)],'uniform_scale':round(s,5),'base_radius_m':round(base_radius,4),'origin':'水平包围盒中心、底座Z=0','front_blender':'-Y','welded_vertices':welded,'mesh_audit':audit,
 'emission':{'color':'#FFC46B','strength':2.0,'map':'lamp_emissive（由颜色贴图中低饱和高亮的磨砂玻璃像素生成）','pane_texels':pane_texels},
 'operations':['保留Tripo造型与贴图，0.1毫米焊接合上UV缝拆开的顶点','等比缩放至总高3.2米，清除导入自定义法线后按35度分平滑/硬边','从1K颜色贴图提取磨砂玻璃像素生成#FFC46B发光贴图，强度2.0；灯框不发光','无实时灯；夜景照明沿用场景贴地暖色光斑'],
 'new_tripo_credits':0,'limitations':['按总高3.2米等比缩放，灯头宽度超出表格0.4米包络（参考图比例）','未改动灯帽/底座网格：原模型在正/后/侧/顶/底渲染中轮廓完整','全量与真实移动设备性能待验收'],'previews':[]}
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.world.color=(.28,.28,.28);scene.view_settings.view_transform='AgX';scene.render.resolution_x=480;scene.render.resolution_y=800;scene.render.resolution_percentage=100
center=Vector((0,0,1.6))
for loc,power in [((3,-4,6),500),((-4,-1,4),350),((0,4,5),400),((0,-2,-4),150)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=4;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=3.5;scene.camera=cam
def shot(name,c,d,ortho=3.5,res=(480,800)):
 cam.data.ortho_scale=ortho;scene.render.resolution_x,scene.render.resolution_y=res;cam.location=c+Vector(d).normalized()*8;cam.rotation_euler=(c-cam.location).to_track_quat('-Z','Y').to_euler();p=V/f'lamp-final-{name}.png';scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);report['previews'].append(p.name)
for name,d in [('front',(0,-1,0)),('back',(0,1,0)),('left',(-1,0,0)),('right',(1,0,0)),('quarter',(.7,-1,.3))]:shot(name,center,d)
head=Vector((0,0,2.85));shot('top',head,(0,0,1),1.0,(480,480));shot('bottom',Vector((0,0,1.6)),(0,0,-1),1.0,(480,480));shot('head',head,(.7,-1,.25),1.0,(480,480))
# Night check: dim the studio so only the emissive panes read.
for o in scene.objects:
 if o.type=='LIGHT':o.data.energy*=.05
scene.world.color=(.01,.012,.03);shot('night',head,(.7,-1,.25),1.0,(480,480))
(V/'lamp.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('LAMP_COMPLETE',json.dumps(report,ensure_ascii=False))
