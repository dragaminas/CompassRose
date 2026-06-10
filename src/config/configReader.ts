import { readFileSync } from 'node:fs';
import { err, ok, type Result } from '../shared/result.js';
import type { ConfigurationIssue, ProjectConfiguration, ProjectConfigurationLoadResult } from './configTypes.js';
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
