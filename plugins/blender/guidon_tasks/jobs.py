"""Runs blocking network calls off Blender's main thread.

bpy must only be touched from the main thread, so a job's ``work`` runs on
a daemon thread and returns a plain value; its ``done`` callback is queued
and called from a bpy.app.timers tick on the main thread, where it may
update add-on state and redraw the UI.
"""

import queue
import threading

import bpy

_results = queue.Queue()
_busy = 0


def is_busy():
    return _busy > 0


def run(work, done):
    """work() -> result, on a worker thread; done(result), later, on the main thread."""
    global _busy
    _busy += 1

    def target():
        try:
            result = work()
        except Exception as e:  # never let a worker die silently
            result = (False, "Unexpected error: {}".format(e))
        _results.put((done, result))

    threading.Thread(target=target, daemon=True).start()
    if not bpy.app.timers.is_registered(_drain):
        bpy.app.timers.register(_drain, first_interval=0.1)
    redraw()


def _drain():
    global _busy
    while True:
        try:
            done, result = _results.get_nowait()
        except queue.Empty:
            break
        _busy -= 1
        try:
            done(result)
        except Exception as e:
            print("Guidon Tasks: callback failed:", e)
    redraw()
    return 0.1 if _busy > 0 else None  # None unregisters the timer


def redraw():
    wm = getattr(bpy.context, "window_manager", None)
    if wm is None:
        return
    for window in wm.windows:
        for area in window.screen.areas:
            if area.type in {"VIEW_3D", "TEXT_EDITOR"}:
                area.tag_redraw()


def unregister():
    global _busy
    if bpy.app.timers.is_registered(_drain):
        bpy.app.timers.unregister(_drain)
    _busy = 0
