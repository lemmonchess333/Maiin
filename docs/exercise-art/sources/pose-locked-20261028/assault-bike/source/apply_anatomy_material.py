"""Attach the Tropos anatomy atlas to the original coherent 53-bone body.

Import the GLB as usual, then call apply_anatomy_material(body).  Keep the
original armature and mesh; the separately rigged muscle meshes tear with IK.
"""

import bpy
from pathlib import Path

ASSET_DIR = Path(__file__).resolve().parent


def apply_anatomy_material(body, exercise=None, color_path=None,
                           normal_path=None, normal_strength=0.12):
    if color_path is None:
        named = ASSET_DIR / f"{exercise}-modesty-contour-color-1024.png" if exercise else None
        color_path = named if named and named.exists() else ASSET_DIR / "anatomy-contour-color-1024.png"
    color_path = str(color_path)
    normal_path = str(normal_path or ASSET_DIR / "anatomy-modesty-normal-1024.png")

    mat = bpy.data.materials.new("Tropos baked muscle anatomy")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    links = mat.node_tree.links
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = 0.72
    color = nodes.new("ShaderNodeTexImage")
    color.image = bpy.data.images.load(color_path, check_existing=True)
    color.interpolation = "Linear"
    normal_image = nodes.new("ShaderNodeTexImage")
    normal_image.image = bpy.data.images.load(normal_path, check_existing=True)
    normal_image.image.colorspace_settings.name = "Non-Color"
    normal_image.interpolation = "Linear"
    normal = nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = normal_strength
    links.new(color.outputs["Color"], shader.inputs["Base Color"])
    links.new(normal_image.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    body.data.materials.clear()
    body.data.materials.append(mat)
    return mat
