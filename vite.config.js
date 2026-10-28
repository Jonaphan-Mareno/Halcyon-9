import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 'virtual:voice-files': the recorded lines in public/assets/audio/{aria,voss,logs}, listed when the
// game is built (or the dev server starts), so src/audio/AudioCache.js can fetch a level's lines
// ahead of time without a hand-kept list. (A new recording in dev: restart the server.)
const VOICE_DIRS = ['aria', 'voss', 'logs'];
function voiceFiles() {
  const id = 'virtual:voice-files';
  return {
    name: 'voice-files',
    resolveId: (source) => (source === id ? '\0' + id : null),
    load(resolved) {
      if (resolved !== '\0' + id) return null;
      const files = {};
      for (const dir of VOICE_DIRS) {
        const path = fileURLToPath(new URL(`./public/assets/audio/${dir}`, import.meta.url));
        try {
          files[dir] = readdirSync(path).filter((f) => f.endsWith('.mp3')).sort();
        } catch {
          files[dir] = [];
        }
      }
      return `export default ${JSON.stringify(files)};`;
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [voiceFiles()],
  build: {
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        submarineHack: fileURLToPath(new URL('./submarine-hack.html', import.meta.url))
      }
    }
  }
});
