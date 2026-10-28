"""Source-audited revision of the NASA launch display asset in an isolated Blender process.
Run: blender --background --factory-startup --python modeling/deep-launch.py -- --work /absolute/repair/folder
Original GLB and the four spacecraft views are never overwritten.
"""
import bpy, bmesh, json, math, sys, argparse, hashlib
from pathlib import Path
from mathutils import Vector, Matrix
args=argparse.ArgumentParser();args.add_argument('--work',required=True)
opt=args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
repo=Path(__file__).resolve().parents[1];work=Path(opt.work);work.mkdir(parents=True,exist_ok=True)
source=repo/'assets/saturn-v-nasa.glb';out=repo/'assets/saturn-v-apollo11-repaired.glb'
# Only the known factory startup objects in this isolated new process are removed.
assert sorted((o.name,o.type) for o in bpy.context.scene.objects)==[('Camera','CAMERA'),('Cube','MESH'),('Light','LIGHT')]
for o in list(bpy.context.scene.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(source))
original=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(original)==22
collection=bpy.data.collections.new('COL-Apollo11-Launch-Repair');bpy.context.scene.collection.children.link(collection)
root=bpy.data.objects.new('GEO-Apollo11-SaturnV-Repaired',None);collection.objects.link(root)
root['credit']='Derived from NASA / Michael D. Carbajal. Repairs and dimensional registration documented in launch-repair-report.json.'
root['strict_drawing_match']=False
# Source-mesh stations are registered independently to published dimensions.
# Z stations: first stage / second stage / S-IVB / IU / SLA / SM / CM.
# Vehicle station datum is inches; z=0 is the nominal F-1 exit plane, STA -115.
# SA-506 Fig 5-1 / 5-19 establish 1541, 1564, 1760, 2519 and 2746.5.
# The .555 upper station precision comes from the SA-501 aerodynamic model drawing,
# not a claim of manufacturing precision for SA-506. See source-audit.json.
INCH=.0254
def sta(v):return (v+115)*INCH
sivb_top=sta(3222.555);iu_top=sta(3258.555);sla_top=iu_top+336*INCH
sm_top=sla_top+178*INCH;cm_top=sm_top+137*INCH
stations=[(-.1408900022506714,0),(.27979,sta(48.5)),(4.8624,sta(1541)),
 (5.46794,sta(1760)),(7.74221,sta(2519)),(8.42669,sta(2746.5)),
 (10.08212,sivb_top),(10.19147,iu_top),(11.00630,sla_top),
 (11.50325,sm_top),(11.69240,cm_top)]
def interp(table,z):
 if z<=table[0][0]:return table[0][1]
 for (a,b),(c,d) in zip(table,table[1:]):
  if z<=c:return b+(d-b)*(z-a)/(c-a)
 return table[-1][1]
raw_r=[(0,.6199038),(7.7422,.6199038),(8.4267,.426976),(10.1915,.426976),(11.0063,.224594),(11.5032,.224594),(11.6924,.055226)]
new_r=[(0,33*.3048/2),(7.7422,33*.3048/2),(8.4267,260*.0254/2),(10.1915,260*.0254/2),(11.0063,154*.0254/2),(11.5032,154*.0254/2),(11.6924,.48)]
axis=Vector((-.010494,-.743011,0))
def point(p):
 k=interp(new_r,p.z)/interp(raw_r,p.z)
 return Vector(((p.x-axis.x)*k,(p.y-axis.y)*k,interp(stations,p.z)))
# Preserve source placement of engine fairings and derive engine centers from the source.
old_engine_names=['polySurfa1','polySurfa2','polySurfa3','polySurfa4','polySurfac']
centers=[]
for name in old_engine_names:
 o=bpy.data.objects[name];pts=[o.matrix_world@Vector(c) for c in o.bound_box];p=(sum(pts,Vector())/8);c=point(p);centers.append((c.x,c.y));bpy.data.objects.remove(o,do_unlink=True)
