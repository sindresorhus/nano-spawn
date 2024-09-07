import type {ChildProcess, SpawnOptions} from 'node:child_process';

type StdioOption = Readonly<Exclude<SpawnOptions['stdio'], undefined>[number]>;
type StdinOption = StdioOption | {readonly string?: string};

export type Options = Omit<SpawnOptions, 'env' | 'stdio'> & Readonly<Partial<{
	stdin: StdinOption;

	stdout: StdioOption;

	stderr: StdioOption;

	stdio: SpawnOptions['stdio'] | readonly [StdinOption, ...readonly StdioOption[]];

	preferLocal: boolean;

	// Fixes issues with Remix and Next.js
	// See https://github.com/sindresorhus/execa/pull/1141
	env: Readonly<Partial<Record<string, string>>>;
}>>;

export type Result = {
	stdout: string;

	stderr: string;

	output: string;

	command: string;

	durationMs: number;

	pipedFrom?: Result | SubprocessError;
};

export type SubprocessError = Error & Result & {
	exitCode?: number;

	signalName?: string;
};

export type Subprocess = Promise<Result> & AsyncIterable<string> & {
	nodeChildProcess: Promise<ChildProcess>;

	stdout: AsyncIterable<string>;

	stderr: AsyncIterable<string>;

	pipe(file: string, arguments?: readonly string[], options?: Options): Subprocess;
	pipe(file: string, options?: Options): Subprocess;
};

export default function nanoSpawn(file: string, arguments?: readonly string[], options?: Options): Subprocess;
export default function nanoSpawn(file: string, options?: Options): Subprocess;
