"""Attach a recolored CC0 sneaker pair to the original MakeHuman foot bones.

The source GLB is a single mesh containing a side-by-side pair.  This helper
splits it at the empty centre gap, scales each shoe around its own centre,
    and parents it to the matching foot bone. Use after importing the original
    human-base-rigged.glb and before posing the armature.
"""

from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent


def attach_sneakers(armature, scale=0.85):
    path = str(ROOT / 'sneaker.glb')
    existing = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [obj for obj in bpy.data.objects if obj not in existing]
    source = next(obj for obj in imported if obj.type == 'MESH' and 'sneaker_body' in obj.name)
    xs = [v.co.x for v in source.data.vertices]
    cut = (min(xs) + max(xs)) / 2

    upper = bpy.data.materials.get('Tropos white trainers') or bpy.data.materials.new('Tropos white trainers')
    upper.diffuse_color = (.91,.92,.94,1)
    upper.use_nodes = True
    principled = upper.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = (.91,.92,.94,1)
    principled.inputs['Roughness'].default_value = .68

    sole = bpy.data.materials.get('Tropos trainer sole') or bpy.data.materials.new('Tropos trainer sole')
    sole.diffuse_color = (.78,.79,.82,1)
    sole.use_nodes = True
    principled = sole.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = (.78,.79,.82,1)
    principled.inputs['Roughness'].default_value = .8

    shoes = {}
    for side, keep_right, x in [('l', True, .191), ('r', False, -.191)]:
        mesh = source.data.copy()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        discard = [v for v in bm.verts if (v.co.x < cut) == keep_right]
        bmesh.ops.delete(bm, geom=discard, context='VERTS')
        bm.to_mesh(mesh)
        bm.free()
        coords = [v.co.copy() for v in mesh.vertices]
        center_x = (min(v.x for v in coords) + max(v.x for v in coords)) / 2
        center_y = (min(v.y for v in coords) + max(v.y for v in coords)) / 2
        for v in mesh.vertices:
            v.co.x = (v.co.x - center_x) * scale * 1.08
            v.co.y = (v.co.y - center_y) * scale * 1.15
            v.co.z *= scale
        mesh.update()
        mesh.materials.clear()
        mesh.materials.append(upper)
        mesh.materials.append(sole)
        for poly in mesh.polygons:
            poly.material_index = 1 if poly.center.z < .027 * scale else 0
            poly.use_smooth = True

        shoe = bpy.data.objects.new('Tropos trainer ' + side, mesh)
        bpy.context.collection.objects.link(shoe)
        # The foot bone runs toward -Y; these centres give a toe at ~-0.23 m
        # and a heel at ~0.05 m on the 1.75-m human rig.
        desired = Matrix.Translation(Vector((x, -.088, 0)))
        shoe.parent = armature
        shoe.parent_type = 'BONE'
        shoe.parent_bone = 'foot_' + side
        shoe.matrix_world = desired
        shoes[side] = shoe

    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    return shoes
