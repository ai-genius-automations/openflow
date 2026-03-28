import { createResearchSessionSkill } from './octoally_research_session.js';

export const cliType = 'codex' as const;

const researchCodex = createResearchSessionSkill({ cliType });

export const status = researchCodex.status;
export const monitor = researchCodex.monitor;
const continueOperation = researchCodex.continue;
export { continueOperation as continue };
export const cancel = researchCodex.cancel;

export default researchCodex;
