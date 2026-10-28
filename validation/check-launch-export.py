"""Independent GLB reimport checks. Run in a fresh Blender factory process.

Reference values are transcribed here from the cited documents, not read from
the generator or its report. This tests the exported geometry, not history.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector

repo=Path(__file__).resolve().parents[1]
work=Path(sys.argv[sys.argv.index('--')+1])
assert sorted(o.name for o in bpy.context.scene.objects)==['Camera','Cube','Light']
for o in list(bpy.context.scene.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(repo/'assets/saturn-v-apollo11-repaired.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
main=bpy.data.objects['GEO-NASA-pCylinder1']
points=[main.matrix_world@v.co for v in main.data.vertices]
checks=[]
def check(name,actual,target,tol,basis):
 checks.append(dict(name=name,actual_m=actual,target_m=target,error_m=abs(actual-target),tolerance_m=tol,pass_=abs(actual-target)<tol,basis=basis))
def cross(z):return [v for v in points if abs(v.z-z)<.001]
def diameter(z):
 vs=cross(z);assert vs,('Missing exported cross section',z)
 return max(v.x for v in vs)-min(v.x for v in vs)
# SA-506 Fig 5-1 / 5-19 and NASA-CR-1539 Fig 1-1, expressed from STA -115.
check('S-II top diameter at STA2519',diameter(66.9036),10.0584,.004,'SA-506 Fig5-1')
check('S-IVB lower diameter at STA2746.5',diameter(72.6821),6.604,.004,'SA-506 Fig5-19; CR1539 Fig1-1')
check('IU lower diameter',diameter(84.773897),6.604,.004,'TM-X-53770 Fig2, SA501 provisional upper station')
check('IU upper diameter',diameter(85.688297),6.604,.004,'TM-X-53770 Fig2, SA501 provisional upper station')
check('Adapter top diameter',diameter(94.222697),3.9116,.004,'Apollo11 Press Kit PDF93 / 28ft adapter')
for i in range(1,6):
 o=bpy.data.objects['GEO-F1-bell-inner-'+str(i)]
 vs=[o.matrix_world@v.co for v in o.data.vertices];low=min(v.z for v in vs);vs=[v for v in vs if abs(v.z-low)<.0001]
 check('F1 inner exit diameter '+str(i),max(v.x for v in vs)-min(v.x for v in vs),3.556,.004,'NASA SP8120 Table1 nominal140in; SA506 applicability unresolved')
# All five share the same sampled profile; independently inspect throat and length.
o=bpy.data.objects['GEO-F1-bell-inner-1'];vs=[o.matrix_world@v.co for v in o.data.vertices];low=min(v.z for v in vs);high=max(v.z for v in vs);top=[v for v in vs if abs(v.z-high)<.0001]
check('F1 throat diameter',max(v.x for v in top)-min(v.x for v in top),.889,.004,'NASA SP8120 Table1 nominal35in')
check('F1 throat to exit length',high-low,4.0132,.004,'NASA SP8120 Table1 nominal158in')
pts=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
assert all(math.isfinite(c) for p in pts for c in p)
counts=dict(F1_bells=sum(o.name.startswith('GEO-F1-bell-outer-') for o in meshes),F1_inner_surfaces=sum(o.name.startswith('GEO-F1-bell-inner-') for o in meshes),LES_legs=sum(o.name.startswith('GEO-LES-main-leg-') for o in meshes))
assert counts==dict(F1_bells=5,F1_inner_surfaces=5,LES_legs=4)
check('Nominal stack height',max(v.z for v in pts)-min(v.z for v in pts),110.6424,.004,'SA506 Fig1-3 nominal363ft, not manufacturing tolerance')
report=dict(verification='fresh GLB import; hard-coded independent document transcription',checks=checks,counts=counts,finite_geometry=True,mesh_count=len(meshes),strict_drawing_match=False)
(repo/'assets/launch-export-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
assert all(x['pass_'] for x in checks),checks

# Four cardinal views use one scale and a shared datum. These are geometry QA,
# not claims of registration to four independent historic photographs.
scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x=600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True
scene.display.shading.background_type='WORLD';scene.world.color=(.86,.89,.91)
scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
for m in bpy.data.materials:
 p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if m.node_tree else None
 if p:m.diffuse_color=p.inputs['Base Color'].default_value
cd=bpy.data.cameras.new('CAM-cardinal');cam=bpy.data.objects.new('CAM-cardinal',cd);scene.collection.objects.link(cam);scene.camera=cam;cd.type='ORTHO';cd.ortho_scale=119
views=[('front',(0,-230,55)),('side',(230,0,55)),('back',(0,230,55)),('other-side',(-230,0,55))]
for name,pos in views:
 cam.location=pos;cam.rotation_euler=(Vector((0,0,55))-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(work/('geometry-'+name+'.png'));bpy.ops.render.render(write_still=True)
print('INDEPENDENT_EXPORT_CHECKS',json.dumps(dict(pass_count=len(checks),counts=counts)))
