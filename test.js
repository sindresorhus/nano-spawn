import {setTimeout} from 'node:timers/promises';
import test from 'ava';
import nanoSpawn from './index.js';

// TODO: replace with Array.fromAsync() after dropping support for Node <22.0.0
const arrayFromAsync = async asyncIterable => {
	const chunks = [];
	for await (const chunk of asyncIterable) {
		chunks.push(chunk);
	}

	return chunks;
};

test('can pass options object without any arguments', async t => {
	const {exitCode, signalName} = await nanoSpawn('node', {timeout: 1});
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
});

test('result.exitCode|signalName on success', async t => {
	const {exitCode, signalName} = await nanoSpawn('node', ['--version']);
	t.is(exitCode, 0);
	t.is(signalName, undefined);
});

test('result.exitCode|signalName on non-0 exit code', async t => {
	const {exitCode, signalName} = await nanoSpawn('node', ['-e', 'process.exit(2)']);
	t.is(exitCode, 2);
	t.is(signalName, undefined);
});

test('result.exitCode|signalName on signal termination', async t => {
	const {exitCode, signalName} = await nanoSpawn('node', {timeout: 1});
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
});

test('result.exitCode|signalName on invalid child_process options', t => {
	const {exitCode, signalName} = t.throws(() => nanoSpawn('node', ['--version'], {nativeOptions: {detached: 'true'}}));
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
});

test('result.exitCode|signalName on "error" event before spawn', async t => {
	const {exitCode, signalName} = await t.throwsAsync(nanoSpawn('non-existent-command'));
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
});

test('result.exitCode|signalName on "error" event after spawn', async t => {
	const {exitCode, signalName} = await t.throwsAsync(nanoSpawn('node', {signal: AbortSignal.abort()}));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
});

test('result.stdout is set', async t => {
	const {stdout, stderr} = await nanoSpawn('node', ['-e', 'console.log(".")']);
	t.is(stdout, '.');
	t.is(stderr, '');
});

test('result.stderr is set', async t => {
	const {stdout, stderr} = await nanoSpawn('node', ['-e', 'console.error(".")']);
	t.is(stdout, '');
	t.is(stderr, '.');
});

test('result.stdout strips Windows newline', async t => {
	const {stdout} = await nanoSpawn('node', ['-e', 'process.stdout.write(".\\r\\n")']);
	t.is(stdout, '.');
});

test('result.stderr strips Windows newline', async t => {
	const {stderr} = await nanoSpawn('node', ['-e', 'process.stderr.write(".\\r\\n")']);
	t.is(stderr, '.');
});

const multibyteString = '.\u{1F984}.';
const multibyteUint8Array = new TextEncoder().encode(multibyteString);
const multibyteFirstHalf = multibyteUint8Array.slice(0, 3);
const multibyteSecondHalf = multibyteUint8Array.slice(3);

test.serial('result.stdout works with multibyte sequences', async t => {
	const promise = nanoSpawn('node', ['-e', 'process.stdin.pipe(process.stdout)']);
	promise.subprocess.stdin.write(multibyteFirstHalf);
	await setTimeout(1e2);
	promise.subprocess.stdin.end(multibyteSecondHalf);
	const {stdout} = await promise;
	t.is(stdout, multibyteString);
});

test('promise.stdout can be iterated', async t => {
	const promise = nanoSpawn('node', ['-e', 'console.log("a\\nb")']);

	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, ['a', 'b']);

	const {stdout} = await promise;
	t.is(stdout, 'a\nb');
});

test('promise.stderr can be iterated', async t => {
	const promise = nanoSpawn('node', ['-e', 'console.error("a\\nb")']);

	const lines = await arrayFromAsync(promise.stderr);
	t.deepEqual(lines, ['a', 'b']);

	const {stderr} = await promise;
	t.is(stderr, 'a\nb');
});

test('promise can be iterated with both stdout and stderr', async t => {
	const promise = nanoSpawn('node', ['-e', 'console.log("a"); console.error("b"); console.log("c"); console.error("d");']);

	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, ['a', 'b', 'c', 'd']);

	const {stdout, stderr} = await promise;
	t.is(stdout, 'a\nc');
	t.is(stderr, 'b\nd');
});

test('stdout handles no newline at the end', async t => {
	const result = nanoSpawn('node', ['-e', 'process.stdout.write("Hello\\nWorld")']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World']);
});

test('stdout handles newline at the end', async t => {
	const result = nanoSpawn('node', ['-e', 'process.stdout.write("Hello\\nWorld\\n")']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World']);
});

test('stdout handles 2 newlines at the end', async t => {
	const result = nanoSpawn('node', ['-e', 'process.stdout.write("Hello\\nWorld\\n\\n")']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World', '']);
});

test('stdout handles Windows newlines', async t => {
	const result = nanoSpawn('node', ['-e', 'process.stdout.write("Hello\\r\\nWorld")']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World']);
});

test('stdout handles Windows newline at the end', async t => {
	const result = nanoSpawn('node', ['-e', 'process.stdout.write("Hello\\r\\nWorld\\r\\n")']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World']);
});

test('returns a promise', async t => {
	const result = nanoSpawn('node', ['--version']);
	t.false(Object.prototype.propertyIsEnumerable.call(result, 'then'));
	t.false(Object.hasOwn(result, 'then'));
	t.true(result instanceof Promise);
	await result;
});

test('promise.subprocess is set', async t => {
	const promise = nanoSpawn('node');
	promise.subprocess.kill();

	const {exitCode} = await promise;
	t.is(exitCode, undefined);
});
