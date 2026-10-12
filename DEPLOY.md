# Putting Halcyon-9 on the school server

The game is plain static files: Apache only has to send them, the browser does all the work.

## Build and upload

1. `npm install` (once), then `npm run build`.
2. Upload **everything inside `dist/`** to the game's folder on the server (any folder works,
   e.g. `public_html/halcyon9/`; all paths are relative).
3. Open the folder's URL in Chrome, Edge or Firefox.

**ARIA's face video is not in git.** `public/assets/textures/aria_components/aria-idle.mp4` is kept
private by `.gitignore`. If the build is made on a machine without it, ARIA's screens stay blank:
build on a machine that has the file, or upload it to `assets/textures/aria_components/` on the
server by hand.

Linux servers care about upper/lower case in file names (Windows does not): `Sea.mp4` and
`sea.mp4` are different files there. All current paths match; keep new ones exact.

## After re-exporting a model from Blender

Run `npm run optimize-models`. It thins the over-detailed meshes and Draco-compresses the big
models (the control room goes from ~21 MB to under 1 MB). Already-compressed files are skipped.
For the atrium: export with `Blender/scripts/export_l2_atrium.py` first (never rebuild
`l2-atrium.blend` from the build script: it holds the hand-placed bedrooms).

## Optional server settings

`deploy/htaccess` adds compression and caching. Copy it into the game's folder as `.htaccess`.
If that gives a "500 Internal Server Error", the server does not allow it: delete it again.

## Performance

- F3 shows the frame rate. Both levels lower their own quality on slow machines (level 1 first
  drops the floor depth effect and some per-pixel lights, then the resolution), and level 1 raises
  it again when there is room.
- On laptops: plug in the charger and use Windows' "Best performance" power mode; on battery the
  graphics chip runs much slower. Keep the browser's hardware acceleration on.
- Download sizes: the first screen needs ~0.3 MB of code (compressed); level 1's room is ~0.6 MB;
  the physics engine (~1.7 MB compressed) downloads in the background from the start.
