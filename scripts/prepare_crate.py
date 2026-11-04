"""Hand-build the 0.6 m wooden crate: plank box, edge frame and side braces on one painted 1K wood atlas."""
import bpy,bmesh,json,hashlib,math,struct
import numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];O=R/'public/assets/models';V=R/'assets/models/review'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
S=1024;rng=np.random.default_rng(5);SIZE=.6;BEAM=.07;CORE=.56;BRACE=(.06,.015)

def noise(cells_y,cells_x):
 """Bilinear value noise over the full atlas."""
 g=rng.random((cells_y+1,cells_x+1));ys=np.linspace(0,cells_y,S);xs=np.linspace(0,cells_x,S)
 rows=np.array([np.interp(xs,np.arange(cells_x+1),r) for r in g]);return np.array([np.interp(ys,np.arange(cells_y+1),c) for c in rows.T]).T
def wood_maps():
 # Bottom half: frame-beam grain running along u.  Top half: four lid/side planks with gaps and nails.
 y,x=np.mgrid[0:S,0:S]/S;top=y>=.5;v=np.where(top,(y-.5)*2,y*2)
 wobble=noise(6,3);fibre=noise(S//4,8)
 plank=np.floor(v*4).clip(0,3).astype(int);pv=v*4-plank;tint=rng.uniform(.9,1.08,4)[plank]
 grain=.5+.5*np.sin(2*np.pi*(v*36+2.2*wobble+plank*.37))
 base_top=np.array([0xB6,0x7A,0x45])/255;base_beam=np.array([0x7A,0x4A,0x26])/255
 shade=(.78+.3*grain**2)*(.94+.12*fibre)
 col=np.where(top[...,None],base_top*(shade*tint)[...,None],base_beam*shade[...,None])
 gap=top&((pv<.035)|(pv>.965));nail=top&((np.abs(x-.07)<.012)|(np.abs(x-.93)<.012))&(np.abs(pv-.5)<.06)
 edge=np.minimum(np.minimum(x,1-x),np.minimum(v,1-v));col*=(1-.18*np.clip(1-edge/.04,0,1))[...,None]
 col=np.where(gap[...,None],col*.35,col);col=np.where(nail[...,None],np.array([.18,.17,.16]),col)
 height=.25*grain+.08*fibre-1.0*gap+.4*nail
 gy,gx=np.gradient(height);n=np.dstack([-gx*4,-gy*4,np.ones_like(height)]);n/=np.linalg.norm(n,axis=2,keepdims=True)
 out={}
 for name,rgb,space in [('basecolor',np.clip(col,0,1),'sRGB'),('normal',n*.5+.5,'Non-Color')]:
  img=bpy.data.images.new('crate_'+name,S,S,alpha=False);img.colorspace_settings.name=space
  img.pixels.foreach_set(np.dstack([rgb,np.ones((S,S))]).astype(np.float32).ravel());img.pack();out[name]=img
 return out

verts=[];faces=[];uvs=[]
def box(center,axes,half,region,v0=0):
 """Eight corners, six quads; each face maps its two in-plane axes into the plank or beam half of the atlas."""
 c=Vector(center);ax=[Vector(a).normalized() for a in axes];base=len(verts)
 for sx in (-1,1):
  for sy in (-1,1):
   for sz in (-1,1):verts.append(tuple(c+ax[0]*sx*half[0]+ax[1]*sy*half[1]+ax[2]*sz*half[2]))
 idx=lambda sx,sy,sz:base+(sx>0)*4+(sy>0)*2+(sz>0)
 long=max(range(3),key=lambda i:half[i])
 for n in range(3):
  for s in (-1,1):
   a,b=[i for i in range(3) if i!=n]
   if region=='beam' and b==long:a,b=b,a
   corners=[(-1,-1),(1,-1),(1,1),(-1,1)] if s>0 else [(-1,-1),(-1,1),(1,1),(1,-1)]
   loop=[];uv=[]
   for ca,cb in corners:
    sgn=[0,0,0];sgn[n]=s;sgn[a]=ca;sgn[b]=cb;loop.append(idx(*sgn))
    if region=='plank':uv.append((.01+.98*(ca+1)/2,.51+.48*(cb+1)/2))
    else:uv.append(((ca*half[a]/SIZE)+.5,v0+(cb+1)*half[b]/SIZE))
   faces.append(loop);uvs.append(uv)
X,Y,Z=(1,0,0),(0,1,0),(0,0,1);h=SIZE/2;e=h-BEAM/2
box((0,0,h),(X,Y,Z),(CORE/2,)*3,'plank')
for a,b,c in [(X,Y,Z),(Y,Z,X),(Z,X,Y)]:
 # Four frame beams per axis; X beams run full length and the others butt between them, so no faces coincide.
 length=h if a==X else h-BEAM
 for sb in (-1,1):
  for sc in (-1,1):
   pos=Vector(b)*sb*e+Vector(c)*sc*e+Vector((0,0,h));box(pos,(a,b,c),(length,BEAM/2,BEAM/2),'beam',rng.uniform(.02,.36))
for normal in [X,(-1,0,0),Y,(0,-1,0)]:
 # Diagonal brace on each side, 5 mm below the frame's outer face so the two never coincide.
 n=Vector(normal);t=Vector(Z).cross(n);d=(t+Vector(Z)).normalized();w=n.cross(d)
 box(n*(CORE/2+BRACE[1]/2)+Vector((0,0,h)),(d,w,n),((SIZE-2*BEAM)*math.sqrt(2)/2,BRACE[0]/2,BRACE[1]/2),'beam',rng.uniform(.02,.36))
me=bpy.data.meshes.new('crate');me.from_pydata(verts,[],faces);me.update();uv=me.uv_layers.new(name='UVMap')
for p,coords in zip(me.polygons,uvs):
 for li,cuv in zip(p.loop_indices,coords):uv.data[li].uv=cuv
crate=bpy.data.objects.new('crate',me);scene.collection.objects.link(crate)
bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
maps=wood_maps();mat=bpy.data.materials.new('crate_wood_1K');mat.use_nodes=True;ns=mat.node_tree.nodes;ls=mat.node_tree.links;bs=ns.get('Principled BSDF')
t=ns.new('ShaderNodeTexImage');t.image=maps['basecolor'];ls.new(t.outputs['Color'],bs.inputs['Base Color'])
t=ns.new('ShaderNodeTexImage');t.image=maps['normal'];nm=ns.new('ShaderNodeNormalMap');ls.new(t.outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs[0],bs.inputs['Normal'])
bs.inputs['Roughness'].default_value=.85;bs.inputs['Metallic'].default_value=0;me.materials.append(mat)
bm=bmesh.new();bm.from_mesh(me);audit={'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_faces for v in bm.verts),'closed_shells':17};bm.free()
OUT=O/'crate.glb';bpy.ops.object.select_all(action='DESELECT');crate.select_set(True);bpy.context.view_layer.objects.active=crate
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
data=OUT.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]);tri=sum(g['accessors'][p['indices']]['count']//3 for mesh in g['meshes'] for p in mesh['primitives']);assert tri<=300,tri
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'assets/models/blender/crate.blend'))
vs=[v.co for v in me.vertices];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
report={'asset':'木箱','date':'2026-11-04','stage':'Blender手建与Cesium接入','file':'../../../public/assets/models/crate.glb','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':tri,'triangle_budget':300,
 'dimensions_m':[round(b-a,4) for a,b in zip(lo,hi)],'origin':'底面Z=0、水平中心','front_blender':'-Y','mesh_audit':audit,
 'operations':['0.56米木板箱体+12根0.07米边框木条（对接、不重叠）+4面0.06×0.015米斜撑（低于边框5毫米），共17个封闭盒体','程序绘制1K木纹图集：上半四块木板（缝隙、钉子、色差），下半边框深色顺纹；法线由木纹高度生成','斜撑两端插入边框内部，未做布尔合并'],
 'new_tripo_credits':0,'limitations':['构件为独立封闭盒体，斜撑端部嵌入边框，不作打印级布尔实体认证'],'previews':[]}
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.world.color=(.28,.28,.28);scene.view_settings.view_transform='AgX';scene.render.resolution_x=scene.render.resolution_y=480
center=Vector((0,0,.3))
for loc,power in [((3,-4,6),300),((-4,-1,4),220),((0,4,5),260),((0,-2,-4),100)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=4;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=.95;scene.camera=cam
for name,dv in [('front',(0,-1,0)),('back',(0,1,0)),('left',(-1,0,0)),('top',(0,0,1)),('bottom',(0,0,-1)),('quarter',(.7,-1,.55))]:
 cam.location=center+Vector(dv).normalized()*3;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();p=V/f'crate-final-{name}.png';scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);report['previews'].append(p.name)
(V/'crate.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('CRATE_COMPLETE',json.dumps(report,ensure_ascii=False))
