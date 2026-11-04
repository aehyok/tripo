"""Rebuild the torn Tripo pinata as a clean seven-point star; hanger and rope are a separate file."""
import bpy,bmesh,json,hashlib,math,struct
import numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];O=R/'public/assets/models';V=R/'assets/models/review';RAW=R/'assets/models/raw/pinata_tripo.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes,bpy.data.materials,bpy.data.images):
 for b in list(block):block.remove(b)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
# Manual palette: magenta, marigold, cream, turquoise (texture rows bottom to top).
PALETTE=[(0xE5,0x12,0x7D),(0xFF,0xB3,0x1A),(0xFF,0xF4,0xDC),(0x1C,0xC0,0xC9)];MAG,MARI,CREAM,TURQ=range(4)
S=1024;rng=np.random.default_rng(7)

def paper_maps():
 """Crepe-paper strips: 12 cut strips per tile width, shadow under each overlapping fringe."""
 y,x=np.mgrid[0:S,0:S].astype(np.float32);row=(y//256).astype(int);t=(y%256)/255.0
 strip=(x/(S/12)).astype(int);sx=(x%(S/12))/(S/12)
 jitter=rng.uniform(.42,.62,(4,12));shade=rng.uniform(.95,1.05,(4,12))
 slit=(np.minimum(sx,1-sx)<.025)&(t<jitter[row,strip])
 fibre=np.repeat(np.convolve(rng.normal(0,1,S),np.ones(5)/5,'same')[None,:],S,0).astype(np.float32)
 light=shade[row,strip]*(1-.24*np.clip((t-.78)/.18,0,1))*(1+.07*(1-t))*(1+.025*fibre)
 light=np.where(slit,light*.72,light);light=np.where(t<.06,.52,light)
 base=np.array(PALETTE,np.float32)[row]/255*light[...,None]
 height=-.6*slit-.5*(t<.06)+.04*fibre+.25*(1-t)
 gy,gx=np.gradient(height);n=np.dstack([-gx*3,-gy*3,np.ones_like(height)]);n/=np.linalg.norm(n,axis=2,keepdims=True)
 rough=np.clip(.9+.03*fibre,0,1)
 out={}
 for name,rgb,space in [('basecolor',np.clip(base,0,1),'sRGB'),('normal',n*.5+.5,'Non-Color'),('roughness',np.dstack([rough]*3),'Non-Color')]:
  img=bpy.data.images.new('pinata_'+name,S,S,alpha=False);img.colorspace_settings.name=space
  img.pixels.foreach_set(np.dstack([rgb,np.ones((S,S))]).astype(np.float32).ravel());img.pack();out[name]=img
 return out

class Shell:
 """Collects faces with per-loop UVs and sharp rings, then becomes one closed mesh."""
 def __init__(s):s.v=[];s.f=[];s.uv=[];s.sharp=set()
 def ring(s,c,a,b,r,n,phase=0):
  i=len(s.v);s.v+= [tuple(c+r*(math.cos(phase+2*math.pi*j/n)*a+math.sin(phase+2*math.pi*j/n)*b)) for j in range(n)];return list(range(i,i+n))
 def point(s,p):s.v.append(tuple(p));return len(s.v)-1
 def strip(s,lo,hi,color,t0,t1,rep):
  n=len(lo)
  for j in range(n):
   k=(j+1)%n;u0=j/n*rep;u1=(j+1)/n*rep
   s.f.append((lo[j],lo[k],hi[k],hi[j]));s.uv.append([uvp(color,u0,t0),uvp(color,u1,t0),uvp(color,u1,t1),uvp(color,u0,t1)])
 def fan(s,ring,apex,color,t0,t1,rep,flip=False):
  n=len(ring)
  for j in range(n):
   k=(j+1)%n;face=(ring[j],ring[k],apex);uv=[uvp(color,j/n*rep,t0),uvp(color,(j+1)/n*rep,t0),uvp(color,(j+.5)/n*rep,t1)]
   s.f.append(face[::-1] if flip else face);s.uv.append(uv[::-1] if flip else uv)
 def edge_ring(s,ring):s.sharp.update(frozenset((ring[j],ring[(j+1)%len(ring)])) for j in range(len(ring)))
def uvp(color,u,t):return (u,(color+.06+.9*t)/4)

def build_body():
 # Regular seven-point star in the XZ plane: top tip Z=1.0, two lowest tips Z=0.
 L=1/(1+math.cos(math.pi/7));C=Vector((0,0,L*math.cos(math.pi/7)));Rs=.255;lip=.012;sh=Shell()
 X,Y,Z=Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))
 # Sphere bands of equal projected height, magenta cap to cream base; each lower edge flares down over the next band.
 order=[MAG,MARI,CREAM,TURQ,MAG,MARI,CREAM];n=14;zs=[Rs-2*Rs*k/7 for k in range(8)]
 rho=lambda z:math.sqrt(max(Rs*Rs-z*z,0))
 top=sh.point(C+Z*Rs);prev=None
 for k,col in enumerate(order):
  z0,z1=zs[k],zs[k+1]
  if k==0:
   zm=(z0+z1)/2;mid=sh.ring(C+Z*zm,X,Y,rho(zm)+lip*.4,n);sh.fan(mid,top,col,.5,.96,2,flip=True)
   bot=sh.ring(C+Z*z1,X,Y,rho(z1)+lip,n);sh.strip(bot,mid,col,.08,.5,2);prev=bot;continue
  head=sh.ring(C+Z*z0,X,Y,rho(z0),n);sh.strip(head,prev,order[k-1],.0,.04,2);sh.edge_ring(head);sh.edge_ring(prev)
  if k==6:
   zm=(z0+z1)/2;mid=sh.ring(C+Z*zm,X,Y,rho(zm),n);sh.strip(mid,head,col,.5,.96,2);sh.fan(mid,sh.point(C-Z*Rs),col,.5,.08,2)
  else:
   bot=sh.ring(C+Z*z1,X,Y,rho(z1)+lip,n);sh.strip(bot,head,col,.08,.96,2);prev=bot
 # Seven cones: magenta base, turquoise, cream, marigold, magenta tip; fringes face the sphere.
 bands=[MAG,TURQ,CREAM,MARI,MAG];m=8;s0=.2;s_end=L;tips=[]
 radius=lambda s:.115+(.022-.115)*(s-s0)/(s_end-.05-s0)
 for i in range(7):
  a=math.pi/2+2*math.pi*i/7;d=Vector((math.cos(a),0,math.sin(a)));e2=d.cross(Y)
  cuts=[s0+(s_end-s0)*f for f in (0,.16,.38,.58,.78)];tips.append(tuple(C+d*s_end))
  base=sh.ring(C+d*s0,Y,e2,radius(s0),m,math.pi/m);cap=sh.point(C+d*(s0-.01));sh.fan(base,cap,MAG,.5,.5,1)
  prev=base
  for k,col in enumerate(bands):
   if k:
    head=sh.ring(C+d*cuts[k],Y,e2,radius(cuts[k])+lip,m,math.pi/m);sh.strip(prev,head,col,.0,.04,1);sh.edge_ring(head);sh.edge_ring(prev)
   else:head=prev
   if k<4:
    nxt=sh.ring(C+d*cuts[k+1],Y,e2,radius(cuts[k+1]),m,math.pi/m);sh.strip(head,nxt,col,.08,.96,1);prev=nxt
   else:sh.fan(head,sh.point(C+d*s_end),col,.08,.96,1)
 me=bpy.data.meshes.new('pinata');me.from_pydata(sh.v,[],sh.f);me.update();uv=me.uv_layers.new(name='UVMap')
 for p,coords in zip(me.polygons,sh.uv):
  for li,c in zip(p.loop_indices,coords):uv.data[li].uv=c
 o=bpy.data.objects.new('pinata',me);scene.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(me);bm.verts.ensure_lookup_table()
 for e in bm.edges:e.smooth=frozenset(v.index for v in e.verts) not in sh.sharp
 for f in bm.faces:f.smooth=True
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 return o,tips,{'sphere_center_z':C.z,'sphere_radius':Rs,'tip_distance':L}

