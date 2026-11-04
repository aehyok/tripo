"""Hand-build the chewed football: a 180-triangle truncated icosahedron baked from a dented high-res sphere."""
import bpy,bmesh,json,hashlib,math,struct
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[1];O=R/'public/assets/models';V=R/'assets/models/review'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
# Stylised up from the real 0.22 m so it reads from the default camera; still smaller than Jina (0.5 m).
RADIUS=.2;rng=np.random.default_rng(11)

# Truncated icosahedron: pentagons sit on icosahedron vertices, hexagons on its faces.
phi=(1+5**.5)/2;ico=[Vector(p).normalized() for p in [(-1,phi,0),(1,phi,0),(-1,-phi,0),(1,-phi,0),(0,-1,phi),(0,1,phi),(0,-1,-phi),(0,1,-phi),(phi,0,-1),(phi,0,1),(-phi,0,-1),(-phi,0,1)]]
edge_len=min((a-b).length for i,a in enumerate(ico) for b in ico[i+1:])
nbr={i:[j for j in range(12) if j!=i and abs((ico[i]-ico[j]).length-edge_len)<1e-6] for i in range(12)}
tris=sorted({tuple(sorted((i,j,k))) for i in range(12) for j in nbr[i] for k in nbr[i] if k in nbr[j]})
verts=[];key={}
def point(i,j):
 # Point one third of the way from icosahedron vertex i toward j.
 if (i,j) not in key:key[(i,j)]=len(verts);verts.append(ico[i]+(ico[j]-ico[i])/3)
 return key[(i,j)]
panels=[]
for i in range(12):
 ring=[point(i,j) for j in nbr[i]];c=ico[i];a=(verts[ring[0]]-c).normalized();b=c.cross(a)
 ring.sort(key=lambda r:math.atan2((verts[r]-c).dot(b),(verts[r]-c).dot(a)));panels.append(('pentagon',ring))
for i,j,k in tris:
 n=(ico[i]+ico[j]+ico[k]).normalized()
 if (ico[j]-ico[i]).cross(ico[k]-ico[i]).dot(n)<0:j,k=k,j
 panels.append(('hexagon',[point(i,j),point(j,i),point(j,k),point(k,j),point(k,i),point(i,k)]))
faces=[];kinds=[]
for kind,ring in panels:
 c=sum((verts[r] for r in ring),Vector()).normalized();verts.append(c);ci=len(verts)-1
 for a,b in zip(ring,ring[1:]+ring[:1]):faces.append((ci,a,b));kinds.append(kind)
me=bpy.data.meshes.new('ball');me.from_pydata([tuple(v.normalized()*RADIUS) for v in verts],[],faces);me.update()
low=bpy.data.objects.new('ball',me);scene.collection.objects.link(low)
bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
for f in bm.faces:f.smooth=True
bm.to_mesh(me);bm.free()
panel_edges=[(verts[a],verts[b]) for kind,ring in panels for a,b in zip(ring,ring[1:]+ring[:1])]

# High-res copy: seam grooves along panel edges, a cluster of tooth dents and light scuffing.
high=low.copy();high.data=me.copy();high.name='ball_high';scene.collection.objects.link(high)
# Panel colour follows the low faces, so subdivided faces inherit crisp seams.
for p,kind in zip(high.data.polygons,kinds):p.material_index=1 if kind=='pentagon' else 0
bm=bmesh.new();bm.from_mesh(high.data);bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=15,use_grid_fill=True);bm.to_mesh(high.data);bm.free()
P=np.array([v.co.normalized() for v in high.data.vertices]);A=np.array([e[0].normalized() for e in panel_edges]);B=np.array([e[1].normalized() for e in panel_edges])
N=np.cross(A,B);N/=np.linalg.norm(N,axis=1,keepdims=True)
# Angular distance to each edge arc: perpendicular distance when the foot lies inside the arc, else to an end point.
d=np.arcsin(np.clip(np.abs(P@N.T),0,1));foot=P[:,None,:]-(P@N.T)[...,None]*N[None]
inside=(np.einsum('ijk,jk->ij',np.cross(A[None],foot),N)>=0)&(np.einsum('ijk,jk->ij',np.cross(foot,B[None]),N)>=0)
ends=np.minimum(np.arccos(np.clip(P@A.T,-1,1)),np.arccos(np.clip(P@B.T,-1,1)));seam=np.where(inside,d,ends).min(1)
bite=Vector((.55,-.65,.52)).normalized();bite_np=np.array(bite);dents=[]
for k in range(9):
 # Two rows of small tooth marks across one side of the ball.
 side=np.cross(bite_np,[0,0,1]);side/=np.linalg.norm(side);up=np.cross(side,bite_np)
 row=1 if k<5 else -1;c=bite_np+side*(.22*(k%5-2 if k<5 else k-6.5))+up*.12*row+rng.normal(0,.02,3);dents.append(c/np.linalg.norm(c))
