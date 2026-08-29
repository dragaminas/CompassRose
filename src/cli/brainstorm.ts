import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { findGitRepositoryRoot } from '../git/gitStatus.js';
import { getBootstrapConfigPath } from '../config/compassRosePaths.js';
import { CompassRoseOrchestrator } from '../orchestrator/orchestrator.js';
import { parseRunArguments } from './runOptions.js';
import type { CliEnvironment } from './main.js';
import { runSetupCli } from './setup.js';
import { runValidationLoopForItem } from './validationLoop.js';
import type { BrainstormTurnRecord, RecordedDecision } from '../contracts/brainstormer/brainstormerContracts.js';
import type { SessionCompetencyProfile } from '../contracts/brainstormer/competency.js';
import {
  considerDimension,
  recordProvenanceAndCoverage,
  takeDecision,
  type SpecificationConversationState,
} from './specificationTurn.js';

// Bounded per ADR-0033/34, mirroring validationLoop.ts's MAX_ROUNDS_PER_ITEM: every bounded loop
// in this codebase declares its own ceiling rather than running unbounded.
const MAX_TURNS_PER_FEATURE_IDEA = 25;
const MAX_FEATURES_PER_SESSION = 25;

// Hardcoded and case-insensitive by design (ADR-0007): the ONLY input that may turn the
// currently-discussed idea into an actual feature -- never the model's own `ready_to_draft`
// signal, which only changes what gets displayed next.
const CREATE_KEYWORD = 'crear';
// Hardcoded and case-insensitive by design: the ONLY input that may end the session.
const END_KEYWORD = 'terminado';

function isAffirmative(answer: string): boolean {
  return /^s(i|í)$/i.test(answer.trim());
}

/**
 * The profile the stance question above was always describing.
 *
 * It was asked, written into the transcript as prose, and then never passed to
 * `runBrainstormTurn`, so every CLI session ran on the default profile regardless of the answer.
 * Product stays with the human either way: this question is only about architecture, and nothing in
 * the CLI asks about the other two axes.
 */
function competencyFromStance(wantsArchitectureInput: boolean): SessionCompetencyProfile {
  return {
    product: 'human',
    architecture: wantsArchitectureInput ? 'human' : 'agent',
    implementation: 'agent',
  };
}

function buildArchitectureStanceTurn(wantsArchitectureInput: boolean): BrainstormTurnRecord {
  const text = wantsArchitectureInput
    ? 'Competencia declarada: el usuario desea participar en las decisiones de arquitectura de software (lenguaje, frameworks, patrones de diseño) para las features de esta sesión.'
    : 'Competencia declarada: el usuario no desea participar en las decisiones de arquitectura de software; otorga libertad de diseño de arquitectura a la IA para las features de esta sesión, sujeta siempre a los requerimientos de lógica de negocio que declare.';

  return { role: 'human', text, recorded_at: new Date().toISOString() };
}

/**
 * Flow B ("npm run brainstorm", ADR-0007/0046): the single entry point a human opens with an
 * idea. Asks where the project lives, bootstraps CompassRose there if absent (Flow 0), resolves
 * any feature/fix already awaiting validation one by one (Flow 1's own loop, reused verbatim),
 * and only once nothing else is pending does it start the conversational discovery session that
 * turns a vague or precise idea into one or more new candidate features, each validated inline
 * right after drafting it.
 *
 * Three literal, orchestrator-owned keywords drive every state transition (never the model's own
 * judgment, per ADR-0007): "crear" drafts the currently-discussed idea into a formal feature,
 * "listo" confirms it (shared with Flow 1), and "terminado" ends the session.
 */
