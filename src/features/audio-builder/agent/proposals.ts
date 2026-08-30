import { applyProjectCommands, makeId, type ProjectCommand, type ProjectV2 } from '../domain/project.ts';

export interface AgentProposal {
  id: string;
  baseRevision: number;
  summary: string;
  musicalPurpose: string;
  commands: ProjectCommand[];
  createdAt: string;
  status: 'pending' | 'approved' | 'applied';
  appliedRevision?: number;
}

export interface AgentProposalInput {
  summary: string;
  musicalPurpose: string;
  commands: ProjectCommand[];
}

function normalizeCommands(commands: ProjectCommand[]) {
  return commands.map((command): ProjectCommand => {
    if (command.type === 'add_module' && !command.nodeId) return { ...command, nodeId: makeId('node') };
    if (command.type === 'create_macro' && !command.macroId) return { ...command, macroId: makeId('macro') };
    if (command.type === 'add_mapping' && !command.mappingId) return { ...command, mappingId: makeId('mapping') };
    return structuredClone(command);
  });
}

export function createAgentProposal(project: ProjectV2, input: AgentProposalInput): AgentProposal {
  const summary = input.summary.trim();
  const musicalPurpose = input.musicalPurpose.trim();
  if (!summary || summary.length > 120) throw new Error('A proposal summary must contain 1–120 characters.');
  if (!musicalPurpose || musicalPurpose.length > 360) throw new Error('A musical explanation must contain 1–360 characters.');
  const commands = normalizeCommands(input.commands);
  applyProjectCommands(project, commands, 'agent', project.revision);
  return {
    id: makeId('proposal'),
    baseRevision: project.revision,
    summary,
    musicalPurpose,
    commands,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

export function authorizeAgentProposal(proposal: AgentProposal) {
  if (proposal.status !== 'pending') throw new Error('Only a pending proposal can be approved.');
  return { ...proposal, status: 'approved' as const };
}

export function applyApprovedAgentProposal(project: ProjectV2, proposal: AgentProposal) {
  if (proposal.status !== 'approved') throw new Error('This proposal requires explicit user approval before it can be applied.');
  const next = applyProjectCommands(project, proposal.commands, 'agent', proposal.baseRevision);
  return {
    project: next,
    proposal: { ...proposal, status: 'applied' as const, appliedRevision: next.revision },
  };
}

export function approveAgentProposal(project: ProjectV2, proposal: AgentProposal) {
  return applyApprovedAgentProposal(project, authorizeAgentProposal(proposal));
}