def solid(name,color,rough=.85):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=0;return m

maps=paper_maps();paper=bpy.data.materials.new('pinata_paper_1K');paper.use_nodes=True;ns=paper.node_tree.nodes;ls=paper.node_tree.links;bs=ns.get('Principled BSDF');bs.inputs['Metallic'].default_value=0
for channel,img in maps.items():
 node=ns.new('ShaderNodeTexImage');node.image=img
 if channel=='normal':nm=ns.new('ShaderNodeNormalMap');ls.new(node.outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs[0],bs.inputs['Normal'])
 else:ls.new(node.outputs['Color'],bs.inputs['Base Color' if channel=='basecolor' else 'Roughness'])
body,tips,shape=build_body();body.data.materials.append(paper)
lo=[min(v.co[i] for v in body.data.vertices) for i in range(3)];hi=[max(v.co[i] for v in body.data.vertices) for i in range(3)]

def audit(o):
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
 r={'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_faces for v in bm.verts)};bm.free();return r
def export(o,path,budget):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
 data=path.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]);tri=sum(g['accessors'][p['indices']]['count']//3 for mesh in g['meshes'] for p in mesh['primitives']);assert tri<=budget,tri
 return data,tri
body_audit=audit(body);body_data,body_tri=export(body,O/'pinata.glb',1500)

# Hanger: post base at origin; the arm reaches Blender -X (game +X) and the rope drops to the body top tip.
HANG_X,HANG_Z=-1.15,1.9;wood=solid('pinata_post_wood',(.19,.075,.025));cord=solid('pinata_rope',(.82,.69,.47),.95);parts=[]
def cyl(name,r1,r2,a,b,mat,n):
 d=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r1,radius2=r2,depth=d.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat);parts.append(o);return o
