'use strict';

// Pure project classification for V2. Given a set of top-level file names and
// an optional parsed package.json, decide the deploy type and surface the
// signals the deploy plan needs. No filesystem access — unit-testable.
//
// Types: 'dockerfile' | 'node-api' | 'worker' | 'vue' | 'static' | 'python'

function classify(files = [], pkg = null) {
  const set = new Set(files.map((f) => String(f).toLowerCase()));
  const has = (f) => set.has(f.toLowerCase());

  const scripts = (pkg && pkg.scripts) || {};
  const deps = Object.assign({}, (pkg && pkg.dependencies) || {}, (pkg && pkg.devDependencies) || {});
  const hasBuild = !!scripts.build;
  const hasStart = !!scripts.start;
  const isVue = !!deps.vue || has('vue.config.js') || has('vite.config.js') || has('vite.config.ts');

  let type;
  if (has('dockerfile')) type = 'dockerfile';
  else if (pkg) {
    // package.json present → Node project. Distinguish frontend build vs API vs worker.
    const webSignal = has('server.js') || has('app.js') || deps.express || deps.fastify || deps.koa
      || /\b(server|serve|listen)\b/.test(scripts.start || '');
    if (isVue && hasBuild) type = 'vue';
    else if (webSignal) type = 'node-api';
    else if (hasStart && !hasBuild) type = 'worker'; // long-running, no web framework
    else if (hasBuild) type = 'vue';                 // generic build → static output
    else type = 'node-api';
  } else if (has('requirements.txt') || has('pyproject.toml')) type = 'python';
  else if (has('index.html')) type = 'static';
  else type = 'static';

  return {
    type,
    isApi: type === 'node-api',
    isWorker: type === 'worker',
    isFrontend: type === 'vue' || type === 'static',
    hasBuild,
    startScript: scripts.start || null,
    buildScript: scripts.build || null,
  };
}

// Default health path: APIs commonly expose /health; everything else /.
function defaultHealthPath(info) {
  return info && info.isApi ? '/health' : '/';
}

// Whether this type publishes a public route by default (workers do not).
function routesByDefault(info) {
  return !(info && info.isWorker);
}

module.exports = { classify, defaultHealthPath, routesByDefault };
