"""Pose-controlled Assault Bike machine.

Scene units: metres. +X is the camera-near side, -Y is athlete forward,
Z is up. One crank phase drives opposite pedals and opposite handle levers.
"""
import math
import bpy
from mathutils import Vector


FAN = (0.0, -1.05, 0.72)
FAN_RADIUS = 0.43
CRANK = (0.0, -0.30, 0.48)
CRANK_RADIUS = 0.16
HANDLE_PIVOT_Y = -0.55
HANDLE_PIVOT_Z = 0.50
HANDLE_LENGTH = 0.92
HANDLE_ANGLE_CENTRE = 0.0
HANDLE_ANGLE_SWING = 0.17
SEAT = (0.0, -0.20, 1.00)


def phase_targets(phase):
    """Return exact hand/foot target coordinates for a [0, 1) crank phase."""
    theta = 2 * math.pi * phase
    near_angle = HANDLE_ANGLE_CENTRE + HANDLE_ANGLE_SWING * math.cos(theta)
    far_angle = HANDLE_ANGLE_CENTRE - HANDLE_ANGLE_SWING * math.cos(theta)
    def handle(x, angle):
        return (x, HANDLE_PIVOT_Y - HANDLE_LENGTH * math.sin(angle),
                HANDLE_PIVOT_Z + HANDLE_LENGTH * math.cos(angle))
    near_pedal = (0.30,
                  CRANK[1] - CRANK_RADIUS * math.cos(theta),
                  CRANK[2] - CRANK_RADIUS * math.sin(theta))
    far_pedal = (-0.30,
                 CRANK[1] + CRANK_RADIUS * math.cos(theta),
                 CRANK[2] + CRANK_RADIUS * math.sin(theta))
    return {
        "near_hand": handle(0.30, near_angle),
        "far_hand": handle(-0.30, far_angle),
        "near_pedal": near_pedal,
        "far_pedal": far_pedal,
        "near_foot": (near_pedal[0], near_pedal[1], near_pedal[2] + 0.065),
        "far_foot": (far_pedal[0], far_pedal[1], far_pedal[2] + 0.065),
        "near_handle_angle": near_angle,
        "far_handle_angle": far_angle,
        "crank_angle": theta,
    }


def material(name, color, metallic=0.0, roughness=0.6):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


def move_to_collection(obj, collection):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def make_cylinder(name, a, b, radius, mat, collection, vertices=12):
    a, b = Vector(a), Vector(b)
    direction = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius,
                                        depth=direction.length, location=(a+b)/2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(mat)
    return move_to_collection(obj, collection)


def make_box(name, location, scale, mat, collection, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return move_to_collection(obj, collection)


def make_torus(name, center, major, minor, mat, collection):
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=8,
                                    location=center, rotation=(0, math.pi/2, 0),
                                    major_radius=major, minor_radius=minor)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return move_to_collection(obj, collection)


def make_empty(name, location, collection):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.location = location
    return obj


def parent_local(obj, parent, local_location=None):
    if local_location is None:
        local_location = Vector(obj.location) - Vector(parent.location)
    obj.parent = parent
    obj.location = local_location
    return obj


def make_fan_blade(name, angle, mat, collection, rotor):
    # Mesh coordinates local to rotor, spread over the Y-Z disc.
    coords = [(0.015, 0.03, 0.02), (0.015, 0.34, 0.065),
              (0.015, 0.39, -0.03), (0.015, 0.12, -0.04)]
    vertices = []
    for x, y, z in coords:
        vertices.append((x, y*math.cos(angle)-z*math.sin(angle),
                         y*math.sin(angle)+z*math.cos(angle)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(0,1,2,3)])
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = rotor
    return obj


