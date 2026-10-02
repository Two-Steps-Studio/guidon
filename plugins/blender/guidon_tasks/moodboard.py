"""The project's moodboard (reference images / concept art) in the sidebar.

Images are downloaded on a worker thread into a cache folder under the
system temp directory (never next to the .blend) and shown as thumbnails
through a bpy.utils.previews collection. "Reference" drops an image into
the 3D scene as a reference image - the main reason to have it in Blender.
"""

import os
import tempfile
import webbrowser

import bpy
import bpy.utils.previews
from bpy.props import StringProperty

from . import api, jobs
from .ops import _guard, client, online_access_blocked, prefs

CACHE_ROOT = os.path.join(tempfile.gettempdir(), "guidon-moodboard")

references = None  # list of reference dicts (+ "path"), None until loaded
project_id = ""  # which project `references` belongs to
error = ""
_previews = None


def _preview_collection():
    global _previews
    if _previews is None:
        _previews = bpy.utils.previews.new()
    return _previews


def reset():
    global references, project_id, error
    references = None
    project_id = ""
    error = ""
    if _previews is not None:
        _previews.clear()


def find(reference_id):
    for reference in references or []:
        if reference.get("id") == reference_id:
            return reference
    return None


def icon_id(reference):
    path = reference.get("path")
    if not path:
        return 0
    previews = _preview_collection()
    if reference["id"] not in previews:
        previews.load(reference["id"], path, "IMAGE")
    return previews[reference["id"]].icon_id


def load(context=None):
    global error
    wanted = prefs(context).project_id
    if not wanted:
        return
    c = client(context)
    error = ""

    def work():
        ok, value = c.list_references(wanted)
        if not ok:
            return ok, value
        folder = os.path.join(CACHE_ROOT, wanted)
        items = []
        for reference in value or []:
            if not isinstance(reference, dict) or not reference.get("id"):
                continue
            ext = api.IMAGE_EXTENSIONS.get((reference.get("mime_type") or "").lower())
            item = dict(reference, path="")
            if ext:
                path = os.path.join(folder, reference["id"] + ext)
                # Images never change once uploaded (only caption/tags do), so the id is a safe cache key.
                if os.path.isfile(path) or api.download_image(reference.get("image_url"), path)[0]:
                    item["path"] = path
            items.append(item)
        return True, items

    def done(result):
        global references, project_id, error
        ok, value = result
        if prefs().project_id != wanted:
            return  # the user switched project meanwhile
        if not ok:
            error = value or "Could not load the moodboard."
            return
        if _previews is not None:
            _previews.clear()
        references, project_id, error = value, wanted, ""

    jobs.run(work, done)


# --- operators ----------------------------------------------------------------


class GUIDON_OT_load_moodboard(bpy.types.Operator):
    bl_idname = "guidon.load_moodboard"
    bl_label = "Load Moodboard"
    bl_description = "Download this project's reference images from Guidon"

    def execute(self, context):
        if not _guard(self):
            return {"CANCELLED"}
        load(context)
        return {"FINISHED"}


class GUIDON_OT_add_reference_image(bpy.types.Operator):
    bl_idname = "guidon.add_reference_image"
    bl_label = "Add as Reference"
    bl_description = "Add this image to the scene as a reference image, placed at the 3D cursor"

    reference_id: StringProperty()

    @classmethod
    def poll(cls, context):
        return context.area is not None and context.area.type == "VIEW_3D"

    def execute(self, context):
        reference = find(self.reference_id)
        if not reference or not reference.get("path"):
            self.report({"ERROR"}, "This image isn't available.")
            return {"CANCELLED"}
        if context.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        try:
            bpy.ops.object.load_reference_image(filepath=reference["path"])
        except RuntimeError as e:
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        if context.active_object is not None:
            context.active_object.name = reference.get("caption") or reference.get("name") or "Reference"
        return {"FINISHED"}


class GUIDON_OT_view_reference(bpy.types.Operator):
    bl_idname = "guidon.view_reference"
    bl_label = "View"
    bl_description = "Show the full image in an open Image Editor, or in your system's image viewer"

    reference_id: StringProperty()

    def execute(self, context):
        reference = find(self.reference_id)
        if not reference or not reference.get("path"):
            self.report({"ERROR"}, "This image isn't available.")
            return {"CANCELLED"}
        editors = [a for a in context.screen.areas if a.type == "IMAGE_EDITOR"]
        if not editors:
            bpy.ops.wm.path_open(filepath=reference["path"])
            return {"FINISHED"}
        image = bpy.data.images.load(reference["path"], check_existing=True)
        image.name = reference.get("caption") or reference.get("name") or image.name
        editors[0].spaces.active.image = image
        return {"FINISHED"}