def box(name,size,loc,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;o.data.materials.append(mat);parts.append(o);return o
cyl('foot',.2,.18,(0,0,0),(0,0,.05),wood,12);cyl('post',.075,.055,(0,0,.05),(0,0,3.7),wood,10)
box('arm',(1.33,.09,.09),(-.6,0,3.6),wood);cyl('brace',.025,.025,(0,0,3.15),(-.42,0,3.555),wood,6)
rope_top=3.555;rope_bottom=HANG_Z+1.0;cyl('rope',.012,.012,(HANG_X,0,rope_bottom),(HANG_X,0,rope_top),cord,6)
for z,r in [(rope_top-.02,.03),(rope_bottom+.012,.022)]:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=5,radius=r,location=(HANG_X,0,z));o=bpy.context.object;o.name='rope_knot';o.data.materials.append(cord);parts.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);bpy.ops.object.join();hanger=bpy.context.object;hanger.name='pinata_hanger'
for p in hanger.data.polygons:p.use_smooth=False
hanger_audit=audit(hanger);hanger_data,hanger_tri=export(hanger,O/'pinata_hanger.glb',400)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'assets/models/blender/pinata.blend'))

sha=lambda b:hashlib.sha256(b).hexdigest()
report={'asset':'七角星皮纳塔','date':'2026-11-04','stage':'Blender重建与Cesium接入','source':'../raw/pinata_tripo.glb','source_sha256':sha(RAW.read_bytes()),
 'file':'../../../public/assets/models/pinata.glb','bytes':len(body_data),'sha256':sha(body_data),'triangles':body_tri,'raw_triangles':1337,'triangle_budget':1500,
 'dimensions_m':[round(b-a,4) for a,b in zip(lo,hi)],'bounds_min':[round(a,4) for a in lo],'bounds_max':[round(b,4) for b in hi],'origin':'水平包围盒中心、最低两颗尖角Z=0','front_blender':'-Y','tip_count':7,'tip_positions':[[round(c,4) for c in t] for t in tips],'shape':{k:round(v,4) for k,v in shape.items()},'mesh_audit':body_audit,
 'hanger':{'file':'../../../public/assets/models/pinata_hanger.glb','bytes':len(hanger_data),'sha256':sha(hanger_data),'triangles':hanger_tri,'origin':'立柱底部中心Z=0','rope_attach_blender':[HANG_X,0,rope_bottom],'body_mount_game':{'x':-HANG_X,'z':HANG_Z},'mesh_audit':hanger_audit},
 'operations':['原始网格有破洞、背面纸片翻折，按参考图重建：球体+七个平面尖角，最低两角Z=0、顶角Z=1','七段球体纸带与五段尖角纸带使用外翻台阶层叠，下沿朝球体/朝下','程序绘制1K皱纹纸颜色/法线/粗糙度：12条切口纸条、上沿压影、手册四色','悬挂立柱、横臂、斜撑、独立绳索与两个绳结单独为pinata_hanger.glb，绳底对准顶角'],
 'new_tripo_credits':0,'limitations':['按总高1.0米与参考图正七角比例，宽约1.03米、深0.51米，未压缩为表格0.8×0.8包络','尖角与球体内部交叠，不作打印级布尔实体认证','静态悬挂，未制作摆动或击打动画','全量与真实移动设备性能待验收'],'previews':[]}

# Neutral studio review: body alone from seven views, then the full hanging assembly.
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.world.color=(.28,.28,.28);scene.view_settings.view_transform='AgX';scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100
center=Vector((0,0,.5))
for loc,power in [((3,-4,6),300),((-4,-1,4),220),((0,4,5),260),((0,-2,-4),120)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=4;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=1.3;scene.camera=cam;hanger.hide_render=True
def shot(name,c,d,dist=6):
 cam.location=c+Vector(d).normalized()*dist;cam.rotation_euler=(c-cam.location).to_track_quat('-Z','Y').to_euler();p=V/f'pinata-final-{name}.png';scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);report['previews'].append(p.name)
for name,d in [('front',(0,-1,0)),('back',(0,1,0)),('left',(-1,0,0)),('right',(1,0,0)),('top',(0,0,1)),('bottom',(0,0,-1)),('quarter',(.7,-1,.45))]:shot(name,center,d)
hanger.hide_render=False;body.location=(HANG_X,0,HANG_Z);cam.data.ortho_scale=4.3;shot('assembly',Vector((-.55,0,1.9)),(.35,-1,.25),9)
(V/'pinata.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('PINATA_COMPLETE',json.dumps(report,ensure_ascii=False))
