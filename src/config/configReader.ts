import { readFileSync } from 'node:fs';
import { err, ok, type Result } from '../shared/result.js';
import type {
  ConfigurationIssue,
  DevelopmentPolicyDefault,
  DevelopmentPolicySection,
  ExecutionMode,
  GitBranchPerTask,
  GitCommitAfterTask,
  GitPolicySection,
  GitReviewTarget,
  LimitsSection,
  ProjectConfiguration,
  ProjectConfigurationLoadResult,
  QualityGatesSection,
  ReviewPolicyMode,
  ReviewPolicySection,
  RolesSection,
} from './configTypes.js';
import { isSupportedPlatformName, type SupportedPlatform } from '../platform/platformInfo.js';

interface YamlLine {
  readonly number: number;
  readonly indent: number;
  readonly text: string;
  readonly trimmed: string;
}

interface YamlParseState {
  readonly lines: YamlLine[];
  index: number;
}

const REQUIRED_TOP_LEVEL_SECTIONS = ['project', 'adapters', 'commands', 'documentation'] as const;
const REQUIRED_COMMAND_KEYS = ['typecheck', 'tests', 'lint', 'build'] as const;
const REQUIRED_DOCUMENTATION_KEYS = ['roadmap', 'project_state', 'config', 'contracts_root'] as const;
const REQUIRED_SUPPORTED_PLATFORMS = new Set<SupportedPlatform>(['linux', 'windows']);

export function readProjectConfiguration(configPath: string): ProjectConfigurationLoadResult {
  const markdown = readFileSync(configPath, 'utf8');
  const blockResult = extractConfigurationBlock(markdown);
  if (!blockResult.ok) {
    return blockResult;
  }

  const parsedBlockResult = parseYamlBlock(blockResult.value);
  if (!parsedBlockResult.ok) {
    return parsedBlockResult;
  }

  return validateProjectConfiguration(parsedBlockResult.value);
}

function extractConfigurationBlock(markdown: string): Result<string, ConfigurationIssue[]> {
  const configurationHeadingIndex = markdown.indexOf('## Configuration');
  if (configurationHeadingIndex === -1) {
    return err([
      {
        field: 'markdown.configuration',
        message: 'Missing ## Configuration section.',
      },
    ]);
  }

  const configurationFenceStart = markdown.indexOf('```yaml', configurationHeadingIndex);
  if (configurationFenceStart === -1) {
    return err([
      {
        field: 'markdown.configuration',
        message: 'Missing ```yaml configuration block.',
      },
    ]);
  }

  const blockStart = configurationFenceStart + '```yaml'.length;
  const blockEnd = markdown.indexOf('```', blockStart);
  if (blockEnd === -1) {
    return err([
      {
        field: 'markdown.configuration',
        message: 'Unterminated ```yaml configuration block.',
      },
    ]);
  }

  return ok(dedentBlock(markdown.slice(blockStart, blockEnd).trim()));
}

function dedentBlock(text: string): string {
  const lines = text.split(/\r?\n/);
  const indentValues = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => leadingSpaces(line));

  const minimumIndent = indentValues.length > 0 ? Math.min(...indentValues) : 0;

  return lines.map((line) => line.slice(Math.min(minimumIndent, leadingSpaces(line)))).join('\n');
}

function parseYamlBlock(text: string): Result<Record<string, unknown>, ConfigurationIssue[]> {
  const state: YamlParseState = {
    lines: text.split(/\r?\n/).map((textLine, index) => ({
      number: index + 1,
      indent: leadingSpaces(textLine),
      text: textLine,
      trimmed: textLine.trim(),
    })),
    index: 0,
  };

  const parsedResult = parseBlock(state, 0);
  if (!parsedResult.ok) {
    return err(parsedResult.error);
  }

  skipTrivia(state);
  if (state.index < state.lines.length) {
    return err([
      {
        field: `yaml.line.${state.lines[state.index]!.number}`,
        message: 'Unexpected content after the end of the configuration block.',
        line: state.lines[state.index]!.number,
      },
    ]);
  }

  if (!isRecord(parsedResult.value)) {
    return err([
      {
        field: 'yaml.root',
        message: 'Configuration block must parse to a mapping.',
      },
    ]);
  }

  return ok(parsedResult.value);
}

