import type {ChildProcess} from 'node:child_process';
import {
	expectType,
	expectAssignable,
	expectNotAssignable,
	expectError,
} from 'tsd';
import spawn, {
	SubprocessError,
	type Options,
	type Result,
	type Subprocess,
} from './index.js';

try {
	const result = await spawn('test');
	expectType<Result>(result);
	expectType<string>(result.stdout);
	expectType<string>(result.stderr);
	expectType<string>(result.output);
	expectType<string>(result.command);
	expectType<number>(result.durationMs);
	expectType<Result | SubprocessError | undefined>(result.pipedFrom);
	expectType<Result | SubprocessError | undefined>(result.pipedFrom?.pipedFrom);
	expectType<number | undefined>(result.pipedFrom?.durationMs);
	expectNotAssignable<Error>(result);
	expectError(result.exitCode);
	expectError(result.signalName);
	expectError(result.other);
} catch (error) {
	if (error instanceof SubprocessError) {
		expectType<string>(error.stdout);
		expectType<string>(error.stderr);
		expectType<string>(error.output);
		expectType<string>(error.command);
		expectType<number>(error.durationMs);
		expectType<Result | SubprocessError | undefined>(error.pipedFrom);
		expectType<Result | SubprocessError | undefined>(error.pipedFrom?.pipedFrom);
		expectType<number | undefined>(error.pipedFrom?.durationMs);
		expectAssignable<Error>(error);
		expectType<number | undefined>(error.exitCode);
		expectType<string | undefined>(error.signalName);
		expectError(error.other);
	}
}

expectAssignable<Options>({} as const);
expectAssignable<Options>({argv0: 'test'} as const);
expectNotAssignable<Options>({other: 'test'} as const);
expectNotAssignable<Options>('test');

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

expectType<Subprocess>(spawn('test').pipe('test'));
expectType<Subprocess>(spawn('test').pipe('test').pipe('test'));
expectType<Result>(await spawn('test').pipe('test'));
expectType<Result>(await spawn('test').pipe('test').pipe('test'));

for await (const line of spawn('test')) {
	expectType<string>(line);
}

for await (const line of spawn('test').pipe('test')) {
	expectType<string>(line);
}

for await (const line of spawn('test').stdout) {
	expectType<string>(line);
}

for await (const line of spawn('test').pipe('test').stdout) {
	expectType<string>(line);
}

for await (const line of spawn('test').stderr) {
	expectType<string>(line);
}

for await (const line of spawn('test').pipe('test').stderr) {
	expectType<string>(line);
}

const subprocess = spawn('test');
expectType<Subprocess>(subprocess);

const nodeChildProcess = await subprocess.nodeChildProcess;
expectType<ChildProcess>(nodeChildProcess);
expectType<number | undefined>(nodeChildProcess.pid);
