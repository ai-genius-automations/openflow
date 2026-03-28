import { createResearchSessionSkill } from './octoally_research_session.js';

export const cliType = 'claude' as const;

const researchClaude = createResearchSessionSkill({ cliType });

export const status = researchClaude.status;
export const monitor = researchClaude.monitor;
const continueOperation = researchClaude.continue;
export { continueOperation as continue };
export const cancel = researchClaude.cancel;

export default researchClaude;