function parseBlock(state: YamlParseState, expectedIndent: number): Result<unknown, ConfigurationIssue[]> {
  skipTrivia(state);
  const nextLine = state.lines[state.index];
  if (!nextLine) {
    return ok({});
  }

  if (nextLine.indent < expectedIndent) {
    return ok({});
  }

  if (nextLine.indent > expectedIndent) {
    return err([
      {
        field: `yaml.line.${nextLine.number}`,
        message: `Unexpected indentation on line ${nextLine.number}.`,
        line: nextLine.number,
      },
    ]);
  }

  if (nextLine.trimmed.startsWith('- ')) {
    return parseArrayBlock(state, expectedIndent);
  }

  return parseObjectBlock(state, expectedIndent);
}

function parseObjectBlock(state: YamlParseState, expectedIndent: number): Result<Record<string, unknown>, ConfigurationIssue[]> {
  const value: Record<string, unknown> = {};

  while (true) {
    skipTrivia(state);
    const currentLine = state.lines[state.index];
    if (!currentLine || currentLine.indent < expectedIndent) {
      break;
    }

    if (currentLine.indent > expectedIndent) {
      return err([
        {
          field: `yaml.line.${currentLine.number}`,
          message: `Unexpected indentation on line ${currentLine.number}.`,
          line: currentLine.number,
        },
      ]);
    }

    if (currentLine.trimmed.startsWith('- ')) {
      return err([
        {
          field: `yaml.line.${currentLine.number}`,
          message: `Unexpected array item on line ${currentLine.number} inside a mapping block.`,
          line: currentLine.number,
        },
      ]);
    }

    const separatorIndex = currentLine.trimmed.indexOf(':');
    if (separatorIndex === -1) {
      return err([
        {
          field: `yaml.line.${currentLine.number}`,
          message: `Expected a key/value pair on line ${currentLine.number}.`,
          line: currentLine.number,
        },
      ]);
    }

    const key = currentLine.trimmed.slice(0, separatorIndex).trim();
    const rawValue = currentLine.trimmed.slice(separatorIndex + 1);
    if (key.length === 0) {
      return err([
        {
          field: `yaml.line.${currentLine.number}`,
          message: `Missing key on line ${currentLine.number}.`,
          line: currentLine.number,
        },
      ]);
    }

    state.index += 1;

    const inlineValue = rawValue.trim();
    if (inlineValue.length > 0) {
      value[key] = parseInlineValue(inlineValue);
      continue;
    }

    skipTrivia(state);
    const childLine = state.lines[state.index];
    if (!childLine || childLine.indent <= expectedIndent) {
      value[key] = null;
      continue;
    }

    const childResult = parseBlock(state, childLine.indent);
    if (!childResult.ok) {
      return childResult;
    }

    value[key] = childResult.value;
  }

  return ok(value);
}

function parseArrayBlock(state: YamlParseState, expectedIndent: number): Result<unknown[], ConfigurationIssue[]> {
  const value: unknown[] = [];

  while (true) {
    skipTrivia(state);
    const currentLine = state.lines[state.index];
    if (!currentLine || currentLine.indent < expectedIndent) {
      break;
    }

    if (currentLine.indent > expectedIndent) {
      return err([
        {
          field: `yaml.line.${currentLine.number}`,
          message: `Unexpected indentation on line ${currentLine.number}.`,
          line: currentLine.number,
        },
      ]);
    }

    if (!currentLine.trimmed.startsWith('- ')) {
      return err([
        {
          field: `yaml.line.${currentLine.number}`,
          message: `Expected an array item on line ${currentLine.number}.`,
          line: currentLine.number,
        },
      ]);
    }

    const itemText = currentLine.trimmed.slice(2).trim();
    state.index += 1;

    if (itemText.length > 0) {
      value.push(parseInlineValue(itemText));
      continue;
    }

    skipTrivia(state);
    const childLine = state.lines[state.index];
    if (!childLine || childLine.indent <= expectedIndent) {
      value.push(null);
      continue;
    }

    const childResult = parseBlock(state, childLine.indent);
    if (!childResult.ok) {
      return childResult;
    }

    value.push(childResult.value);
  }

  return ok(value);
}

