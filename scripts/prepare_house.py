"""Clean the archived house and export three self-contained material variants."""
import bpy,bmesh,json,hashlib,math,struct
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];REVIEW=ROOT/'assets/models/review';OUT=ROOT/'public/assets/models';RAW=ROOT/'assets/models/raw/house_base_tripo.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(RAW));scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
house=next(o for o in scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=house
house.dimensions=(5.5,4.5,4.5);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
lo=Vector(tuple(min(v.co[i] for v in house.data.vertices) for i in range(3)));hi=Vector(tuple(max(v.co[i] for v in house.data.vertices) for i in range(3)))
for v in house.data.vertices:v.co-=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
house.location=(0,0,0)
source_mesh=house.copy();source_mesh.data=house.data.copy();source_mesh.name='bake_source';scene.collection.objects.link(source_mesh);source_mesh.select_set(False)
bm=bmesh.new();bm.from_mesh(house.data);before=len(bm.verts)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));merged=before-len(bm.verts)
bm.to_mesh(house.data);bm.free()
# A small budget reduction preserves door frames, shutters, balcony and parapet.
mod=house.modifiers.new('Planar_cleanup','DECIMATE');mod.decimate_type='DISSOLVE';mod.angle_limit=math.radians(2);mod.delimit={'NORMAL','UV','MATERIAL'}
bpy.ops.object.modifier_apply(modifier=mod.name)
# Repair small shutter pinholes and overlapping internal triangles in the source.
bm=bmesh.new();bm.from_mesh(house.data)
bad={f for e in bm.edges if len(e.link_faces)>2 for f in e.link_faces}
if bad:bmesh.ops.delete(bm,geom=list(bad),context='FACES')
boundary=[e for e in bm.edges if e.is_boundary]
filled=bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
# Complex tiny shutter loops may not be handled by holes_fill. Cap each
# remaining boundary component with a local fan before rebuilding the UVs.
remaining={e for e in bm.edges if e.is_boundary}
while remaining:
 edge=remaining.pop();component={edge};verts=set(edge.verts);todo=list(edge.verts)
 while todo:
  v=todo.pop()
  for e in v.link_edges:
   if e in remaining:remaining.remove(e);component.add(e);verts.update(e.verts);todo.extend(e.verts)
 center_vertex=bm.verts.new(sum((v.co for v in verts),Vector())/len(verts))
 for e in component:
  loop=e.link_loops[0]
  try:bm.faces.new((loop.link_loop_next.vert,loop.vert,center_vertex))
  except ValueError:pass
bmesh.ops.triangulate(bm,faces=list(bm.faces))
for v in list(bm.verts):
 if not v.link_faces:bm.verts.remove(v)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(house.data);bm.free()
