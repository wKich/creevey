import path from 'path';
import { exec } from 'shelljs';
import { Configuration, DefinePlugin as FallbackDefinePlugin } from 'webpack';
import {
  isStorybookVersionLessThan,
  resolveFromStorybookCore,
  resolveFromStorybookCoreServer,
} from '../../server/storybook/helpers';

export function config(entry: string[] = []): string[] {
  return [...entry, require.resolve('./decorator')];
}

export function managerEntries(entry: string[] = []): string[] {
  return [...entry, require.resolve('./register')];
}

declare global {
  const __CREEVEY_SERVER_PORT__: number;
  const __CREEVEY_CLIENT_PORT__: number | null;
}
export interface CreeveyAddonOptions {
  creeveyConfigPath?: string;
  creeveyPreExtract?: string;
  creeveyPort?: number;
  clientPort?: number;
  configType: string;
  configDir: string;
  outputDir: string;
  skipExtract?: boolean;
  presets?: { apply: <T>(preset: string) => Promise<T | undefined> };
}

export function managerWebpack(config: Configuration, options: CreeveyAddonOptions): Promise<Configuration> {
  // TODO How to execute with non-webpack bundlers
  if (options.configType == 'PRODUCTION' && !isStorybookVersionLessThan(6, 2) && options.skipExtract != true) {
    const args: string[] = [];
    if (options.creeveyPreExtract) args.push(`--require "${options.creeveyPreExtract}"`);
    args.push(path.join(__dirname, '../../cli'));
    args.push(`--extract "${options.outputDir}"`);
    if (options.creeveyConfigPath) args.push(`--config "${options.creeveyConfigPath}"`);

    exec(`node ${args.join(' ')}`, { async: true });
  }
  return (options.presets?.apply<typeof import('webpack')>('webpackInstance') ?? Promise.resolve(undefined))
    .then(
      (webpack) =>
        webpack ??
        import(
          isStorybookVersionLessThan(6, 2)
            ? resolveFromStorybookCore('webpack')
            : resolveFromStorybookCoreServer('webpack')
        ),
    )
    .then((webpack: typeof import('webpack')) => {
      const { DefinePlugin = FallbackDefinePlugin } = webpack ?? {};
      config.plugins?.push(
        new DefinePlugin({
          __CREEVEY_SERVER_PORT__: options.creeveyPort ?? 3000,
          __CREEVEY_CLIENT_PORT__: options.clientPort,
        }),
      );
      return config;
    });
}

// TODO Execute build nodejs webpack bundle
// TODO It depends on watch. How to know it?
// TODO Or execute it in managerWebpack function
// TODO Additional check to do not run in recursion
// TODO quite option, don't proceed any output
// TODO Save bundle as main.cjs or something
// TODO What else?