for o in [o for o in bpy.context.scene.objects if o.type=='MESH']:
 # Bake imported transforms, remove the obsolete solid escape-tower approximation.
 ps=[o.matrix_world@v.co for v in o.data.vertices]
 o.parent=None;o.matrix_world=Matrix.Identity(4)
 for v,p in zip(o.data.vertices,ps):v.co=p
 if o.name=='pCylinder1':
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z>11.6925],context='VERTS');bm.to_mesh(o.data);bm.free()
  # Preserve the source UV/material sectors, subdivide linearly, then restore
  # circular section radii. A smoothing modifier alone would shrink the cylinder.
  radii={}
  for v in o.data.vertices:
   key=round(v.co.z,4);rr=((v.co.x-axis.x)**2+(v.co.y-axis.y)**2)**.5
   radii[key]=max(radii.get(key,0),rr)
  rt=sorted(radii.items());bpy.context.view_layer.objects.active=o;o.select_set(True)
  mod=o.modifiers.new('Source-circle-refinement','SUBSURF');mod.subdivision_type='SIMPLE';mod.levels=2
  bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
  for v in o.data.vertices:
   d=Vector((v.co.x-axis.x,v.co.y-axis.y,0))
   if d.length>.03:
    d.normalize();rr=interp(rt,v.co.z);v.co.x=axis.x+d.x*rr;v.co.y=axis.y+d.y*rr
  for face in o.data.polygons:face.use_smooth=True
 for v in o.data.vertices:v.co=point(v.co)
 o.name='GEO-NASA-'+o.name;o.parent=root
 for c in list(o.users_collection):c.objects.unlink(o)
 collection.objects.link(o);o.data.update()
# Repair the blue background in the flag texture, retaining the flag rectangles.
from array import array
flag_material=bpy.data.materials.get('blinn8SG')
image_node=next(n for n in flag_material.node_tree.nodes if n.type=='TEX_IMAGE')
img=image_node.image;w,h=img.size;pixels=array('f',[0.0])*(w*h*4);img.pixels.foreach_get(pixels)
# Detect non-background columns/rows rather than altering the flag canton.
bg=tuple(pixels[:3]);changed=[]
for y in range(h):
 for x in range(w):
  i=(y*w+x)*4
  if max(abs(pixels[i+k]-bg[k]) for k in range(3))>.08:changed.append((x,y))
assert changed
cols=sorted(set(x for x,y in changed));intervals=[]
for x in cols:
 if not intervals or x>intervals[-1][1]+2:intervals.append([x,x])
 else:intervals[-1][1]=x
lo_y=min(y for x,y in changed)-2;hi_y=max(y for x,y in changed)+2
for y in range(h):
 for x in range(w):
  if lo_y<=y<=hi_y and any(a-2<=x<=b+2 for a,b in intervals):continue
  i=(y*w+x)*4;pixels[i:i+3]=array('f',[.92,.92,.92])
repaired_image=bpy.data.images.new('Apollo11-flags-white-field',width=w,height=h,alpha=True)
repaired_image.pixels.foreach_set(pixels);repaired_image.filepath_raw=str(work/'flags-white-field.png');repaired_image.file_format='PNG';repaired_image.save();repaired_image.pack();image_node.image=repaired_image
# Matte paint, readable black areas, restrained metal reflections.
for mat in bpy.data.materials:
 if not mat.use_nodes:continue
 p=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
 if not p:continue
 p.inputs['Roughness'].default_value=.74
 p.inputs['Metallic'].default_value=0
 if 'Specular IOR Level' in p.inputs:p.inputs['Specular IOR Level'].default_value=.24
 if mat.name in ['blinn2SG','fin_blinn2SG']:p.inputs['Base Color'].default_value=(.012,.016,.021,1)
 elif mat.name in ['blinn1SG','fin_blinn1SG']:p.inputs['Base Color'].default_value=(.84,.85,.84,1)
 elif mat.name=='blinn6SG':p.inputs['Base Color'].default_value=(.40,.42,.44,1);p.inputs['Metallic'].default_value=.55;p.inputs['Roughness'].default_value=.56

def material(name,col,metal=0,rough=.65):
 m=bpy.data.materials.new('MAT-'+name);m.use_nodes=True;p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if 'Specular IOR Level' in p.inputs:p.inputs['Specular IOR Level'].default_value=.28
 return m
white=material('LES-painted-white',(.83,.85,.84));metal=material('F1-shell',(.29,.31,.33),.65,.53);rib=material('F1-bands',(.39,.40,.41),.65,.48);inside=material('F1-nozzle-interior',(.045,.048,.05),.25,.85);dark=material('LES-dark',(.025,.03,.035),.3,.7)
def mesh(name,verts,faces,mat,parent=root):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);collection.objects.link(o);o.parent=parent;o.data.materials.append(mat)
 for p in d.polygons:p.use_smooth=True
 return o

