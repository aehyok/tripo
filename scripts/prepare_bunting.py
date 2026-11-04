"""Hand-build the paper-flag and fairy-light string across the street from repeated 1.2 m units."""
import bpy,bmesh,json,hashlib,math,struct
import numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];O=R/'public/assets/models';V=R/'assets/models/review';ATLAS=R/'assets/ref/flags_atlas.png'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
# Layout matches the street placeholder: poles 8.9 m either side, rope 4.5 m at the poles sagging 1.1 m mid-span.
POLE_X=8.9;POLE_H=4.6;ROPE_END=4.5;SAG=1.1;UNIT=1.2;FLAG_H=.18;SLOTS=6
rope_z=lambda x:ROPE_END-SAG*(1-(x/POLE_X)**2)

# Find each of the 16 downward triangles in the 4×4 atlas by its non-background pixels.
atlas=bpy.data.images.load(str(ATLAS));atlas.scale(1024,1024);atlas.name='flags_atlas';atlas.pack()
S=1024;px=np.array(atlas.pixels[:],dtype=np.float32).reshape(S,S,4)[...,:3];bg=px[4,4];fg=np.abs(px-bg).sum(2)>.25
cells=[]
for row in range(4):
 for col in range(4):
  # Blender rows start at the bottom; atlas row 0 is the top row of the picture.
  y0,y1=S-(row+1)*S//4,S-row*S//4;x0,x1=col*S//4,(col+1)*S//4;m=fg[y0:y1,x0:x1];ys,xs=np.nonzero(m)
  top=ys.max();band=xs[ys>=top-2];apex_y=ys.min();apex_x=xs[ys<=apex_y+2].mean()
  tri=[(x0+band.min(),y0+top),(x0+band.max(),y0+top),(x0+apex_x,y0+apex_y)];c=np.mean(tri,0)
  # Pull corners 4% toward the centre so the dark separator never bleeds onto a flag edge.
  cells.append([tuple(((np.array(p)-c)*.96+c)/S) for p in tri])
flag_w=FLAG_H*np.mean([(c[1][0]-c[0][0])/(c[0][1]-c[2][1]) for c in cells])

def material(name,color,rough=.85,emit=None):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=0
 if emit:b.inputs['Emission Color'].default_value=(*emit[0],1);b.inputs['Emission Strength'].default_value=emit[1]
 return m
srgb=lambda h:tuple((c/255/12.92) if c/255<=.04045 else ((c/255+.055)/1.055)**2.4 for c in h)
flags_mat=material('bunting_flags',(1,1,1),.9);ns=flags_mat.node_tree.nodes;t=ns.new('ShaderNodeTexImage');t.image=atlas;t.interpolation='Linear'
flags_mat.node_tree.links.new(t.outputs['Color'],ns.get('Principled BSDF').inputs['Base Color']);flags_mat.use_backface_culling=False
rope_mat=material('bunting_rope',srgb((0xE9,0xD8,0xB0)),.95);pole_mat=material('bunting_pole',srgb((0xFF,0xF4,0xDC)),.8)
bulb_mat=material('bunting_bulb',srgb((0xFF,0xD7,0x9A)),.6,(srgb((0xFF,0xD7,0x9A)),3.0))
for m in (rope_mat,pole_mat,bulb_mat):m.use_backface_culling=True
mats=[flags_mat,rope_mat,pole_mat,bulb_mat]
verts=[];faces=[];uvs=[];mat_index=[]
def add(vs,fs,mi,fuv=None):
 base=len(verts);verts.extend(tuple(v) for v in vs)
 for k,f in enumerate(fs):faces.append(tuple(base+i for i in f));mat_index.append(mi);uvs.append(fuv[k] if fuv else [(.5,.5)]*len(f))

# Arc-length table along the sagging rope, so units are 1.2 m along the rope rather than along the street.
xs=np.linspace(-POLE_X,POLE_X,2001);zs=np.array([rope_z(x) for x in xs]);arc=np.concatenate([[0],np.cumsum(np.hypot(np.diff(xs),np.diff(zs)))])
units=max(1,round(arc[-1]/UNIT));unit_len=arc[-1]/units
at=lambda s:(lambda x:Vector((x,0,rope_z(x))))(float(np.interp(s,arc,xs)))
# One unit = six slots: a bulb, two flags, a bulb, two flags; no bulb sits inside either pole.
flag_count=0;bulb_count=0
for u in range(units):
 for k in range(SLOTS):
  s=(u+k/SLOTS)*unit_len;p=at(s)
  if k in (0,3):
   if u==0 and k==0:continue
   bpy.ops.mesh.primitive_uv_sphere_add(segments=6,ring_count=3,radius=.03,location=p+Vector((0,0,-.045)));o=bpy.context.object
   add([o.matrix_world@v.co for v in o.data.vertices],[tuple(f.vertices) for f in o.data.polygons],3);bpy.data.objects.remove(o,do_unlink=True);bulb_count+=1
  else:
   a=at(s-flag_w/2);b=at(s+flag_w/2);top=(a+b)/2;apex=top+Vector((0,0,-FLAG_H));off=Vector((0,0,-.008))
   add([a+off,b+off,apex],[(0,1,2)],0,[cells[flag_count%16]]);flag_count+=1
# Rope: a four-sided tube along the curve, tied into each pole just below its top.
seg=90;ring=[]
for i in range(seg+1):
 x=-POLE_X+2*POLE_X*i/seg;p=Vector((x,0,rope_z(x)));ring.append([p+Vector((0,.008*math.cos(a),.008*math.sin(a))) for a in [k*math.pi/2+math.pi/4 for k in range(4)]])
