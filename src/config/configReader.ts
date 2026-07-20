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

  if (issues.length > 0) {
    return err(issues);
  }

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

  const hasExternalCliCommand = 'command' in externalCliSection;
  if (hasExternalCliCommand && typeof externalCliSection['command'] !== 'string') {
    issues.push({
      field: 'adapters.external_cli.command',
      message: 'Present field adapters.external_cli.command must be a string.',
    });
  }

  const hasExternalCliArgs = 'args' in externalCliSection;
  if (hasExternalCliArgs) {
    if (!Array.isArray(externalCliSection['args'])) {
      issues.push({
        field: 'adapters.external_cli.args',
        message: 'Present field adapters.external_cli.args must be an array.',
      });
    } else {
      for (let i = 0; i < (externalCliSection['args'] as unknown[]).length; i++) {
        if (typeof (externalCliSection['args'] as unknown[])[i] !== 'string') {
          issues.push({
            field: 'adapters.external_cli.args',
            message: 'Present field adapters.external_cli.args must contain only strings.',
          });
          break;
        }
      }
    }
  }

  const hasExternalCliStdin = 'stdin' in externalCliSection;
  if (hasExternalCliStdin && typeof externalCliSection['stdin'] !== 'boolean') {
    issues.push({
      field: 'adapters.external_cli.stdin',
      message: 'Present field adapters.external_cli.stdin must be a boolean.',
    });
  }

  const hasExternalCliInputFile = 'input_file_argument' in externalCliSection;
  if (hasExternalCliInputFile && typeof externalCliSection['input_file_argument'] !== 'string') {
    issues.push({
      field: 'adapters.external_cli.input_file_argument',
      message: 'Present field adapters.external_cli.input_file_argument must be a string.',
    });
  }

  const hasExternalCliOutputFile = 'output_file' in externalCliSection;
  if (hasExternalCliOutputFile && typeof externalCliSection['output_file'] !== 'string') {
    issues.push({
      field: 'adapters.external_cli.output_file',
      message: 'Present field adapters.external_cli.output_file must be a string.',
    });
  }

  if (issues.length > 0) {
    return err(issues);
  }

  const externalCliCommand =
    typeof externalCliSection['command'] === 'string'
      ? externalCliSection['command']
      : '';
  const externalCliArgs: string[] =
    Array.isArray(externalCliSection['args'])
      ? (externalCliSection['args'] as string[])
      : [];
  const externalCliStdin =
    typeof externalCliSection['stdin'] === 'boolean'
      ? externalCliSection['stdin']
      : false;
  const externalCliInputFileArgument =
    typeof externalCliSection['input_file_argument'] === 'string'
      ? externalCliSection['input_file_argument']
      : '';
  const externalCliOutputFile =
    typeof externalCliSection['output_file'] === 'string'
      ? externalCliSection['output_file']
      : '';

  const optionalPolicySections: Record<string, unknown> = {};

  if ('execution' in parsedConfiguration) {
    const executionValue = parsedConfiguration['execution'];
    if (!isRecord(executionValue)) {
      return err([{
        field: 'execution',
        message: 'Optional section execution must be an object when present.',
      }]);
    }
    const executionSection = executionValue;
    const executionIssues: ConfigurationIssue[] = [];
    const executionMode = validateExecutionMode(executionSection, executionIssues);
    const taskGeneration = requireNonEmptyString(executionSection, 'task_generation', 'execution.task_generation', executionIssues);
    const repositoryIsSourceOfTruth = requireBooleanValue(executionSection, 'repository_is_source_of_truth', 'execution.repository_is_source_of_truth', executionIssues);
    const plannerUsesRepositoryState = requireBooleanValue(executionSection, 'planner_uses_repository_state', 'execution.planner_uses_repository_state', executionIssues);
    const orchestratorUsesAi = requireBooleanValue(executionSection, 'orchestrator_uses_ai', 'execution.orchestrator_uses_ai', executionIssues);
    const runtimeContract = requireNonEmptyString(executionSection, 'runtime_contract', 'execution.runtime_contract', executionIssues);
    const featureStateContract = requireNonEmptyString(executionSection, 'feature_state_contract', 'execution.feature_state_contract', executionIssues);

    if (executionIssues.length > 0) {
      return err(executionIssues);
    }

    optionalPolicySections['execution'] = {
      mode: executionMode,
      task_generation: taskGeneration,
      repository_is_source_of_truth: repositoryIsSourceOfTruth,
      planner_uses_repository_state: plannerUsesRepositoryState,
      orchestrator_uses_ai: orchestratorUsesAi,
      runtime_contract: runtimeContract,
      feature_state_contract: featureStateContract,
    };
  }

  if ('roles' in parsedConfiguration) {
    const rolesValue = parsedConfiguration['roles'];
    if (!isRecord(rolesValue)) {
      return err([{
        field: 'roles',
        message: 'Optional section roles must be an object when present.',
      }]);
    }
    const rolesSection = rolesValue;
    const rolesIssues: ConfigurationIssue[] = [];
    const roles = validateRolesSection(rolesSection, rolesIssues);

    if (rolesIssues.length > 0) {
      return err(rolesIssues);
    }

    optionalPolicySections['roles'] = roles;
  }

  if ('git_policy' in parsedConfiguration) {
    const gitPolicyValue = parsedConfiguration['git_policy'];
    if (!isRecord(gitPolicyValue)) {
      return err([{
        field: 'git_policy',
        message: 'Optional section git_policy must be an object when present.',
      }]);
    }
    const gitPolicySection = gitPolicyValue;
    const gitPolicyIssues: ConfigurationIssue[] = [];
    const gitPolicy = validateGitPolicySection(gitPolicySection, gitPolicyIssues);

    if (gitPolicyIssues.length > 0) {
      return err(gitPolicyIssues);
    }

    optionalPolicySections['git_policy'] = gitPolicy;
  }

  if ('development_policy' in parsedConfiguration) {
    const developmentPolicyValue = parsedConfiguration['development_policy'];
    if (!isRecord(developmentPolicyValue)) {
      return err([{
        field: 'development_policy',
        message: 'Optional section development_policy must be an object when present.',
      }]);
    }
    const developmentPolicySection = developmentPolicyValue;
    const developmentPolicyIssues: ConfigurationIssue[] = [];
    const developmentPolicy = validateDevelopmentPolicySection(developmentPolicySection, developmentPolicyIssues);

    if (developmentPolicyIssues.length > 0) {
      return err(developmentPolicyIssues);
    }

    optionalPolicySections['development_policy'] = developmentPolicy;
  }

  if ('review_policy' in parsedConfiguration) {
    const reviewPolicyValue = parsedConfiguration['review_policy'];
    if (!isRecord(reviewPolicyValue)) {
      return err([{
        field: 'review_policy',
        message: 'Optional section review_policy must be an object when present.',
      }]);
    }
    const reviewPolicySection = reviewPolicyValue;
    const reviewPolicyIssues: ConfigurationIssue[] = [];
    const reviewPolicy = validateReviewPolicySection(reviewPolicySection, reviewPolicyIssues);

    if (reviewPolicyIssues.length > 0) {
      return err(reviewPolicyIssues);
    }

    optionalPolicySections['review_policy'] = reviewPolicy;
  }

  if ('quality_gates' in parsedConfiguration) {
    const qualityGatesValue = parsedConfiguration['quality_gates'];
    if (!isRecord(qualityGatesValue)) {
      return err([{
        field: 'quality_gates',
        message: 'Optional section quality_gates must be an object when present.',
      }]);
    }
    const qualityGatesSection = qualityGatesValue;
    const qualityGatesIssues: ConfigurationIssue[] = [];
    const qualityGates = validateQualityGatesSection(qualityGatesSection, qualityGatesIssues);

    if (qualityGatesIssues.length > 0) {
      return err(qualityGatesIssues);
    }

    optionalPolicySections['quality_gates'] = qualityGates;
  }

  if ('limits' in parsedConfiguration) {
    const limitsValue = parsedConfiguration['limits'];
    if (!isRecord(limitsValue)) {
      return err([{
        field: 'limits',
        message: 'Optional section limits must be an object when present.',
      }]);
    }
    const limitsSection = limitsValue;
    const limitsIssues: ConfigurationIssue[] = [];
    const limits = validateLimitsSection(limitsSection, limitsIssues);

    if (limitsIssues.length > 0) {
      return err(limitsIssues);
    }

    optionalPolicySections['limits'] = limits;
  }

  const extraConfigurationFields: Record<string, unknown> = {};
  for (const key of Object.keys(parsedConfiguration)) {
    if (key !== 'project' && key !== 'adapters' && key !== 'commands' && key !== 'documentation') {
      extraConfigurationFields[key] = parsedConfiguration[key];
    }
  }

  if (!('git_policy' in optionalPolicySections)) {
    optionalPolicySections['git_policy'] = {
      require_clean_worktree_before_task: true,
      review_target: 'git_diff',
      allow_dirty_worktree: false,
      branch_per_task: 'disabled',
      commit_after_task: 'disabled',
    };
  }

  return ok(Object.assign({
    project: {
      ...projectSection,
      name: projectName,
      supported_platforms: supportedPlatforms,
      documentation_root: documentationRoot,
    },
    adapters: {
      ...adaptersSection,
      external_cli: {
        type: 'external_cli' as 'external_cli',
        command: externalCliCommand,
        args: externalCliArgs,
        stdin: externalCliStdin,
        input_file_argument: externalCliInputFileArgument,
        output_file: externalCliOutputFile,
      },
    },
    commands: {
      typecheck: commandsSection.typecheck,
      tests: commandsSection.tests,
      lint: commandsSection.lint,
      build: commandsSection.build,
    },
    documentation: {
      ...documentationSection,
      roadmap: documentationSection.roadmap,
      project_state: documentationSection.project_state,
      config: documentationSection.config,
      contracts_root: documentationSection.contracts_root,
    },
    git_policy: optionalPolicySections['git_policy'] as GitPolicySection,
    ...optionalPolicySections,
  }, extraConfigurationFields) as ProjectConfiguration);
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
  const maxRecoveryIterations = requireNonNegativeInteger(section, 'max_recovery_iterations', 'limits.max_recovery_iterations', issues);
  const stopOnQualityGateFailure = requireBooleanValue(section, 'stop_on_quality_gate_failure', 'limits.stop_on_quality_gate_failure', issues);
  const stopOnReviewFailure = requireBooleanValue(section, 'stop_on_review_failure', 'limits.stop_on_review_failure', issues);

  if (issues.length > 0) {
    return {
      max_tasks_per_run: 0,
      max_retries_per_task: 0,
      max_review_iterations: 0,
      max_recovery_iterations: 0,
      stop_on_quality_gate_failure: false,
      stop_on_review_failure: false,
    };
  }

  return {
    max_tasks_per_run: maxTasksPerRun,
    max_retries_per_task: maxRetriesPerTask,
    max_review_iterations: maxReviewIterations,
    max_recovery_iterations: maxRecoveryIterations,
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

  if (configuration.execution) {
    const executionMode = configuration.execution.mode;
    if (!VALID_EXECUTION_MODES.has(executionMode)) {
      issues.push({
        field: 'execution.mode',
        message: `Unsupported execution mode: ${executionMode}. Must be one of: interactive, semi_automatic, automatic.`,
      });
    }
  }

  if (configuration.roles) {
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
  }

  if (configuration.git_policy) {
    if (configuration.git_policy.require_clean_worktree_before_task && configuration.git_policy.allow_dirty_worktree) {
      issues.push({
        field: 'git_policy',
        message: 'Conflicting git policy: require_clean_worktree_before_task is true but allow_dirty_worktree is also true.',
      });
    }
  }

  const adapterKeys = new Set<string>();
  for (const key of Object.keys(configuration.adapters)) {
    adapterKeys.add(key);
  }

  if (configuration.roles) {
    const requiredRoleKeys = ['planner', 'implementer', 'reviewer'] as const;
    for (const role of requiredRoleKeys) {
      const entry = configuration.roles[role];
      if (entry.enabled) {
        if (!entry.adapter) {
          issues.push({
            field: `roles.${role}.adapter`,
            message: `Enabled role ${role} has no adapter configured.`,
          });
        } else if (!adapterKeys.has(entry.adapter)) {
          issues.push({
            field: `roles.${role}.adapter`,
            message: `Enabled role ${role} references adapter '${entry.adapter}' which is not defined in adapters section.`,
          });
        } else if (entry.adapter !== 'external_cli') {
          issues.push({
            field: `roles.${role}.adapter`,
            message: `Enabled role ${role} uses adapter '${entry.adapter}', but only the generic 'external_cli' adapter is supported in the MVP.`,
          });
        }
      }
    }
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