def lathe(name,profile,mat,parent=root,n=64):
 verts=[(r*math.cos(2*math.pi*j/n),r*math.sin(2*math.pi*j/n),z) for r,z in profile for j in range(n)]
 faces=[]
 for i in range(len(profile)-1):
  for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
 return mesh(name,verts,faces,mat,parent)
def cylinder(name,a,b,r,mat,parent=root,n=16):
 a,b=Vector(a),Vector(b);d=b-a;o=lathe(name,[(0,0),(r,0),(r,d.length),(0,d.length)],mat,parent,n);o.location=a;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o

def ring(name,r,z,t,mat,parent=root):
 profile=[(r+t*math.cos(i*2*math.pi/10),z+t*math.sin(i*2*math.pi/10)) for i in range(11)]
 return lathe(name,profile,mat,parent)
# Five hollow F-1 bells; center + four outboard engines, upper machinery partly inside thrust structure.
f1_groups=[];exit_r=140*.0254/2;throat_r=35*.0254/2;nozzle_l=158*.0254;engine_h=19.2*.3048
# NASA SP-8120 Table1 constrains INNER flow-surface throat/exit and axial length.
# Intermediate samples remain an explicitly approximate curve, not a certified contour.
old_bell=[(1.8288,0),(1.78,.22),(1.68,.50),(1.53,.85),(1.35,1.20),(1.15,1.58),(.94,1.96),(.75,2.34),(.59,2.70),(.47,3.02)]
bell=[(throat_r+(r-.47)/(1.8288-.47)*(exit_r-throat_r),z/3.02*nozzle_l) for r,z in old_bell]
wall=.035 # display shell only; no manufacturing wall-thickness assertion
for i,(x,y) in enumerate(centers,1):
 g=bpy.data.objects.new('GEO-F1-engine-'+str(i),None);collection.objects.link(g);g.parent=root;g.location=(x,y,0);g['part']='F-1';f1_groups.append(g)
 outer=lathe('GEO-F1-bell-outer-'+str(i),[(r+wall,z) for r,z in bell],metal,g)
 inner=lathe('GEO-F1-bell-inner-'+str(i),list(reversed(bell)),inside,g)
 ring('GEO-F1-exit-rim-'+str(i),exit_r+wall/2,wall/2,wall/2,rib,g)
 lathe('GEO-F1-exit-wall-'+str(i),[(exit_r+wall,0),(exit_r,0)],rib,g)
 # Photo-derived nozzle bands: spacing and full contour remain explicitly approximate.
 for j,z in enumerate([.22,.46,.72,.98,1.25,1.52,1.80,2.09,2.36,2.62]):
  z=z/3.02*nozzle_l;rr=interp([(zz,rr) for rr,zz in bell],z)+wall;ring('GEO-F1-band-'+str(i)+'-'+str(j),rr,z,.023,rib,g)
 ring('GEO-F1-exhaust-manifold-'+str(i),1.43,1.4/3.02*nozzle_l,.10,rib,g)
 lathe('GEO-F1-chamber-'+str(i),[(throat_r+wall,nozzle_l),(.60,4.45),(.60,4.95),(.48,5.15),(0,5.15)],metal,g)
 cylinder('GEO-F1-turbopump-'+str(i),(.75,0,4.65),(.75,0,5.72),.38,metal,g)
 for side in [-1,1]:cylinder('GEO-F1-feed-'+str(i)+'-'+str(side),(side*.80,.25,4.15),(side*.80,.25,5.68),.13,rib,g)
 cylinder('GEO-F1-mount-'+str(i),(0,0,5.15),(0,0,215.5*.0254),.38,metal,g)
# Source dimensioned LES truss: 10 ft high; 4 ft square base / 3 ft square top.
base_z=101.22+(iu_top-85.58784);tower_h=10*.3048;base_half=4*.3048/2;top_half=3*.3048/2
corners=[(-1,-1),(1,-1),(1,1),(-1,1)]
def truss_point(c,t):
 half=base_half+(top_half-base_half)*t
 return Vector((c[0]*half,c[1]*half,base_z+tower_h*t))
for i,c in enumerate(corners):
 cylinder('GEO-LES-main-leg-'+str(i),truss_point(c,0),truss_point(c,1),.04445,white)
 for k in range(3):
  a=k/3;b=(k+1)/3;cc=corners[(i+1)%4]
  cylinder('GEO-LES-cross-'+str(i)+'-'+str(k)+'a',truss_point(c,a),truss_point(cc,b),.03175,white)
  cylinder('GEO-LES-cross-'+str(i)+'-'+str(k)+'b',truss_point(cc,a),truss_point(c,b),.03175,white)
 for t in [0,1/3,2/3,1]:cylinder('GEO-LES-frame-'+str(i)+'-'+str(t),truss_point(c,t),truss_point(corners[(i+1)%4],t),.03175,white)
