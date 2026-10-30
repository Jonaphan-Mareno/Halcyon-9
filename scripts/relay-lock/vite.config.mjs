// The game's own Vite config, with no file watching and no hot reload: for scripts/relay-lock/game.mjs,
// so files saved while it plays (by anyone) do not reload the page under it
import base from '../../vite.config.js';

export default {
  ...base,
  server: { ...(base.server || {}), hmr: false, watch: { ignored: ['**/*'] } }
};
