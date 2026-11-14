import type {ChildProcess} from 'node:child_process';
import {expectTypeOf, expectError} from 'nz';
import spawn, {
	SubprocessError,
	type Options,
	type Result,
	type Subprocess,
} from './index.js';

try {
	const result = await spawn('test');
	expectTypeOf(result).toBe<Result>();
	expectTypeOf(result.stdout).toBe<string>();
	expectTypeOf(result.stderr).toBe<string>();
	expectTypeOf(result.output).toBe<string>();
	expectTypeOf(result.command).toBe<string>();
	expectTypeOf(result.durationMs).toBe<number>();
	expectTypeOf(result.pipedFrom).toBe<Result | SubprocessError | undefined>();
	expectTypeOf(result.pipedFrom?.pipedFrom).toBe<Result | SubprocessError | undefined>();
	expectTypeOf(result.pipedFrom?.durationMs).toBe<number | undefined>();
	expectTypeOf(result).not.toBeAssignableTo<Error>();
	expectError(result.exitCode);
	expectError(result.signalName);
	expectError(result.isCanceled);
	expectError(result.other);
} catch (error) {
	if (error instanceof SubprocessError) {
		expectTypeOf(error.stdout).toBe<string>();
		expectTypeOf(error.stderr).toBe<string>();
		expectTypeOf(error.output).toBe<string>();
		expectTypeOf(error.command).toBe<string>();
		expectTypeOf(error.durationMs).toBe<number>();
		expectTypeOf(error.pipedFrom).toBe<Result | SubprocessError | undefined>();
		expectTypeOf(error.pipedFrom?.pipedFrom).toBe<Result | SubprocessError | undefined>();
		expectTypeOf(error.pipedFrom?.durationMs).toBe<number | undefined>();
		expectTypeOf(error).toBeAssignableTo<Error>();
		expectTypeOf(error.exitCode).toBe<number | undefined>();
		expectTypeOf(error.signalName).toBe<string | undefined>();
		expectTypeOf(error.isCanceled).toBe<boolean>();
		expectError(error.other);
	}
}

expectTypeOf({} as const).toBeAssignableTo<Options>();
expectTypeOf({argv0: 'test'} as const).toBeAssignableTo<Options>();
expectTypeOf({other: 'test'} as const).not.toBeAssignableTo<Options>();
expectTypeOf<'test'>().not.toBeAssignableTo<Options>();

await spawn('test', {argv0: 'test'} as const);
expectError(await spawn('test', {argv0: true} as const));
await spawn('test', {preferLocal: true} as const);
expectError(await spawn('test', {preferLocal: 'true'} as const));
await spawn('test', {env: {}} as const);
// eslint-disable-next-line @typescript-eslint/naming-convention
await spawn('test', {env: {TEST: 'test'}} as const);
expectError(await spawn('test', {env: true} as const));
// eslint-disable-next-line @typescript-eslint/naming-convention
expectError(await spawn('test', {env: {TEST: true}} as const));
await spawn('test', {stdin: 'pipe'} as const);
await spawn('test', {stdin: {string: 'test'} as const} as const);
expectError(await spawn('test', {stdin: {string: true} as const} as const));
expectError(await spawn('test', {stdin: {other: 'test'} as const} as const));
expectError(await spawn('test', {stdin: true} as const));
await spawn('test', {stdout: 'pipe'} as const);
expectError(await spawn('test', {stdout: {string: 'test'} as const} as const));
expectError(await spawn('test', {stdout: true} as const));
await spawn('test', {stderr: 'pipe'} as const);
expectError(await spawn('test', {stderr: {string: 'test'} as const} as const));
expectError(await spawn('test', {stderr: true} as const));
await spawn('test', {stdio: ['pipe', 'pipe', 'pipe'] as const} as const);
await spawn('test', {stdio: [{string: 'test'} as const, 'pipe', 'pipe'] as const} as const);
expectError(await spawn('test', {stdio: ['pipe', {string: 'test'} as const, 'pipe'] as const} as const));
expectError(await spawn('test', {stdio: ['pipe', 'pipe', {string: 'test'} as const] as const} as const));
expectError(await spawn('test', {stdio: [{string: true} as const, 'pipe', 'pipe'] as const} as const));
expectError(await spawn('test', {stdio: [{other: 'test'} as const, 'pipe', 'pipe'] as const} as const));
expectError(await spawn('test', {stdio: [true, true, true] as const} as const));
await spawn('test', {stdio: 'pipe'} as const);
expectError(await spawn('test', {stdio: true} as const));
expectError(await spawn('test', {stdio: null} as const));
expectError(await spawn('test', {cwd: null} as const));
expectError(await spawn('test', {other: 'test'} as const));

