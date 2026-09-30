import test from 'node:test';
import assert from 'node:assert/strict';
import spawn from '../source/index.js';
import {arrayFromAsync, destroySubprocessStream, writeMultibyte} from './helpers/main.js';
import {
	testString,
	secondTestString,
	thirdTestString,
	fourthTestString,
	multibyteString,
} from './helpers/arguments.js';
import {
	assertAbortError,
	assertErrorEvent,
	assertFail,
	throwsAsync
} from './helpers/assert.js';
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
	nodeHanging,
} from './helpers/commands.js';

const getIterable = (subprocess, iterableType) => iterableType === ''
	? subprocess
	: subprocess[iterableType];

test('subprocess.stdout can be iterated', async () => {
	const subprocess = spawn(...nodePrintStdout);
	const lines = await arrayFromAsync(subprocess.stdout);
	assert.deepEqual(lines, [testString]);
	const {stdout, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(output, '');
});

test('subprocess.stderr can be iterated', async () => {
	const subprocess = spawn(...nodePrintStderr);
	const lines = await arrayFromAsync(subprocess.stderr);
	assert.deepEqual(lines, [testString]);
	const {stderr, output} = await subprocess;
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess[Symbol.asyncIterator] can be iterated', async () => {
	const subprocess = spawn(...nodeEval(`console.log("${testString}");
console.log("${secondTestString}");
console.error("${thirdTestString}");
console.error("${fourthTestString}");`));

	const lines = await arrayFromAsync(subprocess);
	assert.deepEqual(lines, [testString, secondTestString, thirdTestString, fourthTestString]);

	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess iteration can be interleaved', async () => {
	const length = 10;
	const subprocess = spawn('node', ['--input-type=module', '-e', `
import {setTimeout} from 'node:timers/promises';

for (let index = 0; index < ${length}; index += 1) {
	console.log("${testString}");
	await setTimeout(50);
	console.error("${secondTestString}");
	await setTimeout(50);
}`]);

	const lines = await arrayFromAsync(subprocess);
	assert.deepEqual(lines, Array.from({length}, () => [testString, secondTestString]).flat());

	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess.stdout throws if options.stdout "ignore"', async () => {
	const subprocess = spawn(...nodePrintBoth, {stdout: 'ignore'});
	const [{reason}, {value: stderrLines}] = await Promise.allSettled([arrayFromAsync(subprocess.stdout), arrayFromAsync(subprocess.stderr)]);
	assert.equal(reason.message, 'The subprocess cannot be iterated unless the option `stdout` is \'pipe\'.');
	assert.deepEqual(stderrLines, [secondTestString]);
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess.stderr throws if options.stderr "ignore"', async () => {
	const subprocess = spawn(...nodePrintBoth, {stderr: 'ignore'});
	const [{value: stdoutLines}, {reason}] = await Promise.allSettled([arrayFromAsync(subprocess.stdout), arrayFromAsync(subprocess.stderr)]);
	assert.equal(reason.message, 'The subprocess cannot be iterated unless the option `stderr` is \'pipe\'.');
	assert.deepEqual(stdoutLines, [testString]);
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess[Symbol.asyncIterator] has iterations if only options.stdout "ignore"', async () => {
	const subprocess = spawn(...nodePrintBoth, {stdout: 'ignore'});
	const lines = await arrayFromAsync(subprocess);
	assert.deepEqual(lines, [secondTestString]);
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess[Symbol.asyncIterator] has iterations if only options.stderr "ignore"', async () => {
	const subprocess = spawn(...nodePrintBoth, {stderr: 'ignore'});
	const lines = await arrayFromAsync(subprocess);
	assert.deepEqual(lines, [testString]);
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess[Symbol.asyncIterator] throws if only options.stdout + options.stderr "ignore"', async () => {
	const subprocess = spawn(...nodePrintBoth, {stdout: 'ignore', stderr: 'ignore'});
	const error = await throwsAsync(arrayFromAsync(subprocess));
	assert.equal(error.message, 'The subprocess cannot be iterated unless either the option `stdout` or `stderr` is \'pipe\'.');
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess.stdout has no iterations but waits for the subprocess if options.stdout "ignore"', async () => {
	const subprocess = spawn(...nodePrintBothFail, {stdout: 'ignore'});
	const error = await throwsAsync(arrayFromAsync(subprocess.stdout));
	assertFail(error);
	const promiseError = await throwsAsync(subprocess);
	assert.equal(promiseError, error);
	assert.equal(promiseError.stdout, '');
	assert.equal(promiseError.stderr, secondTestString);
	assert.equal(promiseError.output, secondTestString);
});

const testIterationLate = (iterableType) => async () => {
	const subprocess = spawn(...nodePrintStdout);
	await subprocess.nodeChildProcess;
	await throwsAsync(arrayFromAsync(getIterable(subprocess, iterableType)), {message: /must be iterated right away/});
};

test('subprocess.stdout must be called right away', testIterationLate('stdout'));
test('subprocess.stderr must be called right away', testIterationLate('stderr'));
test('subprocess[Symbol.asyncIterator] must be called right away', testIterationLate(''));

test('subprocess[Symbol.asyncIterator] is line-wise', async () => {
	const subprocess = spawn('node', ['--input-type=module', '-e', `
import {setTimeout} from 'node:timers/promises';

process.stdout.write("a\\nb\\n");
await setTimeout(0);
process.stderr.write("c\\nd\\n");`]);
	const lines = await arrayFromAsync(subprocess);
	assert.deepEqual(lines, ['a', 'b', 'c', 'd']);
});

const testNewlineIteration = (input, expectedLines) => async () => {
	const subprocess = spawn(...nodePrintNoNewline(input));
	const lines = await arrayFromAsync(subprocess.stdout);
	assert.deepEqual(lines, expectedLines);
};

test('subprocess.stdout handles newline at the beginning', testNewlineIteration('\na\nb', ['', 'a', 'b']));
test('subprocess.stdout handles newline in the middle', testNewlineIteration('a\nb', ['a', 'b']));
test('subprocess.stdout handles newline at the end', testNewlineIteration('a\nb\n', ['a', 'b']));
test('subprocess.stdout handles Windows newline at the beginning', testNewlineIteration('\r\na\r\nb', ['', 'a', 'b']));
test('subprocess.stdout handles Windows newline in the middle', testNewlineIteration('a\r\nb', ['a', 'b']));
test('subprocess.stdout handles Windows newline at the end', testNewlineIteration('a\r\nb\r\n', ['a', 'b']));
test('subprocess.stdout handles 2 newlines at the beginning', testNewlineIteration('\n\na\nb', ['', '', 'a', 'b']));
test('subprocess.stdout handles 2 newlines in the middle', testNewlineIteration('a\n\nb', ['a', '', 'b']));
test('subprocess.stdout handles 2 newlines at the end', testNewlineIteration('a\nb\n\n', ['a', 'b', '']));
test('subprocess.stdout handles 2 Windows newlines at the beginning', testNewlineIteration('\r\n\r\na\r\nb', ['', '', 'a', 'b']));
test('subprocess.stdout handles 2 Windows newlines in the middle', testNewlineIteration('a\r\n\r\nb', ['a', '', 'b']));
test('subprocess.stdout handles 2 Windows newlines at the end', testNewlineIteration('a\r\nb\r\n\r\n', ['a', 'b', '']));

test('subprocess.stdout works with multibyte sequences', async () => {
	const subprocess = spawn(...nodePassThrough);
	writeMultibyte(subprocess);
	const lines = await arrayFromAsync(subprocess.stdout);
	assert.deepEqual(lines, [multibyteString]);
	const {stdout, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(output, '');
});

const testStreamIterateError = (streamName, fixture) => async () => {
	const subprocess = spawn(...fixture);
	const cause = new Error(testString);
	destroySubprocessStream(subprocess, cause, streamName);
	const error = await throwsAsync(arrayFromAsync(subprocess[streamName]));
	assertErrorEvent(error, cause);
	const promiseError = await throwsAsync(subprocess);
	assertErrorEvent(promiseError, cause);
	assert.equal(promiseError[streamName], '');
	assert.equal(promiseError.output, '');
};

test('Handles subprocess.stdout error', testStreamIterateError('stdout', nodePrintStdout));
test('Handles subprocess.stderr error', testStreamIterateError('stderr', nodePrintStderr));

const testStreamIterateAllError = (streamName) => async () => {
	const subprocess = spawn(...nodePrintStdout);
	const cause = new Error(testString);
	destroySubprocessStream(subprocess, cause, streamName);
	const error = await throwsAsync(arrayFromAsync(subprocess));
	assertErrorEvent(error, cause);
	const promiseError = await throwsAsync(subprocess);
	assertErrorEvent(promiseError, cause);
	assert.equal(promiseError[streamName], '');
	assert.equal(promiseError.output, '');
};

test('Handles subprocess.stdout error in subprocess[Symbol.asyncIterator]', testStreamIterateAllError('stdout'));
test('Handles subprocess.stderr error in subprocess[Symbol.asyncIterator]', testStreamIterateAllError('stderr'));

const testStreamIterateSignal = (streamName) => async () => {
	const signal = AbortSignal.timeout(0);
	const subprocess = spawn(...nodeHanging, {signal});
	const error = await throwsAsync(arrayFromAsync(subprocess[streamName]));
	assertAbortError(error, signal.reason);
	const promiseError = await throwsAsync(subprocess);
	assert.equal(promiseError, error);
	assert.equal(promiseError.stdout, '');
	assert.equal(promiseError.stderr, '');
	assert.equal(promiseError.output, '');
};

test('Handles subprocess.stdout error with the "signal" option', testStreamIterateSignal('stdout'));
test('Handles subprocess.stderr error with the "signal" option', testStreamIterateSignal('stderr'));

// eslint-disable-next-line max-params
const iterateOnOutput = async (subprocess, state, cause, shouldThrow, iterableType) => {
	// eslint-disable-next-line no-unreachable-loop
	for await (const line of getIterable(subprocess, iterableType)) {
		assert.equal(line, testString);

		globalThis.setTimeout(async () => {
			const {stdin, stdout} = await subprocess.nodeChildProcess;
			assert.ok(stdout.readable);
			assert.ok(stdin.writable);
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

const testIteration = (shouldThrow, iterableType) => async () => {
	const subprocess = spawn(...nodePassThroughPrint);
	const state = {done: false};
	const cause = new Error(testString);

	try {
		await iterateOnOutput(subprocess, state, cause, shouldThrow, iterableType);
	} catch (error) {
		assert.equal(error, cause);
	}

	assert.ok(state.done);

	const {stdout, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(output, '');
};

test('subprocess.stdout iteration break waits for the subprocess success', testIteration(false, 'stdout'));
test('subprocess[Symbol.asyncIterator] iteration break waits for the subprocess success', testIteration(false, ''));
test('subprocess.stdout iteration exception waits for the subprocess success', testIteration(true, 'stdout'));
test('subprocess[Symbol.asyncIterator] iteration exception waits for the subprocess success', testIteration(true, ''));

const testIterationFail = (shouldThrow, iterableType) => async () => {
	const subprocess = spawn(...nodePassThroughPrintFail);
	const state = {done: false};
	const cause = new Error(testString);
	let caughtError;

	try {
		await iterateOnOutput(subprocess, state, cause, shouldThrow, iterableType);
	} catch (error) {
		assert.equal(error === cause, shouldThrow);
		caughtError = error;
	}

	assert.ok(state.done);

	const promiseError = await throwsAsync(subprocess);
	assertFail(promiseError);
	assert.equal(promiseError === caughtError, !shouldThrow);
	assert.equal(promiseError.stdout, '');
	assert.equal(promiseError.output, '');
};

test('subprocess.stdout iteration break waits for the subprocess failure', testIterationFail(false, 'stdout'));
test('subprocess[Symbol.asyncIterator] iteration break waits for the subprocess failure', testIterationFail(false, ''));
test('subprocess.stdout iteration exception waits for the subprocess failure', testIterationFail(true, 'stdout'));
test('subprocess[Symbol.asyncIterator] iteration exception waits for the subprocess failure', testIterationFail(true, ''));

// eslint-disable-next-line max-params
const testPartialIteration = (streamName, otherStreamName, expectedLines, expectedOutput) => async () => {
	const subprocess = spawn(...nodePrintBoth);
	const lines = await arrayFromAsync(subprocess[streamName]);
	assert.deepEqual(lines, [expectedLines]);
	const result = await subprocess;
	assert.equal(result[streamName], '');
	assert.equal(result[otherStreamName], expectedOutput);
	assert.equal(result.output, expectedOutput);
};

test('subprocess.stderr is still buffered when subprocess.stdout is iterated', testPartialIteration('stdout', 'stderr', testString, secondTestString));
test('subprocess.stdout is still buffered when subprocess.stderr is iterated', testPartialIteration('stderr', 'stdout', secondTestString, testString));
