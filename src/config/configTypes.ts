import type { Result } from '../shared/result.js';
import type { SupportedPlatform } from '../platform/platformInfo.js';

export interface ConfigurationIssue {
  readonly field: string;
  readonly message: string;
  readonly line?: number;
}

export interface ProjectSection {
  readonly name: string;
  readonly supported_platforms: SupportedPlatform[];
  readonly documentation_root: string;
  readonly [key: string]: unknown;
}

export interface ExternalCliAdapterSection {
  readonly type: 'external_cli';
  readonly command: string;
  readonly args: readonly string[];
  readonly stdin: boolean;
  readonly input_file_argument: string;
  readonly output_file: string;
  readonly [key: string]: unknown;
}

export interface AdaptersSection {
  readonly external_cli: ExternalCliAdapterSection;
  readonly [key: string]: unknown;
}

export interface CommandsSection {
  readonly typecheck: string;
  readonly tests: string;
  readonly lint: string;
  readonly build: string;
  readonly [key: string]: string;
}

export interface DocumentationSection {
  readonly roadmap: string;
  readonly project_state: string;
  readonly config: string;
  readonly contracts_root: string;
  readonly [key: string]: unknown;
}

export interface ProjectConfiguration {
  readonly project: ProjectSection;
  readonly adapters: AdaptersSection;
  readonly commands: CommandsSection;
  readonly documentation: DocumentationSection;
  readonly [key: string]: unknown;
}

export type ProjectConfigurationLoadResult = Result<ProjectConfiguration, ConfigurationIssue[]>;
