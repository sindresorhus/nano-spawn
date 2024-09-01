import test from 'ava';
import nanoSpawn from '../source/index.js';
import {arrayFromAsync, destroySubprocessStream, writeMultibyte} from './helpers/main.js';
import {
	testString,
	secondTestString,
	thirdTestString,
	fourthTestString,
	multibyteString,
} from './helpers/arguments.js';
import {assertFail, assertErrorEvent} from './helpers/assert.js';
import {
	nodeEval,
	nodePrintStdout,
	nodePrintStderr,
	nodePrintBoth,
	nodePrintBothFail,
	nodePrintNoNewline,
	nodePassThrough,
	nodePassThroughPrint,
	nodePassThroughPrintFail,
} from './helpers/commands.js';

const getIterable = (subprocess, iterableType) => iterableType === ''
	? subprocess
	: subprocess[iterableType];

test('subprocess.stdout can be iterated', async t => {
	const subprocess = nanoSpawn(...nodePrintStdout);
	const lines = await arrayFromAsync(subprocess.stdout);
	t.deepEqual(lines, [testString]);
	const {stdout, output} = await subprocess;
	t.is(stdout, '');
	t.is(output, '');
});

test('subprocess.stderr can be iterated', async t => {
	const subprocess = nanoSpawn(...nodePrintStderr);
	const lines = await arrayFromAsync(subprocess.stderr);
	t.deepEqual(lines, [testString]);
	const {stderr, output} = await subprocess;
	t.is(stderr, '');
	t.is(output, '');
});

