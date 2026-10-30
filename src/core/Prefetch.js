import { Cache } from 'three';

// Fetching the next level while this one is played, so going down to it does not wait on the
// network. Level 3 is about 19 MB of models, textures and sound: on the school's server, fetched
// all at once at the hatch, it took long enough to look like a crash.
//
// Quietly, in the background: two files at a time, at low priority, after the current level has
// settled. Models are kept in memory (three.js's Cache, which every model loader looks in first);
// everything else only warms the browser's own cache, which the level's fetches then hit.
// Nothing here is decoded or drawn: the frame rate does not feel it.
//
//   prefetch(urls)       start (or add to) the queue
//   clearPrefetched()    drop the models kept in memory, once the level they were for is built

const AT_ONCE = 2;
const queue = [];
const seen = new Set();
let running = 0;

export function prefetch(urls) {
  Cache.enabled = true;
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    queue.push(url);
  }
  pump();
}

export function clearPrefetched() {
  Cache.clear();
  Cache.enabled = false;
}

function pump() {
  while (running < AT_ONCE && queue.length) {
    const url = queue.shift();
    running++;
    const model = /\.(glb|gltf|fbx)$/i.test(url);
    fetch(url, { priority: 'low' })
      .then((r) => (r.ok ? (model ? r.arrayBuffer() : r.blob()) : null))
      .then((data) => { if (model && data) Cache.add(`file:${url}`, data); })
      .catch(() => {})
      .finally(() => { running--; pump(); });
  }
}