# Weld seam duplicates first, then smooth normals consistently across former UV seams.
for p in house.data.polygons:p.use_smooth=True
bpy.context.view_layer.update();house.dimensions=(5.5,4.5,4.5);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
lo=Vector(tuple(min(v.co[i] for v in house.data.vertices) for i in range(3)));hi=Vector(tuple(max(v.co[i] for v in house.data.vertices) for i in range(3)))
for v in house.data.vertices:v.co-=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bm=bmesh.new();bm.from_mesh(house.data)
audit={'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_faces for v in bm.verts)};bm.free()
triangles=sum(len(p.vertices)-2 for p in house.data.polygons);assert 2000<=triangles<=4000
# Rebuild a padded atlas and transfer original PBR; retaining old UVs after
# collapse corrupts window colours and tangent normals even at this small ratio.
bpy.context.view_layer.objects.active=house
bpy.ops.object.select_all(action='DESELECT');house.select_set(True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.151917,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
mat=bpy.data.materials.new('house_baked');mat.use_nodes=True;house.data.materials.clear();house.data.materials.append(mat)
bsdf=mat.node_tree.nodes.get('Principled BSDF');nodes=mat.node_tree.nodes;links=mat.node_tree.links
scene.render.engine='CYCLES';scene.cycles.samples=8;source_mesh.select_set(True)
images={}
for channel,bake_type in [('basecolor','DIFFUSE'),('normal','NORMAL'),('roughness','ROUGHNESS'),('metallic','EMIT')]:
 img=bpy.data.images.new('house_'+channel,width=1024,height=1024,alpha=False);img.colorspace_settings.name='sRGB' if channel=='basecolor' else 'Non-Color'
 node=nodes.new('ShaderNodeTexImage');node.image=img;nodes.active=node;images[channel]=node
 if channel=='metallic':
  source_mesh.data.materials[0]=source_mesh.data.materials[0].copy();sm=source_mesh.data.materials[0];sb=next(n for n in sm.node_tree.nodes if n.type=='BSDF_PRINCIPLED');output=next(n for n in sm.node_tree.nodes if n.type=='OUTPUT_MATERIAL');emit=sm.node_tree.nodes.new('ShaderNodeEmission');metal=sb.inputs['Metallic']
  if metal.is_linked:sm.node_tree.links.new(metal.links[0].from_socket,emit.inputs['Color'])
  else:emit.inputs['Color'].default_value=(metal.default_value,)*3+(1,)
  sm.node_tree.links.new(emit.outputs[0],output.inputs['Surface'])
 bpy.ops.object.bake(type=bake_type,pass_filter={'COLOR'} if bake_type=='DIFFUSE' else set(),use_selected_to_active=True,cage_extrusion=.025,max_ray_distance=.10,margin=12);img.pack()
links.new(images['basecolor'].outputs['Color'],bsdf.inputs['Base Color']);links.new(images['roughness'].outputs['Color'],bsdf.inputs['Roughness']);links.new(images['metallic'].outputs['Color'],bsdf.inputs['Metallic'])
nm=nodes.new('ShaderNodeNormalMap');links.new(images['normal'].outputs['Color'],nm.inputs['Color']);nm.inputs['Strength'].default_value=1;links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
bpy.data.objects.remove(source_mesh,do_unlink=True)
base=images['basecolor'];source=base.image;pixels=np.array(source.pixels[:],dtype=np.float32).reshape(-1,4)
luma=pixels[:,:3]@np.array([.2126,.7152,.0722]);mask=np.clip((luma-.16)/.20,0,1);mask=mask*mask*(3-2*mask)
center=Vector((0,0,2.25));scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.world.color=(.25,.25,.25);scene.view_settings.view_transform='AgX'
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
for loc,power in [((5,-7,10),1400),((-6,-2,7),900),((0,6,8),1300)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=7;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=7.7;scene.camera=cam
reports=[]
for key,hexcolor in [('a','E5127D'),('b','1CC0C9'),('c','FFB31A')]:
 name='house_'+key;house.name=name
 variant=mat.copy();variant.name=name;house.data.materials[0]=variant
 node=next(n for n in variant.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'].links[0].from_node
 rgb=np.array([int(hexcolor[i:i+2],16)/255 for i in (0,2,4)]);linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
 colored=pixels.copy();colored[:,:3]*=1-mask[:,None]*.55*(1-linear)
 img=bpy.data.images.new(name+'_basecolor',width=1024,height=1024,alpha=False);img.colorspace_settings.name='sRGB';img.pixels.foreach_set(colored.ravel());img.pack();node.image=img
 bpy.ops.object.select_all(action='DESELECT');house.select_set(True);bpy.context.view_layer.objects.active=house
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
 data=(OUT/(name+'.glb')).read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]);exported_triangles=sum(g['accessors'][p['indices']]['count']//3 for mesh in g['meshes'] for p in mesh['primitives'])
 previews=[]
 for view,d in [('front',(0,-1,0)),('back',(0,1,0)),('left',(-1,0,0)),('right',(1,0,0)),('top',(0,0,1)),('bottom',(0,0,-1)),('quarter',(.65,-1,.65))]:
  cam.location=center+Vector(d)*12;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();path=REVIEW/f'{name}-{view}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);previews.append(path.name)
 report={'asset':name,'date':'2026-11-04','source':'../raw/house_base_tripo.glb','source_sha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),'file':'../../../public/assets/models/'+name+'.glb','sha256':hashlib.sha256((OUT/(name+'.glb')).read_bytes()).hexdigest(),'bytes':(OUT/(name+'.glb')).stat().st_size,'triangles':exported_triangles,'source_mesh_triangles':triangles,'raw_triangles':4295,'merged_vertices':merged,'dimensions_m':[5.5,4.5,4.5],'height_note':'总高按女儿墙4.5m；檐口约4.2m，保留原始手工石膏起伏','origin':'水平中心、最低点Z=0','front_blender':'-Y','color':'#'+hexcolor,'material_method':'对亮色灰泥按55% Multiply烘焙到1K颜色图；线性亮度平滑蒙版保留深色木门窗/铁件；PBR四通道从原始表面重烘焙，UV边距12像素','mesh_audit':audit,'previews':previews,'limitations':['源网格封补后边界0/非流形5；当前GLB回导焊接后边界2/非流形7，不作打印级认证','局部门窗保留细微阴影杂点'],'pending':['全资产与真实移动设备性能验收','保留Tripo手工风格的不规则石膏/门框，未重建为严格直角建筑']}
 (REVIEW/(name+'.manifest.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');reports.append(report)
 # Keep the three source variants with identical geometry in one Blender file.
 copy=house.copy();copy.data=house.data.copy();scene.collection.objects.link(copy);copy.hide_render=True;copy.hide_set(True)
# Original active mesh is the C variant; hidden A/B/C copies can be independently selected.
bpy.data.objects.remove(copy,do_unlink=True)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/models/blender/house_variants.blend'))
collider={'asset':'house','center':[0,0,2.1],'size':[5.06,4.14,4.2],'footprint':[-2.53,2.53,-2.07,2.07],'shrink_percent':8,'note':'独立简盒；不含屋檐、阳台和女儿墙，未混入视觉GLB'}
(REVIEW/'house-colliders.json').write_text(json.dumps(collider,ensure_ascii=False,indent=2)+'\n')
print('HOUSE_COMPLETE',triangles,audit)
