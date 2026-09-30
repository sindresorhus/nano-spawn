import test from 'node:test';
import assert from 'node:assert/strict';
import spawn from '../source/index.js';
import {arrayFromAsync, isWindows} from './helpers/main.js';
import {
	assertSigterm,
	throwsAsync
} from './helpers/assert.js';
import {nodePrintStdout, nodeHanging, nodePrint} from './helpers/commands.js';

test('Can pass no arguments', async () => {
	const error = await throwsAsync(spawn(...nodeHanging, {timeout: 1}));
	assertSigterm(error);
});

test('Can pass no arguments nor options', async () => {
	const subprocess = spawn(...nodeHanging);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	nodeChildProcess.kill();
	const error = await throwsAsync(subprocess);
	assertSigterm(error);
});

test('Returns a promise', async () => {
	const subprocess = spawn(...nodePrintStdout);
	assert.equal(Object.prototype.propertyIsEnumerable.call(subprocess, 'then'), false);
	assert.equal(Object.hasOwn(subprocess, 'then'), false);
	assert.ok(subprocess instanceof Promise);
	await subprocess;
});

test('subprocess.nodeChildProcess is set', async () => {
	const subprocess = spawn(...nodePrintStdout);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	assert.ok(Number.isInteger(nodeChildProcess.pid));
	await subprocess;
});

const PARALLEL_COUNT = 100;

test('Can run many times at once', async () => {
	const inputs = Array.from({length: PARALLEL_COUNT}, (_, index) => `${index}`);
	const results = await Promise.all(inputs.map(input => spawn(...nodePrint(input))));
	assert.deepEqual(results.map(({output}) => output), inputs);
});

// The readme and the `spawn()` doc comment both show `spawn('ls')` being iterated
if (!isWindows) {
	test('readme example: for await (const line of spawn(\'ls\'))', async () => {
		const lines = await arrayFromAsync(spawn('ls'));
		assert.ok(lines.includes('source'));
		assert.ok(lines.includes('test'));
	});
}
