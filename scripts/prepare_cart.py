"""Rebuild the archived cart's damaged surfaces; reuse its painted colour atlas."""
import bpy,bmesh,json,hashlib,math,struct
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];O=R/'public/assets/models';V=R/'assets/models/review';RAW=R/'assets/models/raw/cart_tripo.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(RAW))
raw=next(o for o in bpy.context.scene.objects if o.type=='MESH');source_mat=raw.data.materials[0];source_image=next(n for n in source_mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'].links[0].from_node.image
bpy.data.objects.remove(raw,do_unlink=True);scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1

def material(name,color,rough=.8,metal=0,patch=None):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
 if patch:
  n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=source_image;m.node_tree.links.new(n.outputs['Color'],b.inputs['Base Color']);m['atlas_patch']=patch
 return m
pink=material('original_magenta',(.78,.006,.2),.8,.02,(.34,.05,.05,.10));cream=material('original_cream',(.99,.90,.70),.85,0,(.65,.86,.05,.08));orange=material('original_counter_orange',(1,.45,.01),.8,0,(.10,.77,.12,.025));blue=material('opaque_blue_grey',(.2,.3,.4),.95,0,(.10,.60,.15,.045));rubber=material('rubber',(.035,.026,.032),.97);metal=material('axle_and_braces',(.12,.06,.07),.75,.2)
parts=[]
def map_uv(o,mat):
 uv=o.data.uv_layers.active
 if not uv:return
 uv.name='SourceUV'
 if 'atlas_patch' in mat:
  x,y,w,h=mat['atlas_patch']
  for loop in uv.data:loop.uv=(x+w*loop.uv.x,y+h*loop.uv.y)
def box(name,size,loc,mat,bevel=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  mod=o.modifiers.new('Rounded_edges','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 map_uv(o,mat);parts.append(o);return o
# Whole model bounds are x[-1.1,1.1], y[-.55,.55], z[0,2.4].
box('magenta_lower_body',(2,.75,.83),(0,.115,.735),pink,.045)
box('cream_upper_body',(2,.75,1.05),(0,.115,1.665),cream,.045)
box('roof_cap',(2.2,1,.12),(0,.05,2.34),pink,.04)
box('opaque_display_window',(1.70,.025,.66),(0,-.270,1.67),blue,.04)
box('fold_down_counter',(1.90,.33,.08),(0,-.385,1.10),orange,.025)
box('rear_service_panel',(1.68,.018,.72),(0,.493,1.67),cream,.015)
for x in [-1.004,1.004]:box('side_service_panel',(.018,.55,.68),(x,.115,1.67),cream,.015)
for x in [-.75,.75]:
 a=Vector((x,-.25,.78));b=Vector((x,-.49,1.065));d=b-a;o=box('counter_brace',(.065,.065,d.length),(a+b)/2,pink,.008);o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
box('underbody',(1.65,.55,.10),(0,.115,.32),metal,.015)

def cylinder(name,radius,depth,loc,mat,n=16,bevel=0):
 bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=radius,depth=depth,location=loc,rotation=(math.pi/2,0,0));o=bpy.context.object;o.name=name;o.data.materials.append(mat);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 if bevel:
  mod=o.modifiers.new('Tyre_soft_edge','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 map_uv(o,mat);parts.append(o);return o
wheel_centers=[]
for x in [-.73,.73]:
 cylinder('axle',.035,.87,(x,.115,.18),metal,8)
 for y,sign in [(-.30,-1),(.46,1)]:
  tire=cylinder('tire',.18,.13,(x,y,.18),rubber,16,.016)
  for p in tire.data.polygons:p.use_smooth=True
  cylinder('cream_hub',.101,.012,(x,y+sign*.068,.18),cream,12)
  cylinder('magenta_hub',.056,.015,(x,y+sign*.079,.18),pink,10)
  wheel_centers.append([x,y,.18])
# Closed individual canvas petals make the scallops clean at front, back and sides.
def petal(name,side,a,b,index):
 vs=[];fs=[];steps=4
 # One millimetre seams keep neighbouring closed canvas petals distinct.
 a+=.0005;b-=.0005
 for i in range(steps+1):
  t=i/steps;q=a+(b-a)*t;low=2.045-.055*math.sin(math.pi*t)
  if side=='front':pts=[(q,-.28,2.28),(q,-.45,2.08),(q,-.45,low),(q,-.28,2.24)]
  elif side=='back':pts=[(q,.48,2.28),(q,.55,2.08),(q,.55,low),(q,.48,2.24)]
  elif side=='left':pts=[(-.96,q,2.28),(-1.1,q,2.08),(-1.1,q,low),(-.96,q,2.24)]
  else:pts=[(.96,q,2.28),(1.1,q,2.08),(1.1,q,low),(.96,q,2.24)]
  vs.extend(pts)
 for i in range(steps):
  for j in range(4):fs.append((i*4+j,(i+1)*4+j,(i+1)*4+(j+1)%4,i*4+(j+1)%4))
 fs.extend([(3,2,1,0),(steps*4,steps*4+1,steps*4+2,steps*4+3)])
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);mat=pink if index%2==0 else orange;me.materials.append(mat);uv=me.uv_layers.new(name='SourceUV')
 patch=mat['atlas_patch']
 for p in me.polygons:
  for li in p.loop_indices:
   vi=me.loops[li].vertex_index;uv.data[li].uv=(patch[0]+patch[2]*(vi//4/steps),patch[1]+patch[3]*(vi%4/3))
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();parts.append(o)
for side in ['front','back']:
 for i in range(10):petal('awning_'+side+'_'+str(i),side,-1.1+i*.22,-1.1+(i+1)*.22,i)
for side in ['left','right']:
 for i in range(4):petal('awning_'+side+'_'+str(i),side,-.28+i*.19,-.28+(i+1)*.19,i)
# Merge and bake four PBR channels to one padded 1K atlas.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();cart=bpy.context.object;cart.name='cart';scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new();bm.from_mesh(cart.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(cart.data);bm.free()
for m in cart.data.materials:
 for n in list(m.node_tree.nodes):
  if n.type=='TEX_IMAGE' and not n.inputs['Vector'].is_linked:
   uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='SourceUV';m.node_tree.links.new(uv.outputs[0],n.inputs['Vector'])
source_uv=cart.data.uv_layers[0];atlas=cart.data.uv_layers.new(name='AtlasUV');cart.data.uv_layers.active=atlas;atlas.active_render=True
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
scene.render.engine='CYCLES';scene.cycles.samples=8;images={}
for channel,typ in [('basecolor','DIFFUSE'),('normal','NORMAL'),('roughness','ROUGHNESS'),('metallic','EMIT')]:
 image=bpy.data.images.new('cart_'+channel,width=1024,height=1024,alpha=False);image.colorspace_settings.name='sRGB' if channel=='basecolor' else 'Non-Color'
 for m in cart.data.materials:
  ns=m.node_tree.nodes;target=ns.new('ShaderNodeTexImage');target.image=image;ns.active=target
  if channel=='metallic':
   bs=ns.get('Principled BSDF');em=ns.new('ShaderNodeEmission');em.inputs['Color'].default_value=(bs.inputs['Metallic'].default_value,)*3+(1,);m.node_tree.links.new(em.outputs[0],ns.get('Material Output').inputs['Surface'])
 bpy.ops.object.bake(type=typ,pass_filter={'COLOR'} if typ=='DIFFUSE' else set(),use_selected_to_active=False,margin=12);image.pack();images[channel]=image
final=material('cart_1K_PBR',(1,1,1));ns=final.node_tree.nodes;ls=final.node_tree.links;bs=ns.get('Principled BSDF')
for channel,img in images.items():
 node=ns.new('ShaderNodeTexImage');node.image=img
 if channel=='normal':normal=ns.new('ShaderNodeNormalMap');ls.new(node.outputs['Color'],normal.inputs['Color']);ls.new(normal.outputs[0],bs.inputs['Normal'])
 else:ls.new(node.outputs['Color'],bs.inputs[{'basecolor':'Base Color','roughness':'Roughness','metallic':'Metallic'}[channel]])
cart.data.materials.clear();cart.data.materials.append(final)
for p in cart.data.polygons:p.material_index=0
cart.data.uv_layers.remove(cart.data.uv_layers.get('SourceUV'));cart.data.uv_layers.active=cart.data.uv_layers.get('AtlasUV')
# Fixed bulbs are attached to the fascia; emission does not add realtime lights.
bulb=material('cart_warm_bulb',(1,.70,.28),.6);bs=bulb.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.66,.28,1);bs.inputs['Emission Strength'].default_value=2.5
bulb_positions=[(-.9+i*.3,-.435,2.265) for i in range(7)]+[(x,y,2.265) for x in [-1.06,1.06] for y in [-.1,.30]]
lighting=[]
for loc in bulb_positions:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.04,location=loc);o=bpy.context.object;o.name='attached_warm_bulb';o.data.materials.append(bulb);o.data.uv_layers[0].name=cart.data.uv_layers[0].name;lighting.append(o)
bpy.ops.object.select_all(action='DESELECT');cart.select_set(True)
for o in lighting:o.select_set(True)
bpy.context.view_layer.objects.active=cart;bpy.ops.object.join()
# Source geometry can overlap inside mechanical joins; every shell itself is closed.
bm=bmesh.new();bm.from_mesh(cart.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
audit={'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_faces for v in bm.verts)};bm.free()
OUT=O/'cart.glb';bpy.ops.object.select_all(action='DESELECT');cart.select_set(True);bpy.context.view_layer.objects.active=cart
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
data=OUT.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]);tri=sum(g['accessors'][p['indices']]['count']//3 for mesh in g['meshes'] for p in mesh['primitives']);assert tri<=3000,tri
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'assets/models/blender/cart.blend'))
report={'asset':'小吃车','date':'2026-11-04','stage':'Blender重拓扑与Cesium接入','source':'../raw/cart_tripo.glb','source_sha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),'file':'../../../public/assets/models/cart.glb','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':tri,'raw_triangles':3495,'dimensions_m':[2.2,1.1,2.4],'origin':'整体水平包围盒中心、轮胎最低点Z=0','front_blender':'-Y','wheel_count':4,'wheel_centers':wheel_centers,'bulb_count':len(bulb_positions),'emission_strength':2.5,'window':'不透明浅蓝灰，alphaMode OPAQUE','mesh_audit':audit,'operations':['按原造型重建平整车身、展示窗、折叠台板和斜撑','重建四轮及轮毂、固定车轴','重建28片封闭条纹篷布垂边','复用原配色/颜色贴图，重新烘焙1K PBR，12像素UV边距','11颗屋顶固定暖色灯泡，发光强度2.5，无悬空电线'],'new_tripo_credits':0,'limitations':['静态展示车，未制作行驶或折叠动画','机械和布面构件有内部交叠，不作打印级布尔实体认证','全量与真实移动设备性能待验收'],'previews':[]}
# Neutral studio review of the actual export geometry.
scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.world.color=(.28,.28,.28);scene.view_settings.view_transform='AgX';scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
center=Vector((0,0,1.2))
for loc,power in [((3,-4,6),350),((-4,-1,4),250),((0,4,5),300)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=4;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=3.35;scene.camera=cam
for name,d in [('front',(0,-1,0)),('back',(0,1,0)),('left',(-1,0,0)),('right',(1,0,0)),('top',(0,0,1)),('bottom',(0,0,-1)),('quarter',(.7,-1,.55))]:
 cam.location=center+Vector(d)*6;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();p=V/f'cart-final-{name}.png';scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);report['previews'].append(p.name)
(V/'cart.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
(V/'cart-colliders.json').write_text(json.dumps({'asset':'cart','footprint':[-.92,.92,-.46,.23],'height':2.15,'body_center_game':[0,-.115],'shrink_percent':8,'note':'车身宽2.0/深0.75的8%收缩代理；不含台板、篷布、车轮；游戏坐标与Blender XY相反'},ensure_ascii=False,indent=2)+'\n')
print('CART_COMPLETE',json.dumps(report,ensure_ascii=False))
