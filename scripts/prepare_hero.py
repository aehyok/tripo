"""Normalize the existing rig and author in-place clips in isolated Blender.
Blender --background --factory-startup --python scripts/prepare_hero.py
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'assets/models/raw/hero_xiaonian_rigged_tripo.glb'
REVIEW=ROOT/'assets/models/review'
OUT=ROOT/'public/assets/models/hero_xiaonian.glb'
BLEND=ROOT/'assets/models/blender/hero_xiaonian.blend'
FPS=40
# Brisk walk matched to TUNING.walkSpeed: 0.66 m steps, two steps per 0.6 s cycle.
WALK_SPEED=2.2;STEP=.66;WALK_CYCLE=2*STEP/WALK_SPEED
# Run shares the walk cycle so the game can switch gaits without a foot-phase jump: 1.32 m steps with a short flight.
RUN_SPEED=4.4;RUN_CYCLE=WALK_CYCLE;RUN_DUTY=.25;RUN_EXCURSION=RUN_SPEED*RUN_DUTY*RUN_CYCLE
for p in [REVIEW,OUT.parent,BLEND.parent]:p.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(RAW))
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.fps=FPS
rig=next(o for o in scene.objects if o.type=='ARMATURE')
mesh=next(o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers))
for o in [mesh,rig]:mat=o.matrix_world.copy();o.parent=None;o.matrix_world=mat
points=[mesh.matrix_world@v.co for v in mesh.data.vertices]
lo=Vector([min(v[i] for v in points) for i in range(3)]);hi=Vector([max(v[i] for v in points) for i in range(3)])
scale=1.55/(hi.z-lo.z)
M=Matrix.Diagonal((scale,scale,scale,1))@Matrix.Translation(Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z)))
for o in [mesh,rig]:o.data.transform(M@o.matrix_world);o.matrix_world=Matrix.Identity(4)
mesh.parent=rig
for o in list(scene.objects):
 if o not in [mesh,rig]:bpy.data.objects.remove(o,do_unlink=True)
mesh.name='hero_xiaonian';rig.name='xiaonian_rig'
rig.animation_data_clear()
for b in rig.pose.bones:b.rotation_mode='QUATERNION';b.custom_shape=None
B=lambda name:rig.pose.bones['mixamorig:'+name]
rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
feet={side:B(side+'Foot').bone.head_local.copy() for side in ['Left','Right']}
toes={side:B(side+'ToeBase').bone.head_local.copy() for side in ['Left','Right']}
TOE_OFF=math.radians(35);MID_DROP=-.006;STRIDE_BIAS=0
smooth=lambda x:(lambda c:c*c*(3-2*c))(max(0,min(1,x)))
def walk_foot(side,u):
 # Stance foot slides back under the body and peels its heel up around the toe ball before swing.
 if u<.5:y=STEP*(2*u-.5);lift=0;pitch=TOE_OFF*smooth((u-.3)/.2)
 else:f=(u-.5)*2;y=STEP*(.5-f);lift=.06*math.sin(math.pi*f);pitch=TOE_OFF*(1-smooth(f/.5))
 heel=toes[side]-feet[side];r=Quaternion((1,0,0),pitch)
 return feet[side]+Vector((0,y+STRIDE_BIAS,lift))+heel-r@heel,r
def walk_drop(phase):
 # Lower the hips only as far as both legs need to reach their targets.
 need=MID_DROP
 for side,offset in [('Left',0),('Right',.5)]:
  upper=B(side+'UpLeg').bone;H=upper.head_local;A=walk_foot(side,(phase+offset)%1)[0];L=.975*(upper.length+B(side+'Leg').bone.length)
  need=min(need,A.z-H.z+math.sqrt(max(0,L*L-(A.x-H.x)**2-(A.y-H.y)**2)))
 return need
# Feet land closer in front than they push off behind; pick the stride offset that keeps the hips highest.
def lowest_drop(bias):
 global STRIDE_BIAS;STRIDE_BIAS=bias;return min(walk_drop(i/120) for i in range(120))
STRIDE_BIAS=max((i/1000 for i in range(-100,151,2)),key=lowest_drop)
WALK_DROPS=[walk_drop(i/240) for i in range(240)]
RUN_TOE_OFF=math.radians(40);RUN_HIGH=-.03;RUN_AMP=.05;RUN_BIAS=0
def run_foot(side,u):
 # Short stance under the body, then a high heel kick behind and a forward reach before the next contact.
 if u<RUN_DUTY:c=u/RUN_DUTY;y=RUN_EXCURSION*(c-.5);lift=0;pitch=RUN_TOE_OFF*smooth((c-.6)/.4)
 else:f=(u-RUN_DUTY)/(1-RUN_DUTY);y=RUN_EXCURSION*(.5-smooth(f))+.2*math.sin(math.pi*f)*(1-f);lift=.24*math.sin(math.pi*f);pitch=RUN_TOE_OFF*(1-smooth(f/.4))
 heel=toes[side]-feet[side];r=Quaternion((1,0,0),pitch)
 return feet[side]+Vector((0,y+RUN_BIAS,lift))+heel-r@heel,r
def run_drop(phase):
 # Hips sink while a foot is planted and rise through the flight, never lower than the legs need.
 bump=0;need=0
 for side,offset in [('Left',0),('Right',.5)]:
  u=(phase+offset)%1
  if u<RUN_DUTY:bump=max(bump,math.sin(math.pi*u/RUN_DUTY))
  upper=B(side+'UpLeg').bone;H=upper.head_local;A=run_foot(side,u)[0];L=.97*(upper.length+B(side+'Leg').bone.length)
  need=min(need,A.z-H.z+math.sqrt(max(0,L*L-(A.x-H.x)**2-(A.y-H.y)**2)))
 return min(RUN_HIGH-RUN_AMP*bump,need)
def lowest_run_drop(bias):
 global RUN_BIAS;RUN_BIAS=bias;return min(run_drop(i/120) for i in range(120))
RUN_BIAS=max((i/1000 for i in range(-100,151,2)),key=lowest_run_drop)
RUN_DROPS=[run_drop(i/240) for i in range(240)]
# Keep the skin and all original weights; no decimation is needed at 14,240 tris.
weight_errors=[]
for v in mesh.data.vertices:
 weights=[g.weight for g in v.groups if mesh.vertex_groups[g.group].name in rig.data.bones]
 if not weights or abs(sum(weights)-1)>1e-3:weight_errors.append(v.index)
assert not weight_errors, f'Unnormalized or missing weights: {weight_errors[:10]}'

def rotate(name,axis,degrees):
 b=B(name);q=b.bone.matrix_local.to_quaternion()
 b.rotation_quaternion=q.inverted()@Quaternion(axis,math.radians(degrees))@q

def direction(name,head,tail):
 b=B(name);bone=b.bone
 q=(bone.tail_local-bone.head_local).rotation_difference(tail-head)@bone.matrix_local.to_quaternion()
 b.matrix=Matrix.LocRotScale(head,q,Vector((1,1,1)))

def pose(kind,t):
 for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
 phase=t/(RUN_CYCLE if kind=='run' else WALK_CYCLE)
 crouch=1.0 if kind=='crouch' else 0.0
 if kind in ['crouch_down','crouch_up']:
  u=max(0,min(1,t/.25));u=u*u*(3-2*u);crouch=u if kind=='crouch_down' else 1-u
 walk=kind=='walk';run=kind=='run';gait=walk or run
 breath_t=0 if kind in ['crouch_down','crouch_up'] else t
 drop=walk_drop(phase) if walk else run_drop(phase) if run else -.008+.003*math.sin(math.pi*breath_t)
 drop=drop*(1-crouch)-.28*crouch
 hips=B('Hips');hips.matrix=Matrix.Translation(Vector((0,.08*crouch,drop)))@rest[hips.name]
 rotate('Spine',(1,0,0),4*walk+12*run+10*crouch+(.6*math.sin(math.pi*breath_t) if not gait else 0))
 rotate('Head',(0,0,1),.8*math.sin(math.pi*breath_t) if not gait else .5*math.sin(2*math.pi*phase))
 for side,sign in [('Left',1),('Right',-1)]:
  base=Quaternion((0,1,0),math.radians(sign*15))
  swing=(20*sign*math.cos(2*math.pi*phase)) if walk else (40*sign*math.cos(2*math.pi*phase)) if run else 1.2*math.sin(math.pi*breath_t)*sign
  swing=swing*(1-crouch)-30*crouch
  b=B(side+'Arm');q=b.bone.matrix_local.to_quaternion()
  b.rotation_quaternion=q.inverted()@(Quaternion((1,0,0),math.radians(swing))@base)@q
  rotate(side+'ForeArm',(1,0,0),-75 if run else -8*(1-crouch)-25*crouch)
 bpy.context.view_layer.update()
 # Analytic two-bone IK with a forward knee plane; flat feet stay planted until toe-off.
 for side,offset in [('Left',0),('Right',.5)]:
  u=(phase+offset)%1
  foot,pitch=walk_foot(side,u) if walk else run_foot(side,u) if run else (feet[side].copy(),Quaternion())
  upper=B(side+'UpLeg');lower=B(side+'Leg')
  H=upper.head.copy();d=foot-H;distance=d.length
  L1=upper.bone.length;L2=lower.bone.length
  distance=min(distance,L1+L2-.00001)
  axis=d.normalized();a=(L1*L1-L2*L2+distance*distance)/(2*distance)
  forward=Vector((0,-1,0));plane=(forward-axis*forward.dot(axis)).normalized()
  K=H+axis*a+plane*math.sqrt(max(0,L1*L1-a*a))
  direction(side+'UpLeg',H,K);bpy.context.view_layer.update()
  direction(side+'Leg',K,foot);bpy.context.view_layer.update()
  b=B(side+'Foot');b.matrix=Matrix.LocRotScale(foot,pitch@b.bone.matrix_local.to_quaternion(),Vector((1,1,1)));bpy.context.view_layer.update()
  # Toes bend at the ball and stay flat on the street while the heel lifts.
  t=B(side+'ToeBase');t.matrix=Matrix.LocRotScale(t.head.copy(),t.bone.matrix_local.to_quaternion(),Vector((1,1,1)))
 bpy.context.view_layer.update()
 # Correct millimetre-scale sole deformation after IK so no pose enters ground; the run keeps its flight.
 if run:return
 ev=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());data=ev.to_mesh()
 minimum=min(v.co.z for v in data.vertices);ev.to_mesh_clear()
 hips.matrix=Matrix.Translation(Vector((0,0,-minimum)))@hips.matrix
 bpy.context.view_layer.update()

clips={'idle':2.0,'walk':WALK_CYCLE,'run':RUN_CYCLE,'crouch':2.0,'crouch_down':.25,'crouch_up':.25}
actions={}
for name,duration in clips.items():
 action=bpy.data.actions.new(name);action.use_fake_user=True
 rig.animation_data_create();rig.animation_data.action=action
 for f in range(round(duration*FPS)+1):
  scene.frame_set(f);pose(name,f/FPS)
  for b in rig.pose.bones:
   b.keyframe_insert(data_path='location',frame=f,group=b.name)
   b.keyframe_insert(data_path='rotation_quaternion',frame=f,group=b.name)
   b.keyframe_insert(data_path='scale',frame=f,group=b.name)
 actions[name]=action
rig.animation_data.action=None
for name,action in actions.items():
 track=rig.animation_data.nla_tracks.new();track.name=name
 strip=track.strips.new(name,0,action);strip.action_frame_start=0;strip.action_frame_end=round(clips[name]*FPS)
 strip.extrapolation='NOTHING'
# NLA tracks are alternatives, not additive layers. Mute while reviewing poses;
# the exporter exports each track independently.
for track in rig.animation_data.nla_tracks:track.mute=True
pose('idle',0)
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
# Temporarily unmute for NLA export and restore afterwards.
for track in rig.animation_data.nla_tracks:track.mute=False
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,
 export_yup=True,export_apply=False,export_texcoords=True,export_normals=True,export_tangents=True,
 export_materials='EXPORT',export_animations=True,export_animation_mode='NLA_TRACKS',
 export_force_sampling=True,export_frame_range=False,export_frame_step=1,
 export_cameras=False,export_lights=False,export_extras=False,
 export_draco_mesh_compression_enable=False)
for track in rig.animation_data.nla_tracks:track.mute=True
# Inspect evaluated deformation, not just skin metadata.
audit={}
for name,duration in clips.items():
 low=1e9;high=-1e9;max_edge=0;max_foot_error=0
 for f in range(round(duration*FPS)+1):
  pose(name,f/FPS)
  deps=bpy.context.evaluated_depsgraph_get();ev=mesh.evaluated_get(deps);data=ev.to_mesh()
  low=min(low,min(v.co.z for v in data.vertices));high=max(high,max(v.co.z for v in data.vertices))
  max_edge=max(max_edge,max((data.vertices[e.vertices[0]].co-data.vertices[e.vertices[1]].co).length for e in data.edges))
  ev.to_mesh_clear()
  for side,phaseoffset in [('Left',0),('Right',.5)]:
   u=(f/FPS/WALK_CYCLE+phaseoffset)%1
   # Gait stance is judged at the toe ball, which stays down while the heel peels off.
   if name not in ('walk','run'):max_foot_error=max(max_foot_error,abs(B(side+'Foot').head.z-feet[side].z))
   elif u<(.5 if name=='walk' else RUN_DUTY):max_foot_error=max(max_foot_error,abs(B(side+'ToeBase').head.z-toes[side].z))
 audit[name]={'duration_s':duration,'min_mesh_z':low,'max_mesh_z':high,'max_edge_m':max_edge,'planted_ankle_z_error_m':max_foot_error}
 assert low>-.02 and max_edge<.3, (name,audit[name])
print('DEFORMATION',json.dumps(audit))
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=600;scene.render.resolution_y=760;scene.render.resolution_percentage=100
scene.world.color=(.18,.18,.18);scene.view_settings.view_transform='AgX';center=Vector((0,0,.775))
for loc,power,size in [((2,-3,4),180,3),((-2,-1,2),90,2),((0,3,3),170,2)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=1.9;scene.camera=cam
previews=[]
for kind,t,label,d in [('idle',0,'front',(0,-1,.05)),('idle',0,'back',(0,1,.05)),('idle',0,'side',(1,0,.05)),('idle',0,'threequarter',(.65,-1,.25)),('walk',0,'walk-0',(.65,-1,.1)),('walk',WALK_CYCLE/4,'walk-1',(.65,-1,.1)),('walk',WALK_CYCLE/2,'walk-2',(.65,-1,.1)),('walk',WALK_CYCLE*3/4,'walk-3',(.65,-1,.1)),('walk',WALK_CYCLE/4,'walk-side-1',(1,0,.05)),('walk',0,'walk-side-0',(1,0,.05)),('run',0,'run-side-0',(1,0,.05)),('run',RUN_CYCLE*.125,'run-side-1',(1,0,.05)),('run',RUN_CYCLE*.25,'run-side-2',(1,0,.05)),('run',RUN_CYCLE*.375,'run-side-3',(1,0,.05)),('run',RUN_CYCLE*.125,'run-quarter',(.65,-1,.1)),('crouch',0,'crouch-front',(0,-1,.05)),('crouch',0,'crouch-side',(1,0,.05)),('crouch_down',.125,'transition',(.65,-1,.1))]:
 pose(kind,t);cam.location=center+Vector(d)*4;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();path=REVIEW/f'hero-final-{label}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);previews.append(path.name)
report={'asset':'小年','date':'2026-11-04','stage':'Blender修整与动画','source':'../raw/hero_xiaonian_rigged_tripo.glb','source_sha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),'file':'../../../public/assets/models/hero_xiaonian.glb','blend':'../blender/hero_xiaonian.blend','height_m':1.55,'front_blender':'-Y','rig_joint_count':len(rig.data.bones),'weights_errors':len(weight_errors),'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'clips':clips,'animation_reference_speed_mps':WALK_SPEED,'walk_step_m':STEP,'walk_hip_drop_m':{'lowest':round(min(WALK_DROPS),4),'highest':round(max(WALK_DROPS),4)},'walk_toe_off_deg':35,'walk_stride_bias_m':STRIDE_BIAS,'run_reference_speed_mps':RUN_SPEED,'run_step_m':RUN_SPEED*RUN_CYCLE/2,'run_duty':RUN_DUTY,'run_hip_drop_m':{'lowest':round(min(RUN_DROPS),4),'highest':round(max(RUN_DROPS),4)},'run_stride_bias_m':RUN_BIAS,'deformation':audit,'previews':previews,'notes':['保留原始65关节与权重，未减面','原地步态：站立脚锁地、摆动脚抬起；0.25秒蹲下/站起过渡','身高按未摆动的原始站姿标定1.55米；动画有自然起伏','内部壳未自动删除；手指保留原姿势，未制作手部表情动画']}
(REVIEW/'hero_xiaonian.manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('HERO_PREPARED',json.dumps(report,ensure_ascii=False))