add([v for r in ring for v in r],[(i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j) for i in range(seg) for j in range(4)]+[(3,2,1,0),(seg*4,seg*4+1,seg*4+2,seg*4+3)],1)
for x in (-POLE_X,POLE_X):
 bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.1,radius2=.07,depth=POLE_H,location=(x,0,POLE_H/2));o=bpy.context.object
 add([o.matrix_world@v.co for v in o.data.vertices],[tuple(f.vertices) for f in o.data.polygons],2);bpy.data.objects.remove(o,do_unlink=True)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=5,radius=.09,location=(x,0,POLE_H+.05));o=bpy.context.object
 add([o.matrix_world@v.co for v in o.data.vertices],[tuple(f.vertices) for f in o.data.polygons],2);bpy.data.objects.remove(o,do_unlink=True)
me=bpy.data.meshes.new('bunting');me.from_pydata(verts,[],faces);me.update();uv=me.uv_layers.new(name='UVMap')
for p,coords,mi in zip(me.polygons,uvs,mat_index):
 p.material_index=mi
 for li,c in zip(p.loop_indices,coords):uv.data[li].uv=c
for m in mats:me.materials.append(m)
bunting=bpy.data.objects.new('bunting',me);scene.collection.objects.link(bunting)
bm=bmesh.new();bm.from_mesh(me);solid=[f for f in bm.faces if f.material_index!=0];bmesh.ops.recalc_face_normals(bm,faces=solid)
for f in bm.faces:f.smooth=f.material_index in (2,3)
# Flags face the street front (-Y); double-sided material shows the same print from behind.
for f in bm.faces:
 if f.material_index==0 and f.normal.y>0:f.normal_flip()
bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(me)
closed=[e for e in bm.edges if all(f.material_index!=0 for f in e.link_faces)]
audit={'solid_boundary_edges':sum(e.is_boundary for e in closed),'solid_nonmanifold_edges':sum(not e.is_manifold for e in closed),'flag_faces':flag_count,'loose_vertices':sum(not v.link_faces for v in bm.verts)};bm.free()
OUT=O/'bunting.glb';bpy.ops.object.select_all(action='DESELECT');bunting.select_set(True);bpy.context.view_layer.objects.active=bunting
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_tangents=False,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
data=OUT.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]);tri=sum(g['accessors'][p['indices']]['count']//3 for mesh in g['meshes'] for p in mesh['primitives']);assert tri<=2500,tri
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'assets/models/blender/bunting.blend'))
vs=[v.co for v in me.vertices];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
report={'asset':'纸旗与串灯','date':'2026-11-04','stage':'Blender手建与Cesium接入','file':'../../../public/assets/models/bunting.glb','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':tri,
 'dimensions_m':[round(b-a,4) for a,b in zip(lo,hi)],'origin':'两立柱中点地面Z=0','front_blender':'-Y','span':{'pole_x_m':POLE_X,'pole_height_m':POLE_H,'rope_end_z_m':ROPE_END,'sag_m':SAG,'rope_length_m':round(float(arc[-1]),3)},
 'unit':{'length_m':round(unit_len,4),'nominal_m':UNIT,'count':units,'pattern':'灯泡、两面旗、灯泡、两面旗'},'flag':{'height_m':FLAG_H,'width_m':round(float(flag_w),4),'count':flag_count,'atlas':'assets/ref/flags_atlas.png 缩至1K，16种图案循环'},
 'bulbs':{'count':bulb_count,'color':'#FFD79A','emission_strength':3.0},'mesh_audit':audit,
 'operations':['按弧长把绳索分成1.2米单元：每单元两盏灯泡、四面纸旗，旗面上沿顺绳、尖角垂直向下','纸旗贴图按图集像素自动定位16个三角形并内缩4%防止深色分隔线渗色，双面显示','四棱绳索管、两根4.6米奶油白立柱与顶球；灯泡发光强度3.0，无实时灯','整串导出为一个GLB（一次绘制），单元规则保留在脚本与源工程中'],
 'new_tripo_credits':0,'limitations':['纸旗为单面三角片（双面材质），无厚度','静态，无风吹摆动','未单独导出bunting_unit.glb：游戏直接使用整串，单元由脚本参数生成'],'previews':[]}
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.world.color=(.28,.28,.28);scene.view_settings.view_transform='AgX'
for loc,power in [((3,-8,8),1500),((-6,-4,6),900),((0,6,6),900)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=8;o.rotation_euler=(Vector((0,0,3))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam
def shot(name,c,d,ortho,res):
 cam.data.ortho_scale=ortho;scene.render.resolution_x,scene.render.resolution_y=res;cam.location=Vector(c)+Vector(d).normalized()*20;cam.rotation_euler=(Vector(c)-cam.location).to_track_quat('-Z','Y').to_euler();p=V/f'bunting-final-{name}.png';scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);report['previews'].append(p.name)
shot('front',(0,0,2.4),(0,-1,0),19,(1600,480));shot('back',(0,0,2.4),(0,1,0),19,(1600,480));shot('unit',at(arc[-1]/2-unit_len/2),(0,-1,.1),1.6,(800,400));shot('end',(POLE_X-.6,0,4.1),(.4,-1,.2),2.2,(600,600))
for o in scene.objects:
 if o.type=='LIGHT':o.data.energy*=.04
scene.world.color=(.01,.012,.03);shot('night',at(arc[-1]/2-unit_len/2),(0,-1,.1),1.6,(800,400))
(V/'bunting.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('BUNTING_COMPLETE',json.dumps(report,ensure_ascii=False))