mt=base_z+tower_h;motor_r=26*.0254/2;motor_top=mt+185.6*.0254
lathe('GEO-LES-motor',[(0,mt),(motor_r,mt),(motor_r,motor_top),(0,motor_top)],white)
# Main motor overall diameter/length are sourced; nose and nozzle contour use source illustration proportions.
lathe('GEO-LES-nose',[(motor_r,motor_top),(motor_r*.94,motor_top+.25),(.25,motor_top+.76),(.08,110.54),(0,110.6424)],white)
for i in range(4):
 a=i*math.pi/2+math.pi/4
 exit=Vector((.58*math.cos(a),.58*math.sin(a),mt-.24));top=Vector((.20*math.cos(a),.20*math.sin(a),mt+.48));d=top-exit
 o=lathe('GEO-LES-canted-nozzle-'+str(i),[(.16,0),(.12,.22),(.065,d.length)],dark,n=24);o.location=exit;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
for z in [motor_top-.35,motor_top-.15]:ring('GEO-LES-nose-joint',motor_r,z,.012,white)
# Structural validation uses actual transformed geometry.
bpy.context.view_layer.update()
objects=[o for o in collection.objects if o.type=='MESH']
for o in objects:
 assert all(math.isfinite(c) for v in o.data.vertices for c in v.co),o.name
 if o.name.startswith('GEO-F1'):
  o['evidence_status']='provisional; not SA506 drawing certified'
  o['evidence']='NASA SP8120 Table1 inner throat35in / exit140in / length158in; approximate intermediate contour and installation'
 elif o.name.startswith('GEO-LES'):
  o['evidence_status']='nominal dimensions; joint geometry unverified'
  o['evidence']='CSM News Reference p140; height10ft, base4ft, top3ft; transverse braces approximate'
 else:
  o['evidence_status']='mixed: core interfaces constrained; display detail unverified'
  o['evidence']='SA506 Fig5-1/5-19, Apollo11 Press Kit; NASA display-model surface details'
 o['audit']='launch-source-audit.json'
main=bpy.data.objects['GEO-NASA-pCylinder1']
def station_diameter(raw_z):
 zz=interp(stations,raw_z);vs=[v.co for v in main.data.vertices if abs(v.co.z-zz)<.002];assert vs
 return max(v.x for v in vs)-min(v.x for v in vs)
checks=[]
def check(name,actual,target,basis,status='source_constraint'):
 checks.append({'name':name,'actual_m':actual,'target_m':target,'error_m':abs(actual-target),
 'implementation_tolerance_m':.004,'pass':abs(actual-target)<.004,'basis':basis,'evidence_status':status,
 'note':'Numerical agreement checks implementation only; it does not certify historical fidelity.'})
