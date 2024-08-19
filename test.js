import test from 'ava';
import nanoSpawn from './index.js';

test('can be awaited', async t => {
	const result = await nanoSpawn('echo', ['🦄']);
	// TODO
	// t.is(result.stdout, '🦄');
	t.is(result.exitCode, 0);
});

test('stdout produces correct output', async t => {
	const result = nanoSpawn('echo', ['Hello\nWorld']);

	const lines = [];
	for await (const chunk of result.stdout) {
		lines.push(chunk.toString());
	}

	t.deepEqual(lines, ['Hello', 'World']);
});

test('stderr produces correct output', async t => {
	const result = nanoSpawn('ls', ['non-existent-file']);

	const lines = [];
	for await (const line of result.stderr) {
		lines.push(line);
	}

	t.is(lines.length, 1);
	t.regex(lines[0], /No such file/);
});

test('combines stdout and stderr correctly', async t => {
	const result = nanoSpawn('bash', ['-c', 'echo "stdout\nstdout2"; echo "stderr\nstderr2" 1>&2']);

	const lines = [];
	for await (const line of result) {
		lines.push(line);
	}

	t.deepEqual(lines, ['stdout', 'stderr', 'stdout2', 'stderr2']);
});

test('rejects on error', async t => {
	await t.throwsAsync(
		nanoSpawn('non-existent-command'),
	);
});
