"""Guidon Tasks for Blender - a Guidon project board in the sidebar.

See plugins/blender/README.md. Blender 4.2+ installs this folder as an
extension (blender_manifest.toml); bl_info below keeps it installable as a
legacy add-on on older versions.
"""

bl_info = {
    "name": "Guidon Tasks",
    "author": "Two Steps Studio",
    "version": (1, 0, 0),
    "blender": (3, 6, 0),
    "location": "3D Viewport / Text Editor > Sidebar (N) > Guidon",
    "description": "View and update Guidon tasks without leaving Blender",
    "category": "Interface",
}

import bpy
from bpy.props import BoolVectorProperty, PointerProperty, StringProperty

from . import api, jobs, ops, panels, state


class GuidonPreferences(bpy.types.AddonPreferences):
    # Stored in Blender's user preferences (machine-wide), never in a .blend -
    # so the API key can't end up committed or shared with a scene file.
    bl_idname = __package__

    base_url: StringProperty(name="Base URL", default="https://useguidon.com")
    api_key: StringProperty(name="API Key", subtype="PASSWORD", options={"HIDDEN"})
    email: StringProperty(name="Email", options={"HIDDEN"})
    project_id: StringProperty(name="Project", options={"HIDDEN"})

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "base_url")
        if self.api_key:
            row = layout.row()
            row.label(text="Logged in as " + (self.email or "?"), icon="USER")
            row.operator("guidon.logout")
        else:
            layout.operator("guidon.login", icon="URL")


class GuidonWindowProps(bpy.types.PropertyGroup):
    expanded: BoolVectorProperty(size=len(api.STATUSES), default=(False, True, True, True, True, False))
    comment_text: StringProperty(name="Comment")


_classes = (GuidonPreferences, GuidonWindowProps) + ops.classes + panels.classes


def _initial_load():
    try:
        p = ops.prefs()
    except KeyError:
        return None
    if p.api_key and not ops.online_access_blocked():
        ops.load_projects()
    return None


def register():
    for cls in _classes:
        bpy.utils.register_class(cls)
    bpy.types.WindowManager.guidon = PointerProperty(type=GuidonWindowProps)
    bpy.app.timers.register(_initial_load, first_interval=1.0)


def unregister():
    if bpy.app.timers.is_registered(_initial_load):
        bpy.app.timers.unregister(_initial_load)
    if state.login_cancel is not None:
        state.login_cancel.set()
    jobs.unregister()
    del bpy.types.WindowManager.guidon
    for cls in reversed(_classes):
        bpy.utils.unregister_class(cls)
    state.reset()
