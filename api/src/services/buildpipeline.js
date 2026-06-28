'use strict';

const fsp = require('fs/promises');
const path = require('path');

const RUNTIMES = {
  'node-18': { image: 'node:18-alpine', label: 'Node.js 18' },
  'node-20': { image: 'node:20-alpine', label: 'Node.js 20' },
  'node-22': { image: 'node:22-alpine', label: 'Node.js 22' },
  'python-3.11': { image: 'python:3.11-slim', label: 'Python 3.11' },
  'python-3.12': { image: 'python:3.12-slim', label: 'Python 3.12' },
  'python-3.13': { image: 'python:3.13-slim', label: 'Python 3.13' },
};

const DEFAULT_RUNTIMES = {
  node: 'node-20',
  python: 'python-3.12',
};

function listRuntimes() {
  return Object.entries(RUNTIMES).map(([id, r]) => ({ id, ...r }));
}

function resolveRuntime(projectType, selectedRuntime) {
  if (selectedRuntime && RUNTIMES[selectedRuntime]) return RUNTIMES[selectedRuntime].image;
  const defaultKey = DEFAULT_RUNTIMES[projectType];
  return defaultKey ? RUNTIMES[defaultKey].image : null;
}

async function generateDockerfileWithRuntime(projectType, dirPath, runtime) {
  const baseImage = resolveRuntime(projectType, runtime);
  if (!baseImage) return false;

  const { features } = require('../util/flags');
  const useCache = features().buildCache;

  if (projectType === 'node') {
    const cacheMount = useCache ? 'RUN --mount=type=cache,target=/root/.npm npm install --production' : 'RUN npm install --production';
    const content = `FROM ${baseImage}
WORKDIR /app
COPY package*.json ./
${cacheMount}
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`;
    await fsp.writeFile(path.join(dirPath, 'Dockerfile'), content);
    if (useCache) {
      await fsp.writeFile(path.join(dirPath, '.dockerignore'),
        `.git\n.gitignore\n.env\n.env.*\nnode_modules\n`);
      const syntaxLine = '# syntax=docker/dockerfile:1\n';
      const existing = await fsp.readFile(path.join(dirPath, 'Dockerfile'), 'utf8');
      await fsp.writeFile(path.join(dirPath, 'Dockerfile'), syntaxLine + existing);
    }
    return true;
  }

  if (projectType === 'python') {
    const files = await fsp.readdir(dirPath);
    const fileSet = new Set(files);
    const entryPoint = fileSet.has('app.py') ? 'app.py' : 'main.py';
    const cacheMount = useCache
      ? 'RUN --mount=type=cache,target=/root/.cache/pip if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi'
      : 'RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi';
    const content = `FROM ${baseImage}
WORKDIR /app
COPY requirements.txt* ./
${cacheMount}
COPY . .
EXPOSE 3000
CMD ["python", "${entryPoint}"]
`;
    await fsp.writeFile(path.join(dirPath, 'Dockerfile'), content);
    if (useCache) {
      const syntaxLine = '# syntax=docker/dockerfile:1\n';
      const existing = await fsp.readFile(path.join(dirPath, 'Dockerfile'), 'utf8');
      await fsp.writeFile(path.join(dirPath, 'Dockerfile'), syntaxLine + existing);
    }
    return true;
  }

  return false;
}

module.exports = { RUNTIMES, listRuntimes, resolveRuntime, generateDockerfileWithRuntime };
