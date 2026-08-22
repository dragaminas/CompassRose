/**
 * Who decides what, for the duration of one specification session (024-specification-flow).
 *
 * The profile belongs to the person in the session, never to the repository. A second person
 * opening a session in the same project declares their own and inherits nothing: what one person
 * was equipped to decide says nothing about the next, and storing it would quietly impose the first
 * author's competencies on everyone after them.
 *
 * What *is* persisted is provenance -- a per-section marker in the generated specification recording
 * whether a human decided it or the agent filled it. That is a fact about the document, not about
 * the person, and it constrains no future session.
 */

export type CompetencyAxis = 'product' | 'architecture' | 'implementation';
export type CompetencyOwner = 'human' | 'agent';

export type SessionCompetencyProfile = Readonly<Record<CompetencyAxis, CompetencyOwner>>;

export const COMPETENCY_AXES: readonly CompetencyAxis[] = ['product', 'architecture', 'implementation'];

export const COMPETENCY_AXIS_LABELS: Readonly<Record<CompetencyAxis, string>> = {
  product: 'product — what the application does and how it is used',
  architecture: 'architecture — structure, module boundaries, where state lives',
  implementation: 'implementation detail — contracts, schemas, document formats',
};

/**
 * The default when a session declines to declare: the human owns product and architecture, the
 * agent fills implementation detail.
 *
 * Chosen because it is the split that keeps the human's attention on decisions only they can make
 * while still letting them stop before the parts that are properly the machine's. Deliberately not
 * "the agent owns everything": a specification nobody chose is the failure this whole feature
 * exists to prevent.
 */
export const DEFAULT_COMPETENCY_PROFILE: SessionCompetencyProfile = {
  product: 'human',
  architecture: 'human',
  implementation: 'agent',
};

export function ownsAxis(profile: SessionCompetencyProfile, axis: CompetencyAxis): boolean {
  return profile[axis] === 'human';
}

/**
 * How the profile is described to the agent. Behavior, not content: on a human-owned axis the agent
 * must surface a structured decision rather than choosing; on an agent-owned axis it must choose and
 * say why.
 */
export function describeProfileForPrompt(profile: SessionCompetencyProfile): string[] {
  return COMPETENCY_AXES.map((axis) =>
    profile[axis] === 'human'
      ? `- ${axis}: the human decides. Surface a structured decision rather than choosing for them.`
      : `- ${axis}: you decide, and state your reasoning. Do not ask.`,
  );
}
