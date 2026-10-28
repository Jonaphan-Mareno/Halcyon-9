"""
Fitting a borrowed head's neck onto a body's own neck (build_kessler_from_female.py and
build_crew_head.py). Blender axes: z up, the face looks toward -y.

The body's neck is measured as an ellipse at each height (its old head's mesh, which its collar was
made around). The new head's neck is drawn onto it gradually: from under the chin at the front,
and from higher up at the sides and the back (below the skull, where a full neck stood out over the
collar), all the way onto the body's neck at `fit` and below. Each vertex keeps its angle round the
neck and moves toward the body's ellipse at that angle, so the neck stays a smooth tube.

Use from a build script:
    import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from neck_fit import neck_rings, fit_neck
"""
import math
import numpy as np


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def ring(co, z, half=0.003, xmax=0.075, depth=0.08):
    """(centre y, half width, half depth) of the mesh's cross-section at height z (within xmax of
    the middle, and depth of the section's own middle front to back)"""
    r = co[(np.abs(co[:, 2] - z) < half) & (np.abs(co[:, 0]) < xmax)]
    while len(r) < 12 and half < 0.012:             # (a sparse mesh: a thicker slice)
        half *= 1.5
        r = co[(np.abs(co[:, 2] - z) < half) & (np.abs(co[:, 0]) < xmax)]
    if len(r):
        r = r[np.abs(r[:, 1] - np.median(r[:, 1])) < depth]
    if len(r) < 6:
        return None
    x0, x1 = np.percentile(r[:, 0], [2, 98])
    y0, y1 = np.percentile(r[:, 1], [2, 98])
    return (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2


def neck_rings(co, cut, fit, step=0.004, flare=False, **kw):
    """The body's neck from `cut` up to `fit`, as (heights, rings); above `fit` the neck at `fit`
    holds (higher up, the old head's mesh is jaw and face, not neck). Below it too, if the old head's
    mesh takes in the shoulders there (wider than at `fit`), unless flare: then the new neck follows
    it down (where the collar is open and the old skin showed: Kessler's V)."""
    at_fit = ring(co, fit, **kw)
    zs, rs = [], []
    for z in np.arange(cut - 0.01, fit + step / 2, step):
        r = ring(co, z, **kw)
        if r is None or (r[1] > at_fit[1] * 1.08 and not flare):
            r = at_fit
        zs.append(z)
        rs.append(r)
    return np.array(zs), np.array(rs)


def neck_at(zs, rs, z):
    if z >= zs[-1]:
        return rs[-1]
    if z <= zs[0]:
        return rs[0]
    i = np.searchsorted(zs, z)
    t = (z - zs[i - 1]) / (zs[i] - zs[i - 1])
    return rs[i - 1] * (1 - t) + rs[i] * t


def fit_neck(verts, zs, rs, top_front, top_back, fit, keep=None, inset=0.98):
    """Draw the vertices (bmesh verts or anything with .co) below the head onto the body's neck.
    top_front / top_back: where the drawing-in starts under the chin and at the back of the neck;
    fit: where it is complete. keep(v) -> False leaves a vertex alone (hair)."""
    cy0 = rs[-1][0]
    moved = 0
    for v in verts:
        p = v.co
        if p.z > top_back or (keep and not keep(v)):
            continue
        # how far round to the back this vertex is (0 at the front, 1 at the back)
        dy, dx = p.y - cy0, p.x
        back = (dy / max(1e-6, math.hypot(dx, dy)) + 1) / 2
        top = top_front + (top_back - top_front) * back ** 1.5
        if p.z >= top:
            continue
        t = smooth(top, fit, p.z)
        cy, rx, ry = neck_at(zs, rs, p.z)
        a = math.atan2((p.y - cy) / ry, p.x / rx)
        tx, ty = rx * inset * math.cos(a), cy + ry * inset * math.sin(a)
        p.x += (tx - p.x) * t
        p.y += (ty - p.y) * t
        moved += 1
    return moved
