import { defineConfig } from '../../plugin/A3GamePlayable/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const here = path => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here('./'),
  plugins: [{ name: 'local-comparison-capture', configureServer(server) {
    server.middlewares.use('/__capture', async (request, response) => {
      if (request.method !== 'POST') { response.statusCode = 405; response.end(); return; }
      const type = request.headers['content-type']?.split(';')[0];
      if (!['video/mp4', 'video/webm'].includes(type)) { response.statusCode = 415; response.end(); return; }
      try {
        const chunks = []; let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 25 * 1024 * 1024) { response.statusCode = 413; response.end(); return; }
          chunks.push(chunk);
        }
        if (!size) { response.statusCode = 400; response.end(); return; }
        await mkdir(here('./captures'), { recursive: true });
        const filename = `boss-action-comparison.${type === 'video/mp4' ? 'mp4' : 'webm'}`;
        await writeFile(here(`./captures/${filename}`), Buffer.concat(chunks));
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ filename, size }));
      } catch { response.statusCode = 500; response.end('Capture failed'); }
    });
  } }],
  resolve: { alias: [
    { find: /^@a3game\/playable$/, replacement: here('../../plugin/A3GamePlayable/src/index.js') },
    { find: /^three$/, replacement: here('../../plugin/A3GamePlayable/node_modules/three/build/three.module.js') },
    { find: /^three\/addons\//, replacement: here('../../plugin/A3GamePlayable/node_modules/three/examples/jsm/') },
  ] },
  server: { host: '127.0.0.1', port: 5182, strictPort: true, fs: { allow: [here('../../')] } },
});