class GUIDON_OT_open_reference_source(bpy.types.Operator):
    bl_idname = "guidon.open_reference_source"
    bl_label = "Source"
    bl_description = "Open where this image came from"

    reference_id: StringProperty()

    def execute(self, context):
        url = (find(self.reference_id) or {}).get("source_url") or ""
        if url.lower().startswith(("http://", "https://")):
            webbrowser.open(url)
        return {"FINISHED"}


class GUIDON_OT_open_moodboard_web(bpy.types.Operator):
    bl_idname = "guidon.open_moodboard_web"
    bl_label = "Open in Browser"
    bl_description = "Open this project's moodboard on the Guidon website (add images there)"

    def execute(self, context):
        p = prefs(context)
        if p.project_id:
            webbrowser.open("{}/projects/{}/references".format(p.base_url.rstrip("/"), p.project_id))
        return {"FINISHED"}


# --- panel ----------------------------------------------------------------------


class _MoodboardPanel:
    bl_region_type = "UI"
    bl_category = "Guidon"
    bl_label = "Moodboard"
    bl_options = {"DEFAULT_CLOSED"}

    @classmethod
    def poll(cls, context):
        return bool(prefs(context).api_key) and bool(prefs(context).project_id) and not online_access_blocked()

    def draw(self, context):
        layout = self.layout
        props = context.window_manager.guidon
        current = prefs(context).project_id

        row = layout.row(align=True)
        loaded = references is not None and project_id == current
        row.operator("guidon.load_moodboard", text="Refresh" if loaded else "Load Moodboard", icon="FILE_REFRESH")
        row.operator("guidon.open_moodboard_web", text="", icon="URL")

        if error:
            box = layout.box()
            box.alert = True
            box.label(text=error, icon="ERROR")
        if not loaded:
            if jobs.is_busy():
                layout.label(text="Loading...", icon="SORTTIME")
            return
        if not references:
            layout.label(text="No images yet - add them on the website.")
            return

        layout.prop(props, "moodboard_filter", text="", icon="VIEWZOOM")
        needle = props.moodboard_filter.strip().lower()
        shown = [
            r
            for r in references
            if not needle
            or needle in " ".join([r.get("caption") or "", r.get("name") or ""] + list(r.get("tags") or [])).lower()
        ]
        in_view3d = context.area is not None and context.area.type == "VIEW_3D"
        grid = layout.grid_flow(columns=2 if context.region.width > 300 else 1, even_columns=True, align=False)
        for reference in shown:
            box = grid.box()
            icon = icon_id(reference)
            if icon:
                box.template_icon(icon_value=icon, scale=6.0)
            else:
                box.label(text="Unsupported format", icon="IMAGE_DATA")
            box.label(text=reference.get("caption") or reference.get("name") or "")
            if reference.get("tags"):
                box.label(text=", ".join(reference["tags"]), icon="BOOKMARKS")
            buttons = box.row(align=True)
            buttons.enabled = bool(reference.get("path"))
            if in_view3d:
                buttons.operator("guidon.add_reference_image", text="Reference", icon="IMAGE_REFERENCE").reference_id = reference["id"]
            buttons.operator("guidon.view_reference", text="View", icon="IMAGE_DATA").reference_id = reference["id"]
            if reference.get("source_url"):
                source = box.row()
                source.operator("guidon.open_reference_source", text="Source", icon="URL").reference_id = reference["id"]


def _make(space, suffix):
    name = "GUIDON_PT_moodboard_" + suffix
    return type(name, (_MoodboardPanel, bpy.types.Panel), {"bl_space_type": space, "bl_idname": name})


classes = (
    GUIDON_OT_load_moodboard,
    GUIDON_OT_add_reference_image,
    GUIDON_OT_view_reference,
    GUIDON_OT_open_reference_source,
    GUIDON_OT_open_moodboard_web,
    _make("VIEW_3D", "view3d"),
    _make("IMAGE_EDITOR", "image"),
)


def unregister():
    global _previews
    if _previews is not None:
        bpy.utils.previews.remove(_previews)
        _previews = None
    reset()