test('subprocess[Symbol.asyncIterator] can be iterated', async t => {
	const subprocess = nanoSpawn(...nodeEval(`console.log("${testString}");
console.log("${secondTestString}");
console.error("${thirdTestString}");
console.error("${fourthTestString}");`));

	const lines = await arrayFromAsync(subprocess);
	t.deepEqual(lines, [testString, secondTestString, thirdTestString, fourthTestString]);

	const {stdout, stderr, output} = await subprocess;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test.serial('subprocess iteration can be interleaved', async t => {
	const length = 10;
	const subprocess = nanoSpawn('node', ['--input-type=module', '-e', `
import {setTimeout} from 'node:timers/promises';

for (let index = 0; index < ${length}; index += 1) {
	console.log("${testString}");
	await setTimeout(50);
	console.error("${secondTestString}");
	await setTimeout(50);
}`]);

	const lines = await arrayFromAsync(subprocess);
	t.deepEqual(lines, Array.from({length}, () => [testString, secondTestString]).flat());

	const {stdout, stderr, output} = await subprocess;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('subprocess.stdout has no iterations if options.stdout "ignore"', async t => {
	const subprocess = nanoSpawn(...nodePrintBoth, {stdout: 'ignore'});
	const [stdoutLines, stderrLines] = await Promise.all([arrayFromAsync(subprocess.stdout), arrayFromAsync(subprocess.stderr)]);
	t.deepEqual(stdoutLines, []);
	t.deepEqual(stderrLines, [secondTestString]);
	const {stdout, stderr, output} = await subprocess;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('subprocess.stderr has no iterations if options.stderr "ignore"', async t => {
	const subprocess = nanoSpawn(...nodePrintBoth, {stderr: 'ignore'});
	const [stdoutLines, stderrLines] = await Promise.all([arrayFromAsync(subprocess.stdout), arrayFromAsync(subprocess.stderr)]);
	t.deepEqual(stdoutLines, [testString]);
	t.deepEqual(stderrLines, []);
	const {stdout, stderr, output} = await subprocess;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('subprocess[Symbol.asyncIterator] has iterations if only options.stdout "ignore"', async t => {
	const subprocess = nanoSpawn(...nodePrintBoth, {stdout: 'ignore'});
	const lines = await arrayFromAsync(subprocess);
	t.deepEqual(lines, [secondTestString]);
	const {stdout, stderr, output} = await subprocess;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('subprocess[Symbol.asyncIterator] has iterations if only options.stderr "ignore"', async t => {
	const subprocess = nanoSpawn(...nodePrintBoth, {stderr: 'ignore'});
	const lines = await arrayFromAsync(subprocess);
	t.deepEqual(lines, [testString]);
	const {stdout, stderr, output} = await subprocess;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('subprocess[Symbol.asyncIterator] has no iterations if only options.stdout + options.stderr "ignore"', async t => {
	const subprocess = nanoSpawn(...nodePrintBoth, {stdout: 'ignore', stderr: 'ignore'});
	const lines = await arrayFromAsync(subprocess);
	t.deepEqual(lines, []);
	const {stdout, stderr, output} = await subprocess;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('subprocess.stdout has no iterations but waits for the subprocess if options.stdout "ignore"', async t => {
	const subprocess = nanoSpawn(...nodePrintBothFail, {stdout: 'ignore'});
	const error = await t.throwsAsync(arrayFromAsync(subprocess.stdout));
	assertFail(t, error);
	const promiseError = await t.throwsAsync(subprocess);
	t.is(promiseError, error);
	t.is(promiseError.stdout, '');
	t.is(promiseError.stderr, '');
	t.is(promiseError.output, '');
});

const testIterationLate = async (t, iterableType) => {
	const subprocess = nanoSpawn(...nodePrintStdout);
	await subprocess.nodeChildProcess;
	await t.throwsAsync(arrayFromAsync(getIterable(subprocess, iterableType)), {message: /must be iterated right away/});
};

test('subprocess.stdout must be called right away', testIterationLate, 'stdout');
test('subprocess.stderr must be called right away', testIterationLate, 'stderr');
test('subprocess[Symbol.asyncIterator] must be called right away', testIterationLate, '');

test('subprocess[Symbol.asyncIterator] is line-wise', async t => {
	const subprocess = nanoSpawn('node', ['--input-type=module', '-e', `
import {setTimeout} from 'node:timers/promises';

process.stdout.write("a\\nb\\n");
await setTimeout(0);
process.stderr.write("c\\nd\\n");`]);
	const lines = await arrayFromAsync(subprocess);
	t.deepEqual(lines, ['a', 'b', 'c', 'd']);
});

const testNewlineIteration = async (t, input, expectedLines) => {
	const subprocess = nanoSpawn(...nodePrintNoNewline(input));
	const lines = await arrayFromAsync(subprocess.stdout);
	t.deepEqual(lines, expectedLines);
};

test('subprocess.stdout handles newline at the beginning', testNewlineIteration, '\na\nb', ['', 'a', 'b']);
test('subprocess.stdout handles newline in the middle', testNewlineIteration, 'a\nb', ['a', 'b']);
test('subprocess.stdout handles newline at the end', testNewlineIteration, 'a\nb\n', ['a', 'b']);
test('subprocess.stdout handles Windows newline at the beginning', testNewlineIteration, '\r\na\r\nb', ['', 'a', 'b']);
test('subprocess.stdout handles Windows newline in the middle', testNewlineIteration, 'a\r\nb', ['a', 'b']);
test('subprocess.stdout handles Windows newline at the end', testNewlineIteration, 'a\r\nb\r\n', ['a', 'b']);
test('subprocess.stdout handles 2 newlines at the beginning', testNewlineIteration, '\n\na\nb', ['', '', 'a', 'b']);
test('subprocess.stdout handles 2 newlines in the middle', testNewlineIteration, 'a\n\nb', ['a', '', 'b']);
test('subprocess.stdout handles 2 newlines at the end', testNewlineIteration, 'a\nb\n\n', ['a', 'b', '']);
test('subprocess.stdout handles 2 Windows newlines at the beginning', testNewlineIteration, '\r\n\r\na\r\nb', ['', '', 'a', 'b']);
test('subprocess.stdout handles 2 Windows newlines in the middle', testNewlineIteration, 'a\r\n\r\nb', ['a', '', 'b']);
test('subprocess.stdout handles 2 Windows newlines at the end', testNewlineIteration, 'a\r\nb\r\n\r\n', ['a', 'b', '']);

test.serial('subprocess.stdout works with multibyte sequences', async t => {
	const subprocess = nanoSpawn(...nodePassThrough);
	writeMultibyte(subprocess);
	const lines = await arrayFromAsync(subprocess.stdout);
	t.deepEqual(lines, [multibyteString]);
	const {stdout, output} = await subprocess;
	t.is(stdout, '');
	t.is(output, '');
});

const testStreamIterateError = async (t, streamName) => {
	const subprocess = nanoSpawn(...nodePrintStdout);
	const cause = new Error(testString);
	destroySubprocessStream(subprocess, cause, streamName);
	const error = await t.throwsAsync(arrayFromAsync(subprocess[streamName]));
	assertErrorEvent(t, error, cause);
	const promiseError = await t.throwsAsync(subprocess);
	assertErrorEvent(t, promiseError, cause);
	t.is(promiseError[streamName], '');
	t.is(promiseError.output, '');
};

test('Handles subprocess.stdout error', testStreamIterateError, 'stdout');
test('Handles subprocess.stderr error', testStreamIterateError, 'stderr');

const testStreamIterateAllError = async (t, streamName) => {
	const subprocess = nanoSpawn(...nodePrintStdout);
	const cause = new Error(testString);
	destroySubprocessStream(subprocess, cause, streamName);
	const error = await t.throwsAsync(arrayFromAsync(subprocess));
	assertErrorEvent(t, error, cause);
	const promiseError = await t.throwsAsync(subprocess);
	assertErrorEvent(t, promiseError, cause);
	t.is(promiseError[streamName], '');
	t.is(promiseError.output, '');
};

test('Handles subprocess.stdout error in subprocess[Symbol.asyncIterator]', testStreamIterateAllError, 'stdout');
test('Handles subprocess.stderr error in subprocess[Symbol.asyncIterator]', testStreamIterateAllError, 'stderr');

// eslint-disable-next-line max-params
const iterateOnOutput = async (t, subprocess, state, cause, shouldThrow, iterableType) => {
	// eslint-disable-next-line no-unreachable-loop
	for await (const line of getIterable(subprocess, iterableType)) {
		t.is(line, testString);

		globalThis.setTimeout(async () => {
			const {stdin, stdout} = await subprocess.nodeChildProcess;
			t.true(stdout.readable);
			t.true(stdin.writable);
			stdin.end(secondTestString);
			state.done = true;
		}, 1e2);

		if (shouldThrow) {
			throw cause;
		} else {
			break;
		}
	}
};

const testIteration = async (t, shouldThrow, iterableType) => {
	const subprocess = nanoSpawn(...nodePassThroughPrint);
	const state = {done: false};
	const cause = new Error(testString);

	try {
		await iterateOnOutput(t, subprocess, state, cause, shouldThrow, iterableType);
	} catch (error) {
		t.is(error, cause);
	}

	t.true(state.done);

	const {stdout, output} = await subprocess;
	t.is(stdout, '');
	t.is(output, '');
};

test.serial('subprocess.stdout iteration break waits for the subprocess success', testIteration, false, 'stdout');
test.serial('subprocess[Symbol.asyncIterator] iteration break waits for the subprocess success', testIteration, false, '');
test.serial('subprocess.stdout iteration exception waits for the subprocess success', testIteration, true, 'stdout');
test.serial('subprocess[Symbol.asyncIterator] iteration exception waits for the subprocess success', testIteration, true, '');

const testIterationFail = async (t, shouldThrow, iterableType) => {
	const subprocess = nanoSpawn(...nodePassThroughPrintFail);
	const state = {done: false};
	const cause = new Error(testString);
	let caughtError;

	try {
		await iterateOnOutput(t, subprocess, state, cause, shouldThrow, iterableType);
	} catch (error) {
		t.is(error === cause, shouldThrow);
		caughtError = error;
	}

	t.true(state.done);

	const promiseError = await t.throwsAsync(subprocess);
	assertFail(t, promiseError);
	t.is(promiseError === caughtError, !shouldThrow);
	t.is(promiseError.stdout, '');
	t.is(promiseError.output, '');
};

test.serial('subprocess.stdout iteration break waits for the subprocess failure', testIterationFail, false, 'stdout');
test.serial('subprocess[Symbol.asyncIterator] iteration break waits for the subprocess failure', testIterationFail, false, '');
test.serial('subprocess.stdout iteration exception waits for the subprocess failure', testIterationFail, true, 'stdout');
test.serial('subprocess[Symbol.asyncIterator] iteration exception waits for the subprocess failure', testIterationFail, true, '');
