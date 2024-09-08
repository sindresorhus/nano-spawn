import test from 'ava';
import spawn from '../source/index.js';
import {assertSigterm} from './helpers/assert.js';
import {nodePrintStdout, nodeHanging, nodePrint} from './helpers/commands.js';

test('Can pass no arguments', async t => {
	const error = await t.throwsAsync(spawn(...nodeHanging, {timeout: 1}));
	assertSigterm(t, error);
});

test('Can pass no arguments nor options', async t => {
	const subprocess = spawn(...nodeHanging);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	nodeChildProcess.kill();
	const error = await t.throwsAsync(subprocess);
	assertSigterm(t, error);
});

test('Returns a promise', async t => {
	const subprocess = spawn(...nodePrintStdout);
	t.false(Object.prototype.propertyIsEnumerable.call(subprocess, 'then'));
	t.false(Object.hasOwn(subprocess, 'then'));
	t.true(subprocess instanceof Promise);
	await subprocess;
});

test('subprocess.nodeChildProcess is set', async t => {
	const subprocess = spawn(...nodePrintStdout);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	t.true(Number.isInteger(nodeChildProcess.pid));
	await subprocess;
});

const PARALLEL_COUNT = 100;

test.serial('Can run many times at once', async t => {
	const inputs = Array.from({length: PARALLEL_COUNT}, (_, index) => `${index}`);
	const results = await Promise.all(inputs.map(input => spawn(...nodePrint(input))));
	t.deepEqual(results.map(({output}) => output), inputs);
});