expectError(await spawn());
expectError(await spawn(true));
await spawn('test', [] as const);
await spawn('test', ['one'] as const);
expectError(await spawn('test', [true] as const));
await spawn('test', {} as const);
expectError(await spawn('test', true));
await spawn('test', ['one'] as const, {} as const);
expectError(await spawn('test', ['one'] as const, true));
expectError(await spawn('test', ['one'] as const, {} as const, true));

expectError(await spawn('test').pipe());
expectError(await spawn('test').pipe(true));
await spawn('test').pipe('test', [] as const);
await spawn('test').pipe('test', ['one'] as const);
expectError(await spawn('test').pipe('test', [true] as const));
await spawn('test').pipe('test', {} as const);
expectError(await spawn('test').pipe('test', true));
await spawn('test').pipe('test', ['one'] as const, {} as const);
expectError(await spawn('test').pipe('test', ['one'] as const, true));
expectError(await spawn('test').pipe('test', ['one'] as const, {} as const, true));

expectError(await spawn('test').pipe('test').pipe());
expectError(await spawn('test').pipe('test').pipe(true));
await spawn('test').pipe('test').pipe('test', [] as const);
await spawn('test').pipe('test').pipe('test', ['one'] as const);
expectError(await spawn('test').pipe('test').pipe('test', [true] as const));
await spawn('test').pipe('test').pipe('test', {} as const);
expectError(await spawn('test').pipe('test').pipe('test', true));
await spawn('test').pipe('test').pipe('test', ['one'] as const, {} as const);
expectError(await spawn('test').pipe('test').pipe('test', ['one'] as const, true));
expectError(await spawn('test').pipe('test').pipe('test', ['one'] as const, {} as const, true));

expectTypeOf(spawn('test').pipe('test')).toBe<Subprocess>();
expectTypeOf(spawn('test').pipe('test').pipe('test')).toBe<Subprocess>();
expectTypeOf(await spawn('test').pipe('test')).toBe<Result>();
expectTypeOf(await spawn('test').pipe('test').pipe('test')).toBe<Result>();

for await (const line of spawn('test')) {
	expectTypeOf(line).toBe<string>();
}

for await (const line of spawn('test').pipe('test')) {
	expectTypeOf(line).toBe<string>();
}

for await (const line of spawn('test').stdout) {
	expectTypeOf(line).toBe<string>();
}

for await (const line of spawn('test').pipe('test').stdout) {
	expectTypeOf(line).toBe<string>();
}

for await (const line of spawn('test').stderr) {
	expectTypeOf(line).toBe<string>();
}

for await (const line of spawn('test').pipe('test').stderr) {
	expectTypeOf(line).toBe<string>();
}

const subprocess = spawn('test');
expectTypeOf(subprocess).toBe<Subprocess>();

const nodeChildProcess = await subprocess.nodeChildProcess;
expectTypeOf(nodeChildProcess).toBe<ChildProcess>();
expectTypeOf(nodeChildProcess.pid).toBe<number | undefined>();

// Options forwarded to `node:child_process`
await spawn('test', {shell: true} as const);
await spawn('test', {shell: '/bin/bash'} as const);
expectError(await spawn('test', {shell: 1} as const));
await spawn('test', {timeout: 1e3} as const);
await spawn('test', {timeout: undefined} as const);
expectError(await spawn('test', {timeout: '1'} as const));
await spawn('test', {signal: AbortSignal.abort()} as const);
expectError(await spawn('test', {signal: 'abort'} as const));
await spawn('test', {killSignal: 'SIGKILL'} as const);
await spawn('test', {killSignal: 9} as const);
expectError(await spawn('test', {killSignal: 'NOPE'} as const));
await spawn('test', {detached: true} as const);
await spawn('test', {serialization: 'advanced'} as const);
expectError(await spawn('test', {serialization: 'nope'} as const));
await spawn('test', {windowsVerbatimArguments: true, windowsHide: true} as const);
await spawn('test', {stdio: ['pipe', 'pipe', 'pipe', 'ipc']} as const);
await spawn('test', {stdin: 0, stdout: 1, stderr: 2} as const);
await spawn('test', {cwd: 'test'} as const);
await spawn('test', {cwd: new URL('file:///test')} as const);
expectError(await spawn('test', {cwd: 1} as const));
await spawn('test', {env: {}} as const);
await spawn('test', {preferLocal: true} as const);

// The same options are accepted by `subprocess.pipe()`
await spawn('test').pipe('test', ['one'], {shell: true, timeout: 1e3});
await spawn('test').pipe('test', {stdio: ['pipe', 'pipe', 'pipe']});
