"""Retopologize the archived stall, reuse its wood texture, export separate goods.
Run in isolated Blender --background --factory-startup.
"""
import bpy,bmesh,json,hashlib,math,struct
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];O=R/'public/assets/models';V=R/'assets/models/review';RAW=R/'assets/models/raw/stall_tripo.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(RAW));scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
counter=next(o for o in scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=counter
counter.dimensions=(2.4,1.2,2.2);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
lo=Vector(tuple(min(v.co[i] for v in counter.data.vertices) for i in range(3)));hi=Vector(tuple(max(v.co[i] for v in counter.data.vertices) for i in range(3)))
for v in counter.data.vertices:v.co-=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
counter.location=(0,0,0);original_material=counter.data.materials[0]
source_base=next(n for n in original_material.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'].links[0].from_node.image
source_uv_name=counter.data.uv_layers[0].name

def material(name,color,rough=.85):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;return m
wood=material('clean_wood_from_original_atlas',(.45,.18,.06))
ns=wood.node_tree.nodes;tex=ns.new('ShaderNodeTexImage');tex.image=source_base;wood.node_tree.links.new(tex.outputs['Color'],ns.get('Principled BSDF').inputs['Base Color'])
def box(name,size,loc,mat,bevel=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  mod=o.modifiers.new('Soft_edges','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 if mat==wood:
  # Explicit original-atlas UVs stay local when the objects are joined.
  uv=o.data.uv_layers[0];uv.name=source_uv_name
  for loop in o.data.loops:
   co=o.data.vertices[loop.vertex_index].co
   uv.data[loop.index].uv=(.12+.10*(co.x/size[0]+.5),.87+.08*(co.z/size[2]+.5))
 return o
# Rebuild the warped counter with the original hand-painted panel pixels.
raw_counter=counter
counter=box('counter_original_panel_texture',(2.2,.90,.72),(0,0,.36),wood,.025)
uv=counter.data.uv_layers[0]
for p in counter.data.polygons:
 for li in p.loop_indices:
  co=counter.data.vertices[counter.data.loops[li].vertex_index].co
  u=(co.x/2.2+.5) if abs(p.normal.y)>=abs(p.normal.x) else (co.y/.9+.5)
  uv.data[li].uv=(.052+.337*u,.825+.135*(co.z/.72+.5))
bpy.data.objects.remove(raw_counter,do_unlink=True)
base=[counter]
base.append(box('clean_countertop',(2.34,1.06,.16),(0,0,.77),wood,.025))
post_centers=[]
for x in [-1.055,1.055]:
 for y in [-.43,.43]:
  base.append(box('support_%s_%s'%(x,y),(.14,.14,1.05),(x,y,1.285),wood,.012));post_centers.append([x,y])
  # A small diagonal knee brace at every corner joins the post to the roof beam.
  a=Vector((x,y,1.50));b=Vector((x-math.copysign(.28,x),y,1.79));d=b-a
  o=box('knee_brace',(.09,.09,d.length),(a+b)/2,wood,.008);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();base.append(o)
# Closed stylized canvas volume: ridge, slopes, eight scallops, no thin dangling fragments.
cloth=material('canvas_generated_reference',(.9,.65,.2),.92);im=bpy.data.images.load(str(R/'assets/ref/awning_stripe.png'));im.scale(1024,1024);im.pack();node=cloth.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;cloth.node_tree.links.new(node.outputs['Color'],cloth.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
verts=[];faces=[];rows=[(-.6,1.86),(-.10,2.18),(0,2.2),(.10,2.18),(.6,1.86)];nx=32;stride=7
for i in range(nx+1):
 x=-1.2+2.4*i/nx;t=(i%4)/4;bottom=1.79-.055*math.sin(math.pi*t)
 for y,z in rows:verts.append((x,y,z))
 verts.extend([(x,-.6,bottom),(x,.6,bottom)])
for i in range(nx):
 a=i*stride;b=(i+1)*stride
 for j in range(4):faces.append((a+j,b+j,b+j+1,a+j+1))
 faces.extend([(a+5,b+5,b,a),(a+4,b+4,b+6,a+6),(a+6,b+6,b+5,a+5)])
faces.extend([(5,0,1,2,3,4,6),tuple(nx*stride+j for j in [6,4,3,2,1,0,5])])
mesh=bpy.data.meshes.new('scalloped_canvas_mesh');mesh.from_pydata(verts,[],faces);mesh.update();canopy=bpy.data.objects.new('canopy_eight_scallops',mesh);scene.collection.objects.link(canopy);canopy.data.materials.append(cloth);uv=mesh.uv_layers.new(name=counter.data.uv_layers[0].name)
for p in mesh.polygons:
 for li in p.loop_indices:
  co=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=((co.x+1.2)/2.4,(co.y+.6)/1.2)
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();base.append(canopy)
# Bake each component in place, retaining source UVs for sampling while using a second
# atlas UV for the destination. This avoids modifying shared source pixels.
bpy.ops.object.select_all(action='DESELECT')
for o in base:o.select_set(True)
bpy.context.view_layer.objects.active=counter;bpy.ops.object.join();stall=bpy.context.object;stall.name='stall';scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
# Freeze each source material's UV routing before creating the destination atlas.
for m in stall.data.materials:
 if not m or not m.use_nodes:continue
 for n in list(m.node_tree.nodes):
  if n.type=='TEX_IMAGE' and not n.inputs['Vector'].is_linked:
   u=m.node_tree.nodes.new('ShaderNodeUVMap');u.uv_map=stall.data.uv_layers[0].name;m.node_tree.links.new(u.outputs['UV'],n.inputs['Vector'])
source_uv=stall.data.uv_layers[0];source_uv.name='SourceUV'
# Update UV map names after the rename.
for m in stall.data.materials:
 for n in m.node_tree.nodes:
  if n.type=='UVMAP':n.uv_map='SourceUV'
new_uv=stall.data.uv_layers.new(name='AtlasUV');stall.data.uv_layers.active=new_uv;new_uv.active_render=True
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
scene.render.engine='CYCLES';scene.cycles.samples=8;images={}
for channel,typ in [('basecolor','DIFFUSE'),('normal','NORMAL'),('roughness','ROUGHNESS')]:
 image=bpy.data.images.new('stall_'+channel,width=1024,height=1024,alpha=False);image.colorspace_settings.name='sRGB' if channel=='basecolor' else 'Non-Color'
 for m in stall.data.materials:
  target=m.node_tree.nodes.new('ShaderNodeTexImage');target.image=image;m.node_tree.nodes.active=target
 bpy.ops.object.bake(type=typ,pass_filter={'COLOR'} if typ=='DIFFUSE' else set(),use_selected_to_active=False,margin=12);image.pack();images[channel]=image
final=material('stall_1K_PBR',(.5,.3,.1));ns=final.node_tree.nodes;ls=final.node_tree.links;bs=ns.get('Principled BSDF')
for channel in images:
 n=ns.new('ShaderNodeTexImage');n.image=images[channel]
 if channel=='normal':nm=ns.new('ShaderNodeNormalMap');ls.new(n.outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs['Normal'],bs.inputs['Normal'])
 else:ls.new(n.outputs['Color'],bs.inputs['Base Color' if channel=='basecolor' else 'Roughness'])
stall.data.materials.clear();stall.data.materials.append(final)
for p in stall.data.polygons:p.material_index=0
stall.data.uv_layers.remove(source_uv);stall.data.uv_layers.active=stall.data.uv_layers[0]

def export(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 path=O/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
 data=path.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]);return {'file':str(path.relative_to(R)),'triangles':sum(g['accessors'][p['indices']]['count']//3 for mesh in g['meshes'] for p in mesh['primitives']),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
# Three fixed warm bulbs use emissive material only; no extra realtime lights.
bulb=material('stall_warm_bulb',(1,.72,.32),.55)
bs=bulb.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.65,.25,1);bs.inputs['Emission Strength'].default_value=1.5
socket=material('bulb_socket',(.12,.055,.022))
lighting=[]
for x in [-.6,0,.6]:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,radius=.04,location=(x,-.35,1.69));o=bpy.context.object;o.name='warm_bulb';o.data.materials.append(bulb);o.data.uv_layers[0].name=stall.data.uv_layers[0].name;lighting.append(o)
 bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.022,depth=.08,location=(x,-.35,1.75));o=bpy.context.object;o.name='bulb_socket';o.data.materials.append(socket);o.data.uv_layers[0].name=stall.data.uv_layers[0].name;lighting.append(o)
bpy.ops.object.select_all(action='DESELECT');stall.select_set(True)
for o in lighting:o.select_set(True)
bpy.context.view_layer.objects.active=stall;bpy.ops.object.join()
base_report=export('stall',[stall]);assert base_report['triangles']<=2000,base_report
# One continuous scarf with a folded/draped path, striped on both sides; no text/logos.
pink=material('scarf_magenta',(.78,.006,.20));cream=material('scarf_cream',(.99,.90,.70));teal=material('cap_turquoise',(.012,.52,.58));yellow=material('cap_marigold',(1,.45,.01))
path=[(.22,.34),(.06,.34),(-.15,.34),(-.35,.34),(-.51,.32),(-.545,.23),(-.55,.12),(-.55,0)]
v=[];f=[]
for i,(y,z) in enumerate(path):
 for x in [-.14,.14]:v.append((x,y,z+.007*math.cos(i)))
for i in range(len(path)-1):f.append((2*i,2*i+1,2*i+3,2*i+2))
me=bpy.data.meshes.new('one_continuous_scarf');me.from_pydata(v,[],f);me.update();scarf=bpy.data.objects.new('stall_scarf',me);scene.collection.objects.link(scarf);me.materials.append(pink);me.materials.append(cream)
for p in me.polygons:p.material_index=int(p.index in [0,2,5])
bpy.context.view_layer.objects.active=scarf;mod=scarf.modifiers.new('Fabric_thickness','SOLIDIFY');mod.thickness=.012;mod.offset=1;bpy.ops.object.modifier_apply(modifier=mod.name)
scarf_report=export('stall_scarf',[scarf]);scarf.hide_render=True;scarf.hide_set(True)
# Three low-poly fan caps as a separate display asset. Domes are closed at the base.
caps=[]
for idx,x in enumerate([-.62,0,.62]):
 vs=[];fs=[];seg=12;rings=4;radius=.145
 for j in range(rings):
  angle=(j/rings)*math.pi/2;rr=radius*math.cos(angle);z=.16*math.sin(angle)
  for i in range(seg):a=2*math.pi*i/seg;vs.append((x+rr*math.cos(a),rr*math.sin(a),z))
 for j in range(rings-1):
  for i in range(seg):a=j*seg+i;b=j*seg+(i+1)%seg;fs.append((a,b,b+seg,a+seg))
 tip=len(vs);vs.append((x,0,.16))
 for i in range(seg):fs.append(((rings-1)*seg+i,(rings-1)*seg+(i+1)%seg,tip))
 fs.append(tuple(reversed(range(seg))))
 me=bpy.data.meshes.new('cap_dome');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('fan_cap_'+str(idx+1),me);scene.collection.objects.link(o);me.materials.append([pink,teal,yellow][idx]);caps.append(o)
 brim=box('cap_brim',(.25,.19,.025),(x,-.15,.0125),cream,.025);caps.append(brim)
caps_report=export('stall_caps',caps)
for o in caps:o.hide_render=True;o.hide_set(True)
# Review components and topology separately: overlapping structural parts are intentional.
bm=bmesh.new();bm.from_mesh(stall.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
audit={'boundary_edges_after_weld':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges_after_weld':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_faces for v in bm.verts)};bm.free()
report={'asset':'球迷摊位','date':'2026-11-04','source':'../raw/stall_tripo.glb','source_sha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),'base':base_report,'accessories':[scarf_report,caps_report],'dimensions_m':[2.4,1.2,2.2],'origin':'底部Z=0、水平中心','front_blender':'-Y','countertop_z_m':.85,'post_centers':post_centers,'post_count':4,'canopy_scallops':8,'emissive_bulbs':{'count':3,'strength':1.5,'realtime_lights':False},'source_canvas':'../../ref/awning_stripe.png','mesh_audit':audit,'operations':['按原始柜台外形重拓扑，复用原始手绘木板纹理','替换变形柜台、灰色连接残片及原支柱/篷布','重建四根带倒角木柱及四角斜撑','按已有帆布贴图重建八瓣垂边与屋脊','规则低面几何、1K PBR重新烘焙、12像素UV边距','独立围巾一条、独立三顶球迷帽；商品不混入基础模型','三颗暖色发光灯泡，Emission强度1.5'],'mount_z':{'scarf':.51,'caps':.85},'new_tripo_credits':0,'limitations':['静态结构；接合构件有内部交叠，不作打印级流形认证','全资产与真实移动设备性能仍待验收'],'previews':[]}
# Save a source with the base visible and independent goods hidden at their local origins.
bpy.ops.object.select_all(action='DESELECT');stall.select_set(True);bpy.context.view_layer.objects.active=stall;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'assets/models/blender/stall.blend'))
scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.world.color=(.28,.28,.28);scene.view_settings.view_transform='AgX';scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
center=Vector((0,0,1.1))
for loc,power in [((3,-4,6),350),((-4,-1,4),250),((0,4,5),300)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=4;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=3.3;scene.camera=cam
for name,d in [('front',(0,-1,0)),('back',(0,1,0)),('left',(-1,0,0)),('right',(1,0,0)),('top',(0,0,1)),('bottom',(0,0,-1)),('quarter',(.7,-1,.6))]:
 cam.location=center+Vector(d)*6;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();p=V/f'stall-final-{name}.png';scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);report['previews'].append(p.name)
for name,goods,z in [('scarf',[scarf],.51),('caps',caps,.85)]:
 for o in goods:o.hide_set(False);o.hide_render=False;o.location.z+=z
 cam.location=center+Vector((.7,-1,.45))*6;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();p=V/f'stall-with-{name}.png';scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);report['previews'].append(p.name)
 for o in goods:o.hide_render=True;o.hide_set(True)
(V/'stall.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
(V/'stall-colliders.json').write_text(json.dumps({'asset':'stall','footprint':[-1.0764,1.0764,-.4876,.4876],'height':.85,'note':'柜台代理宽深收缩8%；不含屋檐、商品和斜撑'},ensure_ascii=False,indent=2)+'\n')
print('STALL_COMPLETE',json.dumps(report,ensure_ascii=False))