function parseInlineValue(rawValue: string): unknown {
  if (rawValue === '[]') {
    return [];
  }

  if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
    const innerValue = rawValue.slice(1, -1).trim();
    if (innerValue.length === 0) {
      return [];
    }

    return splitInlineArray(innerValue).map((item) => parseInlineValue(item));
  }

  if (isQuotedString(rawValue)) {
    return unquoteString(rawValue);
  }

  if (rawValue === 'true') {
    return true;
  }

  if (rawValue === 'false') {
    return false;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
    return Number(rawValue);
  }

  return rawValue;
}

function isQuotedString(value: string): boolean {
  return (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  );
}

function unquoteString(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  return value;
}

function splitInlineArray(value: string): string[] {
  const items: string[] = [];
  let currentItem = '';
  let inSingleQuotes = false;
  let inDoubleQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
      currentItem += character;
      continue;
    }

    if (character === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
      currentItem += character;
      continue;
    }

    if (character === ',' && !inSingleQuotes && !inDoubleQuotes) {
      items.push(currentItem.trim());
      currentItem = '';
      continue;
    }

    currentItem += character;
  }

  if (currentItem.trim().length > 0) {
    items.push(currentItem.trim());
  }

  return items;
}

function validateProjectConfiguration(parsedConfiguration: Record<string, unknown>): ProjectConfigurationLoadResult {
  const issues: ConfigurationIssue[] = [];

  const projectSection = requireObjectSection(parsedConfiguration, 'project', 'project', issues);
  const adaptersSection = requireObjectSection(parsedConfiguration, 'adapters', 'adapters', issues);
  const commandsSection = requireObjectSection(parsedConfiguration, 'commands', 'commands', issues);
  const documentationSection = requireObjectSection(parsedConfiguration, 'documentation', 'documentation', issues);

  if (issues.length > 0) {
    return err(issues);
  }

  const projectName = requireNonEmptyString(projectSection, 'name', 'project.name', issues);
  const supportedPlatforms = requireSupportedPlatforms(
    projectSection,
    'supported_platforms',
    'project.supported_platforms',
    issues
  );
  const documentationRoot = requireNonEmptyString(
    projectSection,
    'documentation_root',
    'project.documentation_root',
    issues
  );

  const externalCliSection = requireObjectSection(
    adaptersSection,
    'external_cli',
    'adapters.external_cli',
    issues
  );
  const externalCliType = requireRequiredString(
    externalCliSection,
    'type',
    'adapters.external_cli.type',
    issues
  );
  const externalCliCommand = requireStringValue(
    externalCliSection,
    'command',
    'adapters.external_cli.command',
    issues
  );
  const externalCliArgs = requireStringArrayValue(
    externalCliSection,
    'args',
    'adapters.external_cli.args',
    issues
  );
  const externalCliStdin = requireBooleanValue(
    externalCliSection,
    'stdin',
    'adapters.external_cli.stdin',
    issues
  );
  const externalCliInputFileArgument = requireStringValue(
    externalCliSection,
    'input_file_argument',
    'adapters.external_cli.input_file_argument',
    issues
  );
  const externalCliOutputFile = requireStringValue(
    externalCliSection,
    'output_file',
    'adapters.external_cli.output_file',
    issues
  );

  const commands = {
    typecheck: requireCommandValue(commandsSection, 'typecheck', 'commands.typecheck', issues),
    tests: requireCommandValue(commandsSection, 'tests', 'commands.tests', issues),
    lint: requireCommandValue(commandsSection, 'lint', 'commands.lint', issues),
    build: requireCommandValue(commandsSection, 'build', 'commands.build', issues),
  } as const;

  const documentation = {
    roadmap: requireNonEmptyString(documentationSection, 'roadmap', 'documentation.roadmap', issues),
    project_state: requireNonEmptyString(
      documentationSection,
      'project_state',
      'documentation.project_state',
      issues
    ),
    config: requireNonEmptyString(documentationSection, 'config', 'documentation.config', issues),
    contracts_root: requireNonEmptyString(
      documentationSection,
      'contracts_root',
      'documentation.contracts_root',
      issues
    ),
  } as const;

  if (issues.length > 0) {
    return err(issues);
  }

  if (externalCliType !== 'external_cli') {
    issues.push({
      field: 'adapters.external_cli.type',
      message: 'The MVP adapter type must be external_cli.',
    });
  }

  if (issues.length > 0) {
    return err(issues);
  }

  const executionSection = requireObjectSection(parsedConfiguration, 'execution', 'execution', issues);
  const executionMode = validateExecutionMode(executionSection, issues);
  const taskGeneration = requireNonEmptyString(executionSection, 'task_generation', 'execution.task_generation', issues);
  const repositoryIsSourceOfTruth = requireBooleanValue(executionSection, 'repository_is_source_of_truth', 'execution.repository_is_source_of_truth', issues);
  const plannerUsesRepositoryState = requireBooleanValue(executionSection, 'planner_uses_repository_state', 'execution.planner_uses_repository_state', issues);
  const orchestratorUsesAi = requireBooleanValue(executionSection, 'orchestrator_uses_ai', 'execution.orchestrator_uses_ai', issues);
  const runtimeContract = requireNonEmptyString(executionSection, 'runtime_contract', 'execution.runtime_contract', issues);
  const featureStateContract = requireNonEmptyString(executionSection, 'feature_state_contract', 'execution.feature_state_contract', issues);

  if (issues.length > 0) {
    return err(issues);
  }

  const rolesSection = requireObjectSection(parsedConfiguration, 'roles', 'roles', issues);
  const roles = validateRolesSection(rolesSection, issues);

  if (issues.length > 0) {
    return err(issues);
  }

  const gitPolicySection = requireObjectSection(parsedConfiguration, 'git_policy', 'git_policy', issues);
  const gitPolicy = validateGitPolicySection(gitPolicySection, issues);

  if (issues.length > 0) {
    return err(issues);
  }

  const developmentPolicySection = requireObjectSection(parsedConfiguration, 'development_policy', 'development_policy', issues);
  const developmentPolicy = validateDevelopmentPolicySection(developmentPolicySection, issues);

  if (issues.length > 0) {
    return err(issues);
  }

  const reviewPolicySection = requireObjectSection(parsedConfiguration, 'review_policy', 'review_policy', issues);
  const reviewPolicy = validateReviewPolicySection(reviewPolicySection, issues);

  if (issues.length > 0) {
    return err(issues);
  }

  const qualityGatesSection = requireObjectSection(parsedConfiguration, 'quality_gates', 'quality_gates', issues);
  const qualityGates = validateQualityGatesSection(qualityGatesSection, issues);

  if (issues.length > 0) {
    return err(issues);
  }

  const limitsSection = requireObjectSection(parsedConfiguration, 'limits', 'limits', issues);
  const limits = validateLimitsSection(limitsSection, issues);

  if (issues.length > 0) {
    return err(issues);
  }

  return ok({
    ...parsedConfiguration,
    project: {
      ...projectSection,
      name: projectName,
      supported_platforms: supportedPlatforms,
      documentation_root: documentationRoot,
    },
    adapters: {
      ...adaptersSection,
      external_cli: {
        ...externalCliSection,
        type: 'external_cli',
        command: externalCliCommand,
        args: externalCliArgs,
        stdin: externalCliStdin,
        input_file_argument: externalCliInputFileArgument,
        output_file: externalCliOutputFile,
      },
    },
    commands: {
      ...commandsSection,
      ...commands,
    },
    documentation: {
      ...documentationSection,
      ...documentation,
    },
    execution: {
      mode: executionMode,
      task_generation: taskGeneration,
      repository_is_source_of_truth: repositoryIsSourceOfTruth,
      planner_uses_repository_state: plannerUsesRepositoryState,
      orchestrator_uses_ai: orchestratorUsesAi,
      runtime_contract: runtimeContract,
      feature_state_contract: featureStateContract,
    },
    roles,
    git_policy: gitPolicy,
    development_policy: developmentPolicy,
    review_policy: reviewPolicy,
    quality_gates: qualityGates,
    limits: limits,
  });
}

