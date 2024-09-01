import type {ChildProcess} from 'node:child_process';
import {
	expectType,
	expectAssignable,
	expectNotAssignable,
	expectError,
} from 'tsd';
import nanoSpawn, {
	type Options,
	type Result,
	type SubprocessError,
	type Subprocess,
} from './index.js';

try {
	const result = await nanoSpawn('test');
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
	const subprocessError = error as SubprocessError;
	expectType<string>(subprocessError.stdout);
	expectType<string>(subprocessError.stderr);
	expectType<string>(subprocessError.output);
	expectType<string>(subprocessError.command);
	expectType<number>(subprocessError.durationMs);
	expectType<Result | SubprocessError | undefined>(subprocessError.pipedFrom);
	expectType<Result | SubprocessError | undefined>(subprocessError.pipedFrom?.pipedFrom);
	expectType<number | undefined>(subprocessError.pipedFrom?.durationMs);
	expectAssignable<Error>(subprocessError);
	expectType<number | undefined>(subprocessError.exitCode);
	expectType<string | undefined>(subprocessError.signalName);
	expectError(subprocessError.other);
}

expectAssignable<Options>({} as const);
expectAssignable<Options>({argv0: 'test'} as const);
expectNotAssignable<Options>({other: 'test'} as const);
expectNotAssignable<Options>('test');

await nanoSpawn('test', {argv0: 'test'} as const);
expectError(await nanoSpawn('test', {argv0: true} as const));
await nanoSpawn('test', {preferLocal: true} as const);
expectError(await nanoSpawn('test', {preferLocal: 'true'} as const));
await nanoSpawn('test', {env: {}} as const);
// eslint-disable-next-line @typescript-eslint/naming-convention
await nanoSpawn('test', {env: {TEST: 'test'}} as const);
expectError(await nanoSpawn('test', {env: true} as const));
// eslint-disable-next-line @typescript-eslint/naming-convention
expectError(await nanoSpawn('test', {env: {TEST: true}} as const));
await nanoSpawn('test', {stdin: 'pipe'} as const);
await nanoSpawn('test', {stdin: {string: 'test'} as const} as const);
expectError(await nanoSpawn('test', {stdin: {string: true} as const} as const));
expectError(await nanoSpawn('test', {stdin: {other: 'test'} as const} as const));
expectError(await nanoSpawn('test', {stdin: true} as const));
await nanoSpawn('test', {stdout: 'pipe'} as const);
expectError(await nanoSpawn('test', {stdout: {string: 'test'} as const} as const));
expectError(await nanoSpawn('test', {stdout: true} as const));
await nanoSpawn('test', {stderr: 'pipe'} as const);
expectError(await nanoSpawn('test', {stderr: {string: 'test'} as const} as const));
expectError(await nanoSpawn('test', {stderr: true} as const));
await nanoSpawn('test', {stdio: ['pipe', 'pipe', 'pipe'] as const} as const);
await nanoSpawn('test', {stdio: [{string: 'test'} as const, 'pipe', 'pipe'] as const} as const);
expectError(await nanoSpawn('test', {stdio: ['pipe', {string: 'test'} as const, 'pipe'] as const} as const));
expectError(await nanoSpawn('test', {stdio: ['pipe', 'pipe', {string: 'test'} as const] as const} as const));
expectError(await nanoSpawn('test', {stdio: [{string: true} as const, 'pipe', 'pipe'] as const} as const));
expectError(await nanoSpawn('test', {stdio: [{other: 'test'} as const, 'pipe', 'pipe'] as const} as const));
expectError(await nanoSpawn('test', {stdio: [true, true, true] as const} as const));
await nanoSpawn('test', {stdio: 'pipe'} as const);
expectError(await nanoSpawn('test', {stdio: true} as const));
expectError(await nanoSpawn('test', {other: 'test'} as const));

expectError(await nanoSpawn());
expectError(await nanoSpawn(true));
await nanoSpawn('test', [] as const);
await nanoSpawn('test', ['one'] as const);
expectError(await nanoSpawn('test', [true] as const));
await nanoSpawn('test', {} as const);
expectError(await nanoSpawn('test', true));
await nanoSpawn('test', ['one'] as const, {} as const);
expectError(await nanoSpawn('test', ['one'] as const, true));
expectError(await nanoSpawn('test', ['one'] as const, {} as const, true));

expectError(await nanoSpawn('test').pipe());
expectError(await nanoSpawn('test').pipe(true));
await nanoSpawn('test').pipe('test', [] as const);
await nanoSpawn('test').pipe('test', ['one'] as const);
expectError(await nanoSpawn('test').pipe('test', [true] as const));
await nanoSpawn('test').pipe('test', {} as const);
expectError(await nanoSpawn('test').pipe('test', true));
await nanoSpawn('test').pipe('test', ['one'] as const, {} as const);
expectError(await nanoSpawn('test').pipe('test', ['one'] as const, true));
expectError(await nanoSpawn('test').pipe('test', ['one'] as const, {} as const, true));

expectError(await nanoSpawn('test').pipe('test').pipe());
expectError(await nanoSpawn('test').pipe('test').pipe(true));
await nanoSpawn('test').pipe('test').pipe('test', [] as const);
await nanoSpawn('test').pipe('test').pipe('test', ['one'] as const);
expectError(await nanoSpawn('test').pipe('test').pipe('test', [true] as const));
await nanoSpawn('test').pipe('test').pipe('test', {} as const);
expectError(await nanoSpawn('test').pipe('test').pipe('test', true));
await nanoSpawn('test').pipe('test').pipe('test', ['one'] as const, {} as const);
expectError(await nanoSpawn('test').pipe('test').pipe('test', ['one'] as const, true));
expectError(await nanoSpawn('test').pipe('test').pipe('test', ['one'] as const, {} as const, true));

expectType<Subprocess>(nanoSpawn('test').pipe('test'));
expectType<Subprocess>(nanoSpawn('test').pipe('test').pipe('test'));
expectType<Result>(await nanoSpawn('test').pipe('test'));
expectType<Result>(await nanoSpawn('test').pipe('test').pipe('test'));

for await (const line of nanoSpawn('test')) {
	expectType<string>(line);
}

for await (const line of nanoSpawn('test').pipe('test')) {
	expectType<string>(line);
}

for await (const line of nanoSpawn('test').stdout) {
	expectType<string>(line);
}

for await (const line of nanoSpawn('test').pipe('test').stdout) {
	expectType<string>(line);
}

for await (const line of nanoSpawn('test').stderr) {
	expectType<string>(line);
}

for await (const line of nanoSpawn('test').pipe('test').stderr) {
	expectType<string>(line);
}

const subprocess = nanoSpawn('test');
expectType<Subprocess>(subprocess);

const nodeChildProcess = await subprocess.nodeChildProcess;
expectType<ChildProcess>(nodeChildProcess);
expectType<number | undefined>(nodeChildProcess.pid);
