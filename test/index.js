import test from 'ava';
import nanoSpawn from '../source/index.js';
import {assertSigterm} from './helpers/assert.js';
import {nodePrintStdout, nodeHanging} from './helpers/commands.js';

test('Can pass no arguments', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodeHanging, {timeout: 1}));
	assertSigterm(t, error);
});

test('Can pass no arguments nor options', async t => {
	const promise = nanoSpawn(...nodeHanging);
	const nodeChildProcess = await promise.nodeChildProcess;
	nodeChildProcess.kill();
	const error = await t.throwsAsync(promise);
	assertSigterm(t, error);
});

test('Returns a promise', async t => {
	const promise = nanoSpawn(...nodePrintStdout);
	t.false(Object.prototype.propertyIsEnumerable.call(promise, 'then'));
	t.false(Object.hasOwn(promise, 'then'));
	t.true(promise instanceof Promise);
	await promise;
});

test('promise.nodeChildProcess is set', async t => {
	const promise = nanoSpawn(...nodePrintStdout);
	const nodeChildProcess = await promise.nodeChildProcess;
	t.true(Number.isInteger(nodeChildProcess.pid));
	await promise;
});
