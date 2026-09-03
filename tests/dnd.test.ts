import assert from 'node:assert/strict';
import test from 'node:test';
import { moveIndexFromDropZone } from '../src/features/audio-builder/components/dnd.ts';

test('dragging a connected module translates full-chain drop zones to post-removal indexes', () => {
  assert.equal(moveIndexFromDropZone(0, 3), 2, 'first module can move after the last module');
  assert.equal(moveIndexFromDropZone(1, 3), 2, 'middle module can move after the last module');
  assert.equal(moveIndexFromDropZone(2, 0), 0, 'last module can move before the first module');
  assert.equal(moveIndexFromDropZone(1, 2), 1, 'dropping immediately after itself remains in place');
});