dent=np.zeros(len(P))
for c in dents:dent=np.maximum(dent,np.exp(-(np.arccos(np.clip(P@c,-1,1))/.045)**2))
scuff=np.sin(P@rng.normal(0,30,(3,6))).sum(1)/6
r=RADIUS*(1-.009*np.exp(-(seam/.02)**2)-.016*dent+.0012*scuff)
for v,p,rr in zip(high.data.vertices,P,r):v.co=Vector(p*rr)
# Grime as a vertex colour: darker in the bite marks and seams, multiplied over cream hexagons / ink pentagons.
col=high.data.color_attributes.new('Grime','FLOAT_COLOR','POINT')
for i in range(len(P)):g=(1-.35*dent[i])*(1-.25*math.exp(-(seam[i]/.016)**2))*(1+.04*scuff[i]);col.data[i].color=(g,g,g,1)
srgb=lambda c:[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c]
for name,hexcol in [('ball_cream',(1,.957,.863)),('ball_ink',(.114,.086,.271))]:
 m=bpy.data.materials.new(name);m.use_nodes=True;ns=m.node_tree.nodes;attr=ns.new('ShaderNodeVertexColor');attr.layer_name='Grime'
 mix=ns.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs['Factor'].default_value=1;mix.inputs['A'].default_value=(*srgb(hexcol),1)
 m.node_tree.links.new(attr.outputs['Color'],mix.inputs['B']);m.node_tree.links.new(mix.outputs['Result'],ns.get('Principled BSDF').inputs['Base Color']);high.data.materials.append(m)

# Bake colour and normal onto the low panels' UVs.
lmat=bpy.data.materials.new('ball_1K');lmat.use_nodes=True;low.data.materials.append(lmat)
bpy.ops.object.select_all(action='DESELECT');low.select_set(True);bpy.context.view_layer.objects.active=low
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
scene.render.engine='CYCLES';scene.cycles.samples=8;images={};ns=lmat.node_tree.nodes;ls=lmat.node_tree.links;bs=ns.get('Principled BSDF')
for channel,typ in [('basecolor','DIFFUSE'),('normal','NORMAL')]:
 img=bpy.data.images.new('ball_'+channel,1024,1024,alpha=False);img.colorspace_settings.name='sRGB' if channel=='basecolor' else 'Non-Color'
 t=ns.new('ShaderNodeTexImage');t.image=img;ns.active=t
 high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
 bpy.ops.object.bake(type=typ,pass_filter={'COLOR'} if typ=='DIFFUSE' else set(),use_selected_to_active=True,cage_extrusion=RADIUS*.036,max_ray_distance=RADIUS*.09,margin=12);img.pack();images[channel]=t
ls.new(images['basecolor'].outputs['Color'],bs.inputs['Base Color']);nm=ns.new('ShaderNodeNormalMap');ls.new(images['normal'].outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs[0],bs.inputs['Normal'])
bs.inputs['Roughness'].default_value=.6;bs.inputs['Metallic'].default_value=0
high.hide_render=True;high.hide_set(True)

bm=bmesh.new();bm.from_mesh(low.data);audit={'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_faces for v in bm.verts)};bm.free()
# Origin at the ball's lowest point so it rests on whatever height the layout gives it.
low.data.transform(Matrix.Translation((0,0,RADIUS)));high.data.transform(Matrix.Translation((0,0,RADIUS)))
OUT=O/'ball.glb';bpy.ops.object.select_all(action='DESELECT');low.select_set(True);bpy.context.view_layer.objects.active=low
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
data=OUT.read_bytes();g=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]]);tri=sum(g['accessors'][p['indices']]['count']//3 for mesh in g['meshes'] for p in mesh['primitives']);assert tri<=500,tri
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'assets/models/blender/ball.blend'))
vs=[v.co for v in low.data.vertices];lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
report={'asset':'足球','date':'2026-11-04','stage':'Blender手建与Cesium接入','file':'../../../public/assets/models/ball.glb','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':tri,'triangle_budget':500,
 'dimensions_m':[round(b-a,4) for a,b in zip(lo,hi)],'origin':'球体最低点Z=0、水平中心','panels':{'pentagon':12,'hexagon':20},'tooth_dents':len(dents),'mesh_audit':audit,
 'operations':['截角二十面体：12块墨色五边形+20块奶油白六边形，每块中心加点，投影到直径0.4米球面（180三角面）；按游戏可读性放大，真实足球为0.22米','高模细分并位移：缝线凹槽、一侧两排9个牙印凹坑、轻微磨损','从高模烘焙1K颜色与法线到低模UV；牙印处带污渍'],
 'new_tripo_credits':0,'limitations':['低模为180面多面体，球面最大偏差约4毫米','未做滚动动画'],'previews':[]}
scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.world.color=(.28,.28,.28);scene.view_settings.view_transform='AgX';scene.render.resolution_x=scene.render.resolution_y=480
center=Vector((0,0,RADIUS))
for loc,power in [((3,-4,6),300),((-4,-1,4),220),((0,4,5),260),((0,-2,-4),100)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=4;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=RADIUS*2.45;scene.camera=cam
for name,dv in [('front',(0,-1,0)),('back',(0,1,0)),('left',(-1,0,0)),('right',(1,0,0)),('top',(0,0,1)),('bite',tuple(bite))]:
 cam.location=center+Vector(dv).normalized()*2;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();p=V/f'ball-final-{name}.png';scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);report['previews'].append(p.name)
(V/'ball.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('BALL_COMPLETE',json.dumps(report,ensure_ascii=False))
