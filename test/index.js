import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import spawn from '../source/index.js';
import {isWindows} from './helpers/main.js';
import {testString} from './helpers/arguments.js';
import {
	assertSigterm,
	throwsAsync,
} from './helpers/assert.js';
import {
	nodePrintStdout,
	nodeHanging,
	nodePrint,
	nodePrintFail,
} from './helpers/commands.js';

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
	assert.ok(Number.isSafeInteger(nodeChildProcess.pid));
	await subprocess;
});

test('subprocess.nodeChildProcess is the same instance every time', async () => {
	const subprocess = spawn(...nodePrintStdout);
	assert.equal(await subprocess.nodeChildProcess, await subprocess.nodeChildProcess);
	await subprocess;
});

test('subprocess.pipe() is a function', async () => {
	const subprocess = spawn(...nodePrintStdout);
	assert.equal(typeof subprocess.pipe, 'function');
	await subprocess;
});

// `spawn()` accepts `spawn(file, arguments?, options?)`, and `spawn(file, options)`
const printArguments = nodePrint('1')[1];

test('Can pass arguments and no options', async () => {
	const {stdout} = await spawn('node', printArguments);
	assert.equal(stdout, '1');
});

test('Arguments are captured when spawn is called', async () => {
	const commandArguments = ['-p', '1'];
	const subprocess = spawn(process.execPath, commandArguments);
	commandArguments[1] = '2';
	const {stdout, command} = await subprocess;
	assert.equal(stdout, '1');
	assert.ok(command.endsWith(' -p 1'));
});

test('Can pass arguments and options', async () => {
	const {stdout} = await spawn('node', nodePrint('process.env.TEST_DISPATCH')[1], {env: {TEST_DISPATCH: testString}});
	assert.equal(stdout, testString);
});

test('Can pass options as the second argument', async () => {
	const {stdout, command} = await spawn('node', {stdio: 'ignore'});
	assert.equal(stdout, '');
	assert.equal(command, 'node');
});

test('Ignores the third argument when the second one is not an array', async () => {
	const {stdout, command} = await spawn('node', {stdio: 'ignore'}, printArguments);
	assert.equal(stdout, '');
	assert.equal(command, 'node');
});

test('Can pass an empty arguments array', async () => {
	const {stdout, command} = await spawn('node', [], {stdio: 'ignore'});
	assert.equal(stdout, '');
	assert.equal(command, 'node');
});

const PARALLEL_COUNT = 100;

test('Can run many times at once', async () => {
	const inputs = Array.from({length: PARALLEL_COUNT}, (_, index) => String(index));
	const results = await Promise.all(inputs.map(input => spawn(...nodePrint(input))));
	assert.deepEqual(results.map(({output}) => output), inputs);
});

test('Can run many times at once with mixed options and failures', async () => {
	const subprocesses = Array.from({length: 20}, (_, index) => index % 2 === 0
		? spawn(...nodePrint(String(index)))
		: spawn(...nodePrintFail));
	const results = await Promise.allSettled(subprocesses);
	assert.deepEqual(
		results.map(result => result.status),
		Array.from({length: 20}, (_, index) => index % 2 === 0 ? 'fulfilled' : 'rejected'),
	);
});

// The readme and the `spawn()` doc comment both show `spawn('ls')` being iterated
if (!isWindows) {
	test('readme example: for await (const line of spawn(\'ls\'))', async () => {
		const lines = await Array.fromAsync(spawn('ls'));
		assert.ok(lines.includes('source'));
		assert.ok(lines.includes('test'));
	});
}