function requireObjectSection(
  parent: Record<string, unknown>,
  propertyKey: string,
  fieldPath: string,
  issues: ConfigurationIssue[]
): Record<string, unknown> {
  const value = parent[propertyKey];
  if (!isRecord(value)) {
    issues.push({
      field: fieldPath,
      message: `Missing required section ${fieldPath}.`,
    });
    return {};
  }

  return value;
}

function requireNonEmptyString(
  parent: Record<string, unknown>,
  propertyKey: string,
  fieldPath: string,
  issues: ConfigurationIssue[]
): string {
  const value = parent[propertyKey];
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push({
      field: fieldPath,
      message: `Missing required string field ${fieldPath}.`,
    });
    return '';
  }

  return value;
}

function requireRequiredString(
  parent: Record<string, unknown>,
  propertyKey: string,
  fieldPath: string,
  issues: ConfigurationIssue[]
): string {
  const value = parent[propertyKey];
  if (typeof value !== 'string') {
    issues.push({
      field: fieldPath,
      message: `Missing required string field ${fieldPath}.`,
    });
    return '';
  }

  return value;
}

function requireStringValue(
  parent: Record<string, unknown>,
  propertyKey: string,
  fieldPath: string,
  issues: ConfigurationIssue[]
): string {
  const value = parent[propertyKey];
  if (typeof value !== 'string') {
    issues.push({
      field: fieldPath,
      message: `Missing required string field ${fieldPath}.`,
    });
    return '';
  }

  return value;
}

