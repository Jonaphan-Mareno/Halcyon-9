import bpy
import json
import re
from mathutils import Vector, Euler

JSON_PATH = "/home/vmuser/Halcyon-9/Blender/bedroom1.json"

with open(JSON_PATH) as f:
    data = json.load(f)

def base(name):
    return re.sub(r"\.\d{3}$", "", name)

def find_object(name):
    obj = bpy.data.objects.get(name)
    if obj:
        return obj
    b = base(name)
    for o in bpy.data.objects:
        if base(o.name) == b:
            return o
    return None

missing = []
for entry in data["objects"]:
    obj = find_object(entry["name"])
    if obj is None:
        missing.append(entry["name"])
        continue

    obj.rotation_mode = 'XYZ'
    obj.location = Vector(entry["position"])
    obj.rotation_euler = Euler(entry["rotation"], 'XYZ')  # radians
    obj.scale = Vector(entry["scale"])
    bpy.context.view_layer.update()

    # Dimensions (metres) are applied last; they override scale to match
    if "dimensions" in entry:
        obj.dimensions = Vector(entry["dimensions"])
        bpy.context.view_layer.update()

    d = obj.dimensions
    print(f"{obj.name}: dims = ({d.x:.4f}, {d.y:.4f}, {d.z:.4f})")

print(f"Applied {len(data['objects']) - len(missing)} / {len(data['objects'])}")
if missing:
    print("Not found:", missing)
