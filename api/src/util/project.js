'use strict';

const { db } = require('../db');

// Strip the basic-auth hash before any project row leaves the API. It's not
// plaintext, but a bcrypt hash should never be exposed to clients. Centralized
// so no route can forget it.
function pub(p) {
  if (p) delete p.basic_hash;
  return p;
}

// Fetch a project by slug (full row).
function getProject(slug) {
  return db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
}

// Fetch a project or send a 404 and return null. Lets handlers do:
//   const project = loadOr404(reply, slug); if (!project) return;
function loadOr404(reply, slug) {
  const project = getProject(slug);
  if (!project) { reply.code(404).send({ error: 'Project not found' }); return null; }
  return project;
}

module.exports = { pub, getProject, loadOr404 };