function requireBooleanValue(
  parent: Record<string, unknown>,
  propertyKey: string,
  fieldPath: string,
  issues: ConfigurationIssue[]
): boolean {
  const value = parent[propertyKey];
  if (typeof value !== 'boolean') {
    issues.push({
      field: fieldPath,
      message: `Missing required boolean field ${fieldPath}.`,
    });
    return false;
  }

  return value;
}

function requireStringArrayValue(
  parent: Record<string, unknown>,
  propertyKey: string,
  fieldPath: string,
  issues: ConfigurationIssue[]
): readonly string[] {
  const value = parent[propertyKey];
  if (!Array.isArray(value)) {
    issues.push({
      field: fieldPath,
      message: `Missing required array field ${fieldPath}.`,
    });
    return [];
  }

  const values: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      issues.push({
        field: fieldPath,
        message: `Field ${fieldPath} must contain only strings.`,
      });
      return [];
    }

    values.push(entry);
  }

  return values;
}

function requireCommandValue(
  parent: Record<string, unknown>,
  propertyKey: string,
  fieldPath: string,
  issues: ConfigurationIssue[]
): string {
  const value = parent[propertyKey];
  if (typeof value !== 'string') {
    issues.push({
      field: fieldPath,
      message: `Missing required command key ${fieldPath}.`,
    });
    return '';
  }

  if (value.length > 0 && value.trim().length === 0) {
    issues.push({
      field: fieldPath,
      message: `Command ${fieldPath} must be empty or contain a non-whitespace shell command.`,
    });
    return '';
  }

  return value;
}

function requireSupportedPlatforms(
  parent: Record<string, unknown>,
  propertyKey: string,
  fieldPath: string,
  issues: ConfigurationIssue[]
): SupportedPlatform[] {
  const value = parent[propertyKey];
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({
      field: fieldPath,
      message: `Missing required array field ${fieldPath}.`,
    });
    return [];
  }

  const supportedPlatforms: SupportedPlatform[] = [];
  for (const item of value) {
    if (!isSupportedPlatformName(item)) {
      issues.push({
        field: fieldPath,
        message: `Unsupported platform value in ${fieldPath}.`,
      });
      continue;
    }

    supportedPlatforms.push(item);
  }

  return supportedPlatforms;
}

const VALID_EXECUTION_MODES = new Set<ExecutionMode>(['interactive', 'semi_automatic', 'automatic']);
const VALID_GIT_REVIEW_TARGETS = new Set<GitReviewTarget>(['git_diff']);
const VALID_GIT_BRANCH_PER_TASK = new Set<GitBranchPerTask>(['required', 'optional', 'disabled']);
const VALID_GIT_COMMIT_AFTER_TASK = new Set<GitCommitAfterTask>(['automatic', 'manual', 'disabled']);
const VALID_DEVELOPMENT_POLICY_DEFAULTS = new Set<DevelopmentPolicyDefault>(['test_guided', 'implementation_first', 'documentation_first', 'strict_tdd']);
const VALID_REVIEW_POLICY_MODES = new Set<ReviewPolicyMode>(['required', 'optional', 'disabled']);
const REQUIRED_ROLE_KEYS = ['planner', 'implementer', 'reviewer'] as const;

function validateExecutionMode(section: Record<string, unknown>, issues: ConfigurationIssue[]): ExecutionMode {
  const value = section['mode'];
  if (typeof value !== 'string' || !VALID_EXECUTION_MODES.has(value as ExecutionMode)) {
    issues.push({
      field: 'execution.mode',
      message: `Unsupported execution mode: ${typeof value === 'string' ? value : String(value)}. Must be one of: interactive, semi_automatic, automatic.`,
    });
    return 'interactive';
  }
  return value as ExecutionMode;
}