def build_machine(scene=None):
    scene = scene or bpy.context.scene
    collection = bpy.data.collections.new("Assault Bike - rigged machine")
    scene.collection.children.link(collection)
    dark = material("bike gunmetal", (0.035,0.038,0.047), 0.58, 0.43)
    edge = material("bike edge", (0.085,0.09,0.105), 0.52, 0.44)
    rubber = material("bike grip rubber", (0.037,0.038,0.044), 0.03, 0.73)
    fan_mat = material("fan blade", (0.048,0.052,0.063), 0.45, 0.50)
    seat_mat = material("saddle black", (0.055,0.055,0.066), 0.02, 0.78)

    # Fixed base, triangular chassis, seat post, and fan support.
    for x in (-0.39,0.39):
        make_cylinder("floor rail", (x,0.48,0.065), (x,-1.50,0.065),
                      0.055,dark,collection)
        for y in (0.48,-1.50):
            make_box("floor foot", (x,y,0.045), (0.22,0.22,0.09),
                     edge,collection,0.02)
    fixed_tubes = (
        ((0,0.46,0.08),(0,-0.30,0.48),0.045),
        ((0,-0.30,0.48),(0,-1.50,0.08),0.044),
        ((0,-1.50,0.08),FAN,0.058),
        ((0,-0.95,0.08),FAN,0.055),
        ((0,0.30,0.07),SEAT,0.052),
        ((0,-0.30,0.48),(0,0.10,0.08),0.042),
        ((0,-0.30,0.48),(0,-0.75,0.08),0.043),
    )
    for a,b,r in fixed_tubes:
        make_cylinder("fixed chassis tube",a,b,r,dark,collection)
    make_box("seat pad", (0,-0.20,1.03), (0.43,0.32,0.075),
             seat_mat,collection,0.035)
    make_box("display stalk", (0,-0.55,1.18), (0.045,0.045,0.40),
             dark,collection,0.014)
    make_box("small console", (0,-0.58,1.40), (0.20,0.10,0.12),
             edge,collection,0.016)

    # Fan blades rotate inside a truly fixed cage.
    rotor = make_empty("fan rotor", FAN, collection)
    for i in range(6):
        make_fan_blade(f"fan blade {i+1}",i*math.tau/6,fan_mat,collection,rotor)
    for x in (-0.285,0.285):
        for radius in (0.12,0.23,0.33,FAN_RADIUS):
            make_torus("fixed fan cage ring",(x,FAN[1],FAN[2]),
                       radius,0.005 if radius<FAN_RADIUS else 0.016,
                       edge,collection)
        for i in range(18):
            angle=i*math.tau/18
            a=(x,FAN[1]+0.07*math.cos(angle),
               FAN[2]+0.07*math.sin(angle))
            b=(x,FAN[1]+FAN_RADIUS*math.cos(angle),
               FAN[2]+FAN_RADIUS*math.sin(angle))
            make_cylinder("fixed fan cage spoke",a,b,0.0035,edge,
                          collection,vertices=6)
    make_cylinder("fan hub axle",(-0.33,FAN[1],FAN[2]),
                  (0.33,FAN[1],FAN[2]),0.055,edge,collection)

    # Both lever pivots stay fixed; rigid levers swing in opposite phase.
    handle_roots={}
    for side,x in (("near",0.30),("far",-0.30)):
        pivot=(x,HANDLE_PIVOT_Y,HANDLE_PIVOT_Z)
        root=make_empty(f"{side} handle pivot",pivot,collection)
        handle_roots[side]=root
        lever=make_cylinder(f"{side} moving handle",pivot,
                            (x,HANDLE_PIVOT_Y,HANDLE_PIVOT_Z+HANDLE_LENGTH),
                            0.022,dark,collection)
        parent_local(lever,root,(0,0,HANDLE_LENGTH/2))
        grip=make_cylinder(f"{side} rubber grip",
                           (x-0.10,HANDLE_PIVOT_Y,
                            HANDLE_PIVOT_Z+HANDLE_LENGTH),
                           (x+0.10,HANDLE_PIVOT_Y,
                            HANDLE_PIVOT_Z+HANDLE_LENGTH),
                           0.032,rubber,collection)
        parent_local(grip,root,(0,0,HANDLE_LENGTH))
        make_cylinder(f"{side} pivot pin",(x-0.055,pivot[1],pivot[2]),
                      (x+0.055,pivot[1],pivot[2]),0.043,edge,collection)

    # Crank arms rotate as one body; pedal platforms stay level at their tips.
    crank_root=make_empty("pedal crank axle",CRANK,collection)
    make_cylinder("crank bearing",(-0.37,CRANK[1],CRANK[2]),
                  (0.37,CRANK[1],CRANK[2]),0.062,edge,collection)
    pedals={}
    for side,x,dy in (("near",0.30,-CRANK_RADIUS),
                      ("far",-0.30,CRANK_RADIUS)):
        arm=make_cylinder(f"{side} rotating crank arm",
                          (x,CRANK[1],CRANK[2]),
                          (x,CRANK[1]+dy,CRANK[2]),
                          0.023,edge,collection)
        parent_local(arm,crank_root,(x,dy/2,0))
        pedal=make_box(f"{side} level pedal",
                       (x,CRANK[1]+dy,CRANK[2]-0.015),
                       (0.25,0.15,0.035),rubber,collection,0.012)
        pedals[side]=pedal

    # Seven keys make all adjacent six-frame steps, including 6->1,
    # exactly one sixth of a complete turn.
    for frame in range(1,8):
        target=phase_targets((frame-1)/6)
        scene.frame_set(frame)
        crank_root.rotation_euler[0]=target["crank_angle"]
        crank_root.keyframe_insert(data_path="rotation_euler",index=0)
        # Six identical blades sampled every 60 crank degrees would alias to
        # a still image at any integer gear ratio. Thirteen sixths of a
        # revolution per crank turn yields 10 visible degrees per frame,
        # including the sixth-to-first loop step.
        rotor.rotation_euler[0]=target["crank_angle"]*(13/6)
        rotor.keyframe_insert(data_path="rotation_euler",index=0)
        for side in ("near","far"):
            root=handle_roots[side]
            root.rotation_euler[0]=target[f"{side}_handle_angle"]
            root.keyframe_insert(data_path="rotation_euler",index=0)
            pedal=pedals[side]
            pedal.location=Vector(target[f"{side}_pedal"])+Vector((0,0,-0.015))
            pedal.keyframe_insert(data_path="location")
    for root in (crank_root,rotor,*handle_roots.values(),*pedals.values()):
        if root.animation_data and root.animation_data.action:
            for fc in root.animation_data.action.fcurves:
                for key in fc.keyframe_points:
                    key.interpolation="LINEAR"
    scene.frame_start=1
    scene.frame_end=6
    scene.frame_set(1)
    return collection


if __name__ == "__main__":
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    build_machine()
    bpy.ops.wm.save_as_mainfile(filepath="/tmp/assault-bike-final/assault_machine.blend")
