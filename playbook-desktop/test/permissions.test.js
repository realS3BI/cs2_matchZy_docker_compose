import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewPermission } from '../src/security.js';

test('legacy Electron display requests are allowed only for a connected main frame', () => {
  assert.equal(reviewPermission('media', { isMainFrame: true, mediaTypes: [] }, true), true);
  assert.equal(reviewPermission('media', { isMainFrame: true, mediaType: 'unknown' }, true), true);
  assert.equal(reviewPermission('display-capture', { isMainFrame: true, mediaTypes: ['video'] }, true), true);
  assert.equal(reviewPermission('media', { isMainFrame: false, mediaTypes: [] }, true), false);
  assert.equal(reviewPermission('media', { isMainFrame: true, mediaTypes: [] }, false), false);
});
test('hardware camera, microphone and other permissions remain denied', () => {
  for (const mediaTypes of [['video'], ['audio'], ['video', 'audio']]) assert.equal(reviewPermission('media', { isMainFrame: true, mediaTypes }, true), false);
  assert.equal(reviewPermission('display-capture', { isMainFrame: true, mediaTypes: ['audio'] }, true), false);
  assert.equal(reviewPermission('media', { isMainFrame: true, mediaType: 'video' }, true), false);
  assert.equal(reviewPermission('geolocation', { isMainFrame: true }, true), false);
});