function validateRolesSection(section: Record<string, unknown>, issues: ConfigurationIssue[]): RolesSection {
  const roles: Record<string, unknown> = {};

  for (const roleKey of REQUIRED_ROLE_KEYS) {
    const roleValue = section[roleKey];
    const rolePath = `roles.${roleKey}`;

    if (!isRecord(roleValue)) {
      issues.push({
        field: rolePath,
        message: `Missing required role entry: ${rolePath}.`,
      });
      roles[roleKey] = { enabled: false, adapter: '' };
      continue;
    }

    const enabled = requireBooleanValue(roleValue, 'enabled', `${rolePath}.enabled`, issues);
    const adapter = requireRequiredString(roleValue, 'adapter', `${rolePath}.adapter`, issues);

    roles[roleKey] = { enabled, adapter };
  }

  if (issues.length > 0) {
    return {
      planner: { enabled: false, adapter: '' },
      implementer: { enabled: false, adapter: '' },
      reviewer: { enabled: false, adapter: '' },
    };
  }

  return {
    planner: roles.planner as { enabled: boolean; adapter: string },
    implementer: roles.implementer as { enabled: boolean; adapter: string },
    reviewer: roles.reviewer as { enabled: boolean; adapter: string },
  } as RolesSection;
}

function validateGitPolicySection(section: Record<string, unknown>, issues: ConfigurationIssue[]): GitPolicySection {
  const requireCleanWorktree = requireBooleanValue(section, 'require_clean_worktree_before_task', 'git_policy.require_clean_worktree_before_task', issues);
  const allowDirtyWorktree = requireBooleanValue(section, 'allow_dirty_worktree', 'git_policy.allow_dirty_worktree', issues);

  const reviewTarget = validateGitEnum(section['review_target'], 'git_policy.review_target', VALID_GIT_REVIEW_TARGETS, issues);
  const branchPerTask = validateGitEnum(section['branch_per_task'], 'git_policy.branch_per_task', VALID_GIT_BRANCH_PER_TASK, issues);
  const commitAfterTask = validateGitEnum(section['commit_after_task'], 'git_policy.commit_after_task', VALID_GIT_COMMIT_AFTER_TASK, issues);

  if (issues.length > 0) {
    return {
      require_clean_worktree_before_task: false,
      review_target: 'git_diff',
      allow_dirty_worktree: false,
      branch_per_task: 'disabled',
      commit_after_task: 'disabled',
    };
  }

  return {
    require_clean_worktree_before_task: requireCleanWorktree,
    review_target: reviewTarget,
    allow_dirty_worktree: allowDirtyWorktree,
    branch_per_task: branchPerTask,
    commit_after_task: commitAfterTask,
  };
}

function validateGitEnum<T extends string>(
  value: unknown,
  fieldPath: string,
  validValues: Set<T>,
  issues: ConfigurationIssue[]
): T {
  if (typeof value !== 'string' || !validValues.has(value as T)) {
    issues.push({
      field: fieldPath,
      message: `Invalid ${fieldPath} value: ${typeof value === 'string' ? value : String(value)}.`,
    });
    return Array.from(validValues)[0] as T;
  }
  return value as T;
}

function validateDevelopmentPolicySection(section: Record<string, unknown>, issues: ConfigurationIssue[]): DevelopmentPolicySection {
  const defaultValue = section['default'];
  if (typeof defaultValue !== 'string' || !VALID_DEVELOPMENT_POLICY_DEFAULTS.has(defaultValue as DevelopmentPolicyDefault)) {
    issues.push({
      field: 'development_policy.default',
      message: `Unsupported development_policy.default: ${typeof defaultValue === 'string' ? defaultValue : String(defaultValue)}. Must be one of: test_guided, implementation_first, documentation_first, strict_tdd.`,
    });
    return { default: 'implementation_first' };
  }
  return { default: defaultValue as DevelopmentPolicyDefault };
}

