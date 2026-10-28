"""Deterministic rear-drive elliptical machine for a six-pose human rig.

Blender coordinates: X is forward, Y is lateral, Z is up; metres.
Both hands and feet are solved from the same phase, so an athlete rig can use
targets() for IK. This file builds only the machine, with no body assets.
"""
import math
import bpy
from mathutils import Vector


def material(name, color, metallic=0.0, roughness=0.58):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return m


def box(name, loc, scale, mat, bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("soft manufactured corners", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    obj.data.materials.append(mat)
    return obj


def tube(name, start, end, radius, mat):
    a, b = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius,
        depth=(b-a).length, location=(a+b)*0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (b-a).to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def set_tube(obj, start, end):
    a, b = Vector(start), Vector(end)
    obj.location = (a+b)*0.5
    obj.rotation_euler = (b-a).to_track_quat("Z", "Y").to_euler()
    # Cylinder's initial depth is stored in mesh coordinates, so scale Z.
    initial = max(v.co.z for v in obj.data.vertices) - min(v.co.z for v in obj.data.vertices)
    obj.scale.z = (b-a).length / initial


def disk(name, center, radius, depth, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth,
        location=center, rotation=(math.pi/2,0,0))
    obj=bpy.context.object
    obj.name=name
    obj.data.materials.append(mat)
    bevel=obj.modifiers.new("rolled rim", "BEVEL")
    bevel.width=0.008
    bevel.segments=3
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def targets(phase):
    """Grips and pedal tops, equal to the corresponding athlete IK targets."""
    a = math.tau * phase
    out = {}
    for side, sign, y in (("near",1,-0.24),("far",-1,0.24)):
        # One fixed-length 0.60 m drive link runs from a 0.20 m rear crank
        # pin to the back of each platform. Solve pedal X from that constraint
        # after choosing the low, flat stride path. A drawn rod must not
        # stretch between frames.
        foot_z = 0.205 + sign*0.064*math.sin(a)
        crank_x = -0.79 + sign*0.20*math.cos(a)
        crank_z = 0.29 + sign*0.20*math.sin(a)
        foot_x = crank_x + math.sqrt(0.60**2-(foot_z-crank_z)**2)+0.15
        grip_x = 0.46 - sign*0.09*math.cos(a)
        grip_z = 1.28 + sign*0.02*math.sin(a)
        out[side] = {
            "pedal": (foot_x,y,foot_z),
            # Rubber pad top is pedal centre +0.024; keep the IK sole in
            # contact with a 1 mm visual clearance for the shoe mesh.
            "shoe_sole": (foot_x,y,foot_z+0.025),
            "hand": (grip_x,y,grip_z),
            "lever_pivot": (0.48,y,0.54),
            "crank_pin": (crank_x,y,crank_z),
        }
    return out


def build_machine():
    frame=material("elliptical graphite frame",(0.040,0.043,0.050),0.35,0.68)
    rim=material("elliptical bright edges",(0.115,0.12,0.13),0.48,0.55)
    housing=material("elliptical black housing",(0.025,0.027,0.031),0.12,0.74)
    tread=material("elliptical rubber tread",(0.017,0.019,0.022),0.01,0.90)
    screen=material("elliptical blank display",(0.050,0.055,0.060),0.07,0.48)

    # Four feet, two long ground rails, and cross-members remain fixed.
    for y in (-0.30,0.30):
        box("fixed ground rail",(-0.03,y,0.063),(2.25,0.055,0.075),frame)
        for x in (-1.08,1.02):
            box("fixed stabiliser foot",(x,y,0.047),(0.17,0.13,0.055),housing)
    for x in (-1.03,0.93):
        box("fixed ground crossbar",(x,0,0.063),(0.065,0.65,0.065),frame)

    # Rear flywheel has one stable centre and concentric housing rings.
    disk("fixed rear flywheel",(-0.79,0,0.29),0.26,0.16,housing)
    for y in (-0.09,0.09):
        disk("fixed flywheel accent",(-0.79,y,0.29),0.205,0.012,frame)
        disk("fixed flywheel bearing",(-0.79,y+(-0.012 if y<0 else 0.012),0.29),0.042,0.016,rim)
    tube("fixed flywheel pedestal",(-0.93,0,0.11),(-0.79,0,0.29),0.038,frame)
    tube("fixed flywheel-to-spine",(-0.70,0,0.15),(0.75,0,0.12),0.038,frame)

    # Front support, A-brace and blank console are wholly independent of phase.
    tube("fixed upright",(0.82,0,0.12),(0.85,0,1.13),0.058,frame)
    tube("fixed diagonal brace",(0.78,0,0.16),(0.42,0,0.59),0.039,frame)
    box("fixed display head",(0.78,-0.02,1.17),(0.29,0.25,0.23),housing,0.025)
    box("fixed blank display",(0.74,-0.157,1.18),(0.23,0.009,0.16),screen,0.012)

    moving={}
    neutral=targets(0)
    for side in ("far","near"):
        t=neutral[side]
        y=t["pedal"][1]
        side_mat=frame if side=="near" else housing
        pedal=box(f"{side} moving foot platform",t["pedal"],(0.40,0.165,0.032),housing,0.018)
        tread_pad=box(f"{side} moving rubber pad",(t["pedal"][0],y,t["pedal"][2]+0.02),
            (0.345,0.145,0.008),tread,0.006)
        heel_stop=box(f"{side} moving heel stop",(t["pedal"][0]-0.18,y,t["pedal"][2]+0.042),
            (0.025,0.15,0.045),frame,0.005)
        crank=disk(f"{side} rotating crank pin",t["crank_pin"],0.023,0.03,rim)
        rear_link=tube(f"{side} moving rear pedal link",t["crank_pin"],
            (t["pedal"][0]-0.15,y,t["pedal"][2]),0.017,side_mat)
        front_link=tube(f"{side} moving front pedal link",(t["pedal"][0]+0.15,y,t["pedal"][2]),
            (0.46,y,0.55),0.020,side_mat)
        handle=tube(f"{side} moving handle pole",t["lever_pivot"],t["hand"],0.023,side_mat)
        grip=tube(f"{side} moving hand grip",(t["hand"][0],y,t["hand"][2]-0.09),
            (t["hand"][0],y,t["hand"][2]+0.065),0.031,tread)
        pivot=disk(f"{side} fixed lever pivot",t["lever_pivot"],0.041,0.04,rim)
        moving[side]=(pedal,tread_pad,heel_stop,crank,rear_link,front_link,handle,grip,pivot)
    return moving


def pose_machine(moving, phase):
    pos=targets(phase)
    for side, parts in moving.items():
        pedal,pad,heel,crank,rear,front,handle,grip,_pivot=parts
        t=pos[side]
        x,y,z=t["pedal"]
        pedal.location=(x,y,z)
        pad.location=(x,y,z+0.02)
        heel.location=(x-0.18,y,z+0.042)
        crank.location=t["crank_pin"]
        set_tube(rear,t["crank_pin"],(x-0.15,y,z))
        set_tube(front,(x+0.15,y,z),(0.46,y,0.55))
        set_tube(handle,t["lever_pivot"],t["hand"])
        gx,gy,gz=t["hand"]
        grip.location=(gx,gy,gz-0.0125)
    return pos
