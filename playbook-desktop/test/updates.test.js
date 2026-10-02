import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { Updates } from '../src/updates.js';

const require = createRequire(import.meta.url);
const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider.js');

test('the real GitHub provider with no releases produces an informational status', async () => {
  const updater = new EventEmitter();
  const provider = new GitHubProvider({ owner: 'test', repo: 'test' }, updater, { executor: {}, platform: 'win32' });
  provider.httpRequest = async () => '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Releases</title></feed>';
  updater.checkForUpdates = async () => {
    updater.emit('checking-for-update');
    try { return await provider.getLatestVersion(); }
    catch (error) { updater.emit('error', error); throw error; }
  };
  const updates = new Updates(updater, () => true);
  await updates.check();
  assert.equal(updates.status.state, 'unpublished');
  assert.match(updates.status.message, /playbook.cmd/);
  await updates.check();
  assert.equal(updates.status.state, 'unpublished');
});

test('network failures remain errors and a later successful check recovers', async () => {
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => { throw new Error('network unavailable'); };
  const updates = new Updates(updater, () => true);
  await updates.check();
  assert.equal(updates.status.state, 'error');
  updater.checkForUpdates = async () => updater.emit('update-not-available');
  await updates.check();
  assert.equal(updates.status.state, 'current');
  updater.emit('update-downloaded', { version: '1.2.3' });
  await updates.check();
  assert.equal(updates.status.state, 'ready');
});
