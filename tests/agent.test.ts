import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approveAgentProposal,
  createAgentProposal,
} from '../src/features/audio-builder/agent/proposals.ts';
import { createInitialProject } from '../src/features/audio-builder/domain/project.ts';

test('an agent proposal is non-mutating until approved and then creates one agent revision', () => {
  const project = createInitialProject();
  const snapshot = JSON.stringify(project);
  const proposal = createAgentProposal(project, {
    summary: 'Remove sub-rumble',
    musicalPurpose: 'Clear low-frequency space before adding warmth.',
    commands: [{ type: 'add_module', moduleType: 'filter', nodeId: 'filter-1' }],
  });
  assert.equal(JSON.stringify(project), snapshot);
  assert.equal(proposal.baseRevision, project.revision);
  assert.equal(proposal.status, 'pending');

  const result = approveAgentProposal(project, proposal);
  assert.equal(result.project.revision, project.revision + 1);
  assert.equal(result.project.activity[0].actor, 'agent');
  assert.deepEqual(result.project.chain, ['filter-1']);
  assert.equal(result.proposal.status, 'applied');
});

test('approving a stale proposal preserves newer human work', () => {
  const project = createInitialProject();
  const proposal = createAgentProposal(project, {
    summary: 'Add gain',
    musicalPurpose: 'Control output level.',
    commands: [{ type: 'add_module', moduleType: 'gain', nodeId: 'gain-1' }],
  });
  const newer = { ...project, name: 'Newer human edit', revision: project.revision + 1 };
  assert.throws(() => approveAgentProposal(newer, proposal), /stale.*revision|revision.*current/i);
  assert.equal(newer.name, 'Newer human edit');
  assert.deepEqual(newer.chain, []);
});
