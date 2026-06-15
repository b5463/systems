'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const { desiredStatus, reconcileStatus } = require('../src/util/reconcile');

test('reconcile: maps docker state to status', () => {
  assert.equal(desiredStatus('running'), 'running');
  assert.equal(desiredStatus('restarting'), 'running');
  assert.equal(desiredStatus('exited'), 'stopped');
  assert.equal(desiredStatus('dead'), 'stopped');
  assert.equal(desiredStatus('paused'), 'stopped');
  assert.equal(desiredStatus('created'), 'stopped');
  assert.equal(desiredStatus(undefined), null);
});

test('reconcile: corrects drift only when needed', () => {
  // DB says running, container actually exited -> stopped
  assert.equal(reconcileStatus({ status: 'running', container_id: 'abc' }, { State: 'exited' }), 'stopped');
  // DB says stopped, container actually running -> running
  assert.equal(reconcileStatus({ status: 'stopped', container_id: 'abc' }, { State: 'running' }), 'running');
  // Already in sync -> no change
  assert.equal(reconcileStatus({ status: 'running', container_id: 'abc' }, { State: 'running' }), null);
});

test('reconcile: missing container becomes error (once)', () => {
  assert.equal(reconcileStatus({ status: 'running', container_id: 'abc' }, null), 'error');
  assert.equal(reconcileStatus({ status: 'error', container_id: 'abc' }, null), null);
});

test('reconcile: never touches building/deleted or never-deployed', () => {
  assert.equal(reconcileStatus({ status: 'building', container_id: 'abc' }, { State: 'exited' }), null);
  assert.equal(reconcileStatus({ status: 'deleted', container_id: null }, null), null);
  assert.equal(reconcileStatus({ status: 'running', container_id: null }, null), null);
});