check('S-IC主体直径',station_diameter(2.75422),396*INCH,'SA-506 Fig 1-3 / NASA-CR-1539 Fig 1-1')
check('S-II主体直径',station_diameter(7.39670),396*INCH,'SA-506 Fig 5-1')
check('S-IVB主体直径',station_diameter(9.54207),260*INCH,'NASA-CR-1539 Fig 1-1; nominal 21.7 ft in SA-506')
check('服务舱主体直径',station_diameter(11.37920),154*INCH,'Apollo 11 Press Kit PDF p93')
check('S-II顶端站位2519',interp(stations,7.74221),sta(2519),'SA-506 Fig 5-1 / Fig 5-19')
check('S-II/S-IVB分离面2746.5',interp(stations,8.42669),sta(2746.5),'SA-506 Fig 5-19 / text p5-25')
check('仪器舱高度',iu_top-sivb_top,36*INCH,'SA-506 Fig 1-3, IU = 3 ft')
check('适配器高度',sla_top-iu_top,336*INCH,'Apollo 11 Press Kit: 28 ft adapter')
check('逃逸塔桁架高度',tower_h,120*INCH,'CSM News Reference p140: nominal 10 ft')
pts=[o.matrix_world@v.co for o in objects for v in o.data.vertices];height=max(v.z for v in pts)-min(v.z for v in pts)
check('整箭标称总高',height,363*.3048,'Apollo 11 Press Kit / SA-506 Fig1-3: nominal 363 ft')
core_stations=[{'station_in':v,'z_m':sta(v),'source':'SA-506 Fig5-1/5-19' if v in [1541,1564,1760,2519,2746.5] else 'NASA-CR-1539 / TM-X-53770 (generic/SA-501)'} for v in [48.5,1541,1564,1760,2519,2746.5,3222.555,3258.555]]
report={'version':'deep-20261028-1','source_model':{'file':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()},
 'units':'metres','coordinate_contract':{'axis':'Z-up engineering scene; Y-up GLB','origin':'Nominal F1 exit plane, vehicle STA -115 in','station_to_z':'(station_in + 115) × 0.0254','rounding':'Upper .555 stations are generic SA-501 references; not SA-506 manufacturing tolerance'},
 'checks':checks,'stations':core_stations,
 'stages_z_m':{'S-IC':[0,sta(1564)],'S-II':[sta(1564),sta(2746.5)],'S-IVB':[sta(2746.5),sivb_top],'IU':[sivb_top,iu_top],'SLA':[iu_top,sla_top],'SM':[sla_top,sm_top],'CM':[sm_top,cm_top],'LES':[base_z,110.6424]},
 'counts':{'F1_engines':len(f1_groups),'open_F1_bells':sum(o.name.startswith('GEO-F1-bell-inner-') for o in objects),'LES_primary_legs':sum(o.name.startswith('GEO-LES-main-leg-') for o in objects)},
 'F1_dimensions':{'height_m':engine_h,'internal_exit_diameter_m':2*exit_r,'internal_throat_diameter_m':2*throat_r,'throat_to_exit_m':nozzle_l,'display_wall_m':wall,'basis':'NASA SP-8120 Table1, PDF20 printed6: throat35in, exit140in, length158in. R3896-1 Fig2-22 envelope gimbal-to-exit215.5in, page dated10Aug1967. Individual SA506 engine applicability still unverified.','nozzle_contour':'Approximate intermediate contour constrained by engineering throat/exit/axial length; NOT a manufacturing contour','centers':'NASA display model locations retained; actual mounting coordinates remain unverified'},
 'repairs':['Absolute station registration for core interfaces, with overlap and datum stated','S-II/S-IVB cone ends at station2746.5, rather than a fraction of accumulated nominal length','Circular section refinement with original UV sectors retained','F1 exit no longer takes the 12 ft engine envelope as its nozzle dimension','All historical confidence separated from numerical self-consistency'],
 'strict_drawing_match':False,
 'gates':{'core_station_implementation':'pass','engine_installation':'unverified','LES_joint_coordinates':'unverified','LM5_stowed_packaging':'unverified','independent_multiview_fidelity':'unverified'},
 'remaining':['F1 nominal engineering exit140in differs from early139in sheet and nearly14ft Apollo11 press text; precise SA506 configuration unresolved','F1 contour, feed-line geometry and mounting coordinates remain approximate','LES support feet, crossmember topology and nose profile require dimensioned assembly drawing','Generic SA501 upper station precision is not an as-built SA506 spacecraft survey','Photographic comparison is qualitative; full camera calibration and multiview registration pending','LM5 folded joint geometry is not fabricated; original NASA cutaway retained']}
assert all(c['pass'] for c in checks),checks
assert report['counts']=={'F1_engines':5,'open_F1_bells':5,'LES_primary_legs':4}
(work/'repair-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');(repo/'assets/launch-repair-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
# Save only this task's new source file; package all texture images for portability.
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
for image in bpy.data.images:
 if image.source=='FILE' and not image.packed_file:
  try:image.pack()
  except RuntimeError:pass
bpy.ops.object.select_all(action='DESELECT')
for o in collection.objects:o.select_set(True)
bpy.context.view_layer.objects.active=root
# Known formats verified through current Blender's operator RNA.
import io_scene_gltf2
formats=[i[0] for i in io_scene_gltf2.get_format_items(scene,bpy.context)];assert 'GLB' in formats
image_formats=[i.identifier for i in bpy.ops.export_scene.gltf.get_rna_type().properties['export_image_format'].enum_items];assert 'AUTO' in image_formats
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='AUTO',export_extras=True)
bpy.ops.wm.save_as_mainfile(filepath=str(work/'saturn_deep_v002.blend'))
print('REPAIR_RESULT',json.dumps({'checks':checks,'counts':report['counts'],'objects':len(objects),'glb_bytes':out.stat().st_size},ensure_ascii=False))
