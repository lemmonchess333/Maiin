"""Finish the CC0 MakeHuman rig for Tropos exercise artwork.

Call ``apply_style(armature, body)`` immediately after importing the neutral
GLB, before moving the armature or adding exercise IK. All coordinates below
are in the 1.68 m GLB's rest space (front is -Y). The garment gets source
skin weights; head and trainers follow head/foot bones.
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils.kdtree import KDTree


def material(name, color, roughness=.78):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = (*color, 1)
    principled.inputs['Roughness'].default_value = roughness
    return mat


def bone_parent(obj, armature, bone):
    bpy.context.view_layer.update()
    transform = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    obj.matrix_world = transform


def loft(name, rings, mat, steps=48, caps=True):
    """Elliptical cross section loft. Rings are (z, x, y, rx, ry)."""
    verts = []
    for z, cx, cy, rx, ry in rings:
        for i in range(steps):
            a = math.tau * i / steps
            verts.append((cx + rx * math.cos(a), cy + ry * math.sin(a), z))
    faces = []
    for j in range(len(rings) - 1):
        for i in range(steps):
            a, b = j * steps + i, j * steps + (i + 1) % steps
            c, d = (j + 1) * steps + (i + 1) % steps, (j + 1) * steps + i
            faces.append((a, b, c, d))
    if caps:
        faces.extend((tuple(reversed(range(steps))),
                      tuple((len(rings) - 1) * steps + i for i in range(steps))))
    mesh = bpy.data.meshes.new(name + ' mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = True
    return obj


def hide_head_toes(body):
    """Trim detailed face/toes; shell and trainer hide the resulting openings."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    remove = [v for v in bm.verts if v.co.z > 1.465 or v.co.z < .075]
    bmesh.ops.delete(bm, geom=remove, context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()


def make_head(armature, white):
    # No eyes, nose, mouth or ears. Jaw and crown are rounded separately;
    # lower neck collar overlaps the cut body neck without a visible seam.
    obj = loft('Tropos faceless anatomical head', [
        (1.418, 0, -.021, .050, .054),
        (1.444, 0, -.030, .057, .062),
        (1.466, 0, -.045, .061, .075),
        (1.495, 0, -.057, .075, .091),
        (1.535, 0, -.056, .092, .112),
        (1.585, 0, -.053, .100, .120),
        (1.625, 0, -.048, .092, .111),
        (1.656, 0, -.043, .073, .087),
        (1.677, 0, -.042, .045, .055),
        (1.688, 0, -.042, .006, .009),
    ], white)
    sub = obj.modifiers.new('rounded faceless anatomy', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    bone_parent(obj, armature, 'head')
    return obj


def add_source_weights(garment, body, armature):
    """Nearest-surface weights follow pelvis and upper thighs during motion."""
    groups = {g.index: garment.vertex_groups.new(name=g.name) for g in body.vertex_groups}
    kd = KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    for v in garment.data.vertices:
        _, index, _ = kd.find(v.co)
        source = body.data.vertices[index]
        for g in source.groups:
            groups[g.group].add((v.index,), g.weight, 'REPLACE')
    mod = garment.modifiers.new('Follow 53-bone figure', 'ARMATURE')
    mod.object = armature


def make_shorts(armature, body, fabric):
    """Shade a fitted opaque pelvis region on the coherent source body.

    Duplicated garment meshes tear at the hip under extreme multi-bone IK.
    A material region follows the original mesh exactly at every phase.
    """
    slot = len(body.data.materials)
    body.data.materials.append(fabric)
    count = 0
    for poly in body.data.polygons:
        center = poly.center
        z = center.z
        if .705 <= z <= 1.015:
            half_width = .105 + .95 * max(0, min(.11, z - .705))
            if abs(center.x) <= half_width:
                poly.material_index = slot
                count += 1
    print('TROPOS_OPAQUE_PELVIS_FACES', count)
    return body


def _shoe_polygon(name, x, stations, z_bottom, z_top, mat):
    """Extrude a rounded planform outline into a trainer sole."""
    outline = []
    for y, w in stations:
        outline.append((x - w, y))
    for y, w in reversed(stations):
        outline.append((x + w, y))
    n = len(outline)
    verts = [(px, py, z_bottom) for px, py in outline]
    verts += [(px, py, z_top) for px, py in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j+n, i+n))
    mesh = bpy.data.meshes.new(name + ' mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new('soft rubber edge', 'BEVEL')
    bevel.width = .009
    bevel.segments = 4
    obj.modifiers.new('shoe normals', 'WEIGHTED_NORMAL')
    return obj


def _shoe_upper(name, x, stations, mat):
    # Semi-ellipse roofs at longitudinal stations form a tapered toe box and
    # padded heel. The detailed shape is visible in the phone-sized artwork.
    verts = []
    steps = 14
    for y, width, height in stations:
        for i in range(steps + 1):
            a = math.pi * i / steps
            verts.append((x + width * math.cos(a), y,
                          .039 + (height - .039) * math.sin(a)))
    faces = []
    for j in range(len(stations) - 1):
        for i in range(steps):
            a = j * (steps + 1) + i
            faces.append((a, a+1, a+steps+2, a+steps+1))
    faces += [tuple(reversed(range(steps+1))),
              tuple((len(stations)-1)*(steps+1)+i for i in range(steps+1))]
    mesh = bpy.data.meshes.new(name + ' mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = True
    sub = obj.modifiers.new('soft fabric roof', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    return obj


def make_trainers(armature, upper_mat, midsole_mat, outsole_mat, lace_mat):
    shoes = []
    sole_outline = [( .072,.029),(.038,.055),(-.037,.073),(-.140,.079),
                    (-.245,.073),(-.325,.052),(-.365,.018)]
    upper_stations = [( .060,.035,.098),(.022,.055,.126),(-.045,.067,.130),
                      (-.130,.071,.118),(-.225,.066,.082),(-.305,.046,.060),
                      (-.351,.010,.042)]
    for side, x in [('l', .19), ('r', -.19)]:
        bone = 'foot_' + side
        sole = _shoe_polygon(f'Tropos {side} rubber tread', x, sole_outline,
                             .004, .019, outsole_mat)
        mid = _shoe_polygon(f'Tropos {side} white midsole', x, sole_outline,
                            .018, .040, midsole_mat)
        upper = _shoe_upper(f'Tropos {side} trainer upper', x, upper_stations,
                             upper_mat)
        for obj in (sole, mid, upper):
            bone_parent(obj, armature, bone)
            shoes.append(obj)
        # Tonal cross-laces/straps across the high vamp; these small details
        # prevent white feet from reading as featureless blocks.
        for i, y in enumerate((-.060, -.090, -.120, -.150)):
            z = .130 - .006 * i
            bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=.0025,
                                                depth=.087, location=(x, y, z))
            lace = bpy.context.object
            lace.name = f'Tropos {side} lace {i+1}'
            lace.rotation_euler = (0, math.pi/2, 0)
            lace.data.materials.append(lace_mat)
            bone_parent(lace, armature, bone)
            shoes.append(lace)
    return shoes


def apply_style(armature, body=None):
    """Add faceless head, opaque fitted shorts, trainers to original CC0 rig."""
    if body is None:
        body = bpy.data.objects['Avery | anatomical body']
    hide_head_toes(body)
    white = material('Tropos chalk white', (.92,.93,.95))
    fabric = material('Tropos opaque shorts fabric', (.83,.85,.88))
    fabric_shader = fabric.node_tree.nodes.get('Principled BSDF')
    fabric_shader.inputs['Emission Color'].default_value = (.83,.85,.88,1)
    fabric_shader.inputs['Emission Strength'].default_value = .22
    midsole = material('Tropos white trainer midsole', (.94,.94,.95))
    outsole = material('Tropos graphite tread', (.45,.46,.49))
    laces = material('Tropos grey trainer laces', (.70,.72,.75))
    head = make_head(armature, white)
    shorts = make_shorts(armature, body, fabric)
    asset_dir = Path(__file__).resolve().parent
    if not (asset_dir / 'sneaker.glb').exists():
        raise FileNotFoundError('sneaker.glb must be beside style_human.py')
    if (asset_dir / 'sneaker.glb').exists() and (asset_dir / 'attach_sneakers.py').exists():
        sys.path.insert(0, str(asset_dir))
        from attach_sneakers import attach_sneakers
        shoes = attach_sneakers(armature)
    else:
        shoes = make_trainers(armature, white, midsole, outsole, laces)
    return {'head': head, 'shorts': shorts, 'shoes': shoes}
