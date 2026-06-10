export type SupportedPlatform = 'linux' | 'windows';

export function getCurrentSupportedPlatform(platform: NodeJS.Platform = process.platform): SupportedPlatform | null {
  if (platform === 'linux') {
    return 'linux';
  }

  if (platform === 'win32') {
    return 'windows';
  }

  return null;
}

export function isSupportedPlatformName(value: unknown): value is SupportedPlatform {
  return value === 'linux' || value === 'windows';
}