export async function runBrainstormCli(
  argv: readonly string[] = [],
  environment: CliEnvironment = {},
): Promise<number> {
  const stdout = environment.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
  const stderr = environment.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));
  const defaultDirectory = environment.cwd ?? process.cwd();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question: string): Promise<string> =>
    new Promise((resolveAnswer) => rl.question(question, resolveAnswer));

  try {
    const directoryAnswer = (
      await ask(`¿En qué carpeta está el proyecto en el que vamos a trabajar? [${defaultDirectory}]: `)
    ).trim();
    const targetDirectory = resolve(defaultDirectory, directoryAnswer.length > 0 ? directoryAnswer : '.');

    const gitRoot = findGitRepositoryRoot(targetDirectory);
    if (gitRoot === null) {
      stderr(`runtime preflight: git repository: ${targetDirectory} no está dentro de un repositorio git.`);
      return 1;
    }

    const configPath = getBootstrapConfigPath(gitRoot);
    if (!existsSync(configPath)) {
      stdout('');
      stdout('CompassRose no está inicializado en este proyecto todavía. Inicializando...');
      const setupExitCode = runSetupCli([], { cwd: gitRoot, stdout, stderr });
      if (setupExitCode !== 0) {
        return setupExitCode;
      }
    } else {
      stdout('');
      stdout(`CompassRose ya está inicializado en ${gitRoot}.`);
    }

    let options;
    try {
      options = parseRunArguments(argv, gitRoot);
    } catch (error) {
      stderr(error instanceof Error ? error.message : String(error));
      stderr('Usage: compassrose brainstorm [--no-commit]');
      return 1;
    }

    const orchestrator = new CompassRoseOrchestrator({ ...options, cwd: gitRoot });

    const pending = orchestrator.listFeaturesAwaitingValidation();
    if (pending.length === 0) {
      stdout('No hay features ni fixes esperando validación.');
    } else {
      stdout('');
      stdout(`Hay ${pending.length} feature(s)/fix(es) esperando validación. Vamos una por una antes de seguir con ideas nuevas.`);
      for (const item of pending) {
        stdout('');
        stdout(`=== ${item.id} ===`);
        const { confirmed, transcript } = await runValidationLoopForItem(orchestrator, item.id, ask, stdout);
        if (confirmed) {
          orchestrator.confirmFeatureValidation(item.id, transcript);
          stdout('');
          stdout(`Confirmada ${item.id}.`);
        } else {
          stdout(`${item.id} quedó pendiente de validación; podés confirmarla más tarde con "npm run feature-validation".`);
        }
      }
    }

    stdout('');
    stdout('Contame la idea de tu aplicación -- vaga o precisa, la iremos precisando charlando.');
    stdout(`Escribí "${CREATE_KEYWORD}" cuando una idea esté lista para formalizarse como feature, o "${END_KEYWORD}" para terminar la sesión.`);

    const wantsArchitectureInput = isAffirmative(
      await ask('¿Querés responder preguntas de arquitectura de software (lenguaje, frameworks, patrones de diseño) durante esta sesión, o prefirís darle libertad total de diseño a la IA? (si/no): '),
    );
    const declarationTurn = buildArchitectureStanceTurn(wantsArchitectureInput);
    stdout('');
    stdout(declarationTurn.text);

    // The declaration is never reset -- it belongs to the whole session and must be carried into
    // every feature this session drafts, unlike segmentMessages below, which resets per feature.
    const preamble: BrainstormTurnRecord[] = [declarationTurn];
    let lastProposedTitle: string | null = null;
    let featuresDrafted = 0;

    // The conversation's mutable state, in the shape `src/cli/specificationTurn.ts` operates on --
    // the same shape the interactive session keeps, so a decision answered here reaches the next
    // turn and the drafted specification exactly as it does there.
    const conversation: SpecificationConversationState = {
      transcript: [...preamble],
      segment: [],
      decisions: [] as RecordedDecision[],
      competency: competencyFromStance(wantsArchitectureInput),
      author: 'human',
    };
    const print = (lines: readonly string[]): void => {
      for (const line of lines) {
        stdout(line);
      }
    };

    outer:
    while (featuresDrafted < MAX_FEATURES_PER_SESSION) {
      const line = await ask('> ');
      const trimmed = line.trim();

      if (trimmed.toLowerCase() === END_KEYWORD) {
        break outer;
      }

      if (trimmed.toLowerCase() === CREATE_KEYWORD) {
        if (conversation.segment.length === 0) {
          stdout(`Contame la idea antes de escribir "${CREATE_KEYWORD}".`);
          continue outer;
        }

        const proposedTitle = lastProposedTitle ?? conversation.segment[0]!.text.slice(0, 80);
        const { featureId } = orchestrator.draftBrainstormedFeature(
          [...preamble, ...conversation.segment],
          proposedTitle,
        );
        featuresDrafted += 1;
        stdout('');
        stdout(`Feature ${featureId} formalizada. Pasemos a validarla.`);

        // What the draft owes the project before anyone validates it: a provenance section saying
        // who decided what, and the audit of the draft against this very conversation. Both ran
        // only in the interactive session until ADR-0049.
        await recordProvenanceAndCoverage(orchestrator, conversation, featureId, ask, print);

        const { confirmed, transcript } = await runValidationLoopForItem(orchestrator, featureId, ask, stdout);
        if (confirmed) {
          orchestrator.confirmFeatureValidation(featureId, transcript);
          stdout('');
          stdout(`Confirmada ${featureId}.`);
        } else {
          stdout(`${featureId} quedó pendiente de validación; podés confirmarla más tarde con "npm run feature-validation".`);
        }

        conversation.segment = [];
        lastProposedTitle = null;
        stdout('');
        stdout(`¿Otra idea? Seguí describiendo, o escribí "${END_KEYWORD}" para terminar la sesión.`);
        continue outer;
      }

      const humanTurn: BrainstormTurnRecord = { role: 'human', text: trimmed, recorded_at: new Date().toISOString() };
      conversation.transcript = [...conversation.transcript, humanTurn];
      conversation.segment = [...conversation.segment, humanTurn];

      if (conversation.segment.length > MAX_TURNS_PER_FEATURE_IDEA) {
        stdout('');
        stdout(`Se alcanzó el límite de ${MAX_TURNS_PER_FEATURE_IDEA} rondas para esta idea. Escribí "${CREATE_KEYWORD}" con lo que tengas hasta ahora.`);
        continue outer;
      }

      const turnResult = orchestrator.runBrainstormTurn(conversation.transcript, trimmed, conversation.competency);
      conversation.transcript = [
        ...conversation.transcript,
        { role: 'assistant', text: turnResult.reply, recorded_at: new Date().toISOString() },
      ];
      stdout('');
      stdout(turnResult.reply);

      // A decision the agent surfaced instead of taking, and a dimension it noticed. Printing only
      // `reply` dropped both: the profile above declared who owns which axis, and nothing acted on
      // it.
      if (turnResult.decision) {
        await takeDecision(conversation, turnResult.decision, ask, print);
      }

      if (turnResult.proposed_dimension) {
        await considerDimension(orchestrator, conversation, turnResult.proposed_dimension, ask, print);
      }

      if (turnResult.ready_to_draft) {
        lastProposedTitle = turnResult.proposed_title ?? lastProposedTitle;
        stdout('');
        stdout(`Suena lista para formalizarse (propuesta: "${turnResult.proposed_title ?? 'sin título propuesto'}"). Escribí "${CREATE_KEYWORD}" para convertirla en una feature, o seguí describiendo para ajustarla.`);
      }
    }
  } finally {
    rl.close();
  }

  return 0;
}