function validateReviewPolicySection(section: Record<string, unknown>, issues: ConfigurationIssue[]): ReviewPolicySection {
  const modeValue = section['mode'];
  if (typeof modeValue !== 'string' || !VALID_REVIEW_POLICY_MODES.has(modeValue as ReviewPolicyMode)) {
    issues.push({
      field: 'review_policy.mode',
      message: `Unsupported review_policy.mode: ${typeof modeValue === 'string' ? modeValue : String(modeValue)}. Must be one of: required, optional, disabled.`,
    });
    return { mode: 'required', record_skipped_review: false };
  }

  const recordSkippedReview = requireBooleanValue(section, 'record_skipped_review', 'review_policy.record_skipped_review', issues);

  if (issues.length > 0) {
    return { mode: 'required' as ReviewPolicyMode, record_skipped_review: false };
  }

  return { mode: modeValue as ReviewPolicyMode, record_skipped_review: recordSkippedReview };
}

function validateQualityGatesSection(section: Record<string, unknown>, issues: ConfigurationIssue[]): QualityGatesSection {
  const enabled = requireBooleanValue(section, 'enabled', 'quality_gates.enabled', issues);

  const required = requireStringArrayValue(section, 'required', 'quality_gates.required', issues);
  const optional = requireStringArrayValue(section, 'optional', 'quality_gates.optional', issues);

  if (issues.length > 0) {
    return { enabled: false, required: [], optional: [] };
  }

  return { enabled, required: [...required], optional: [...optional] };
}

function validateLimitsSection(section: Record<string, unknown>, issues: ConfigurationIssue[]): LimitsSection {
  const maxTasksPerRun = requireNonNegativeInteger(section, 'max_tasks_per_run', 'limits.max_tasks_per_run', issues);
  const maxRetriesPerTask = requireNonNegativeInteger(section, 'max_retries_per_task', 'limits.max_retries_per_task', issues);
  const maxReviewIterations = requireNonNegativeInteger(section, 'max_review_iterations', 'limits.max_review_iterations', issues);
  const stopOnQualityGateFailure = requireBooleanValue(section, 'stop_on_quality_gate_failure', 'limits.stop_on_quality_gate_failure', issues);
  const stopOnReviewFailure = requireBooleanValue(section, 'stop_on_review_failure', 'limits.stop_on_review_failure', issues);

  if (issues.length > 0) {
    return {
      max_tasks_per_run: 0,
      max_retries_per_task: 0,
      max_review_iterations: 0,
      stop_on_quality_gate_failure: false,
      stop_on_review_failure: false,
    };
  }

  return {
    max_tasks_per_run: maxTasksPerRun,
    max_retries_per_task: maxRetriesPerTask,
    max_review_iterations: maxReviewIterations,
    stop_on_quality_gate_failure: stopOnQualityGateFailure,
    stop_on_review_failure: stopOnReviewFailure,
  };
}

function requireNonNegativeInteger(
  parent: Record<string, unknown>,
  propertyKey: string,
  fieldPath: string,
  issues: ConfigurationIssue[]
): number {
  const value = parent[propertyKey];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    issues.push({
      field: fieldPath,
      message: `Field ${fieldPath} must be a non-negative integer, got: ${typeof value === 'number' ? value : String(value)}.`,
    });
    return 0;
  }
  return value;
}

export function validateRuntimePreconditions(configuration: ProjectConfiguration): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];

  const executionMode = configuration.execution.mode;
  if (!VALID_EXECUTION_MODES.has(executionMode)) {
    issues.push({
      field: 'execution.mode',
      message: `Unsupported execution mode: ${executionMode}. Must be one of: interactive, semi_automatic, automatic.`,
    });
  }

  const requiredRoles = ['planner', 'implementer', 'reviewer'] as const;
  for (const role of requiredRoles) {
    const entry = configuration.roles[role];
    if (!entry.enabled) {
      issues.push({
        field: `roles.${role}.enabled`,
        message: `Required role ${role} is disabled. The MVP runtime requires the planner role to be enabled.`,
      });
    }
  }

  if (configuration.git_policy.require_clean_worktree_before_task && configuration.git_policy.allow_dirty_worktree) {
    issues.push({
      field: 'git_policy',
      message: 'Conflicting git policy: require_clean_worktree_before_task is true but allow_dirty_worktree is also true.',
    });
  }

  return issues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function skipTrivia(state: YamlParseState): void {
  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (!line) {
      break;
    }

    if (line.trimmed.length === 0 || line.trimmed.startsWith('#')) {
      state.index += 1;
      continue;
    }

    break;
  }
}

function leadingSpaces(value: string): number {
  const match = value.match(/^ */);
  return match ? match[0].length : 0;
}
