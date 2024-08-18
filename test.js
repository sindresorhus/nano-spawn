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

test('can be awaited', async t => {
	const result = await nanoSpawn('echo', ['🦄']);
	// TODO
	// t.is(result.stdout, '🦄');
	t.is(result.exitCode, 0);
});

test('stdout produces correct output', async t => {
	const result = nanoSpawn('echo', ['Hello\nWorld']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World']);
});

test('stderr produces correct output', async t => {
	const result = nanoSpawn('ls', ['non-existent-file']);
	const lines = await arrayFromAsync(result.stderr);
	t.is(lines.length, 1);
	t.regex(lines[0], /No such file/);
});

test('combines stdout and stderr correctly', async t => {
	const result = nanoSpawn('bash', ['-c', 'echo "stdout\nstdout2"; echo "stderr\nstderr2" 1>&2']);
	const lines = await arrayFromAsync(result);
	t.deepEqual(lines, ['stdout', 'stderr', 'stdout2', 'stderr2']);
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

test('rejects on error', async t => {
	await t.throwsAsync(
		nanoSpawn('non-existent-command'),
	);
});

test('returns a promise', async t => {
	const result = nanoSpawn('echo');
	t.false(Object.prototype.propertyIsEnumerable.call(result, 'then'));
	t.false(Object.hasOwn(result, 'then'));
	t.true(result instanceof Promise);
	await result;
});
