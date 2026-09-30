import test from 'node:test';
import {setTimeout} from 'node:timers/promises';
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
	assertSigterm,
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
	nodeHangingCommand,
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

// A stream which cannot be iterated must not make a subprocess failure disappear: the "not
// iterable" error is only ignored when the subprocess itself did not fail.
const testIterationNotIterableFailure = (options, fixture, assertError = assertFail) => async () => {
	const subprocess = spawn(...fixture, options);
	const error = await throwsAsync(arrayFromAsync(subprocess));
	assertError(error);
	assert.equal(error, await throwsAsync(subprocess));
};

test('subprocess[Symbol.asyncIterator] throws if only options.stderr is not "pipe" and the subprocess fails', testIterationNotIterableFailure({stderr: 'ignore'}, nodePrintBothFail));
test('subprocess[Symbol.asyncIterator] throws if only options.stdout is not "pipe" and the subprocess fails', testIterationNotIterableFailure({stdout: 'ignore'}, nodePrintBothFail));
test('subprocess[Symbol.asyncIterator] throws if both options.stdout + options.stderr are not "pipe" and the subprocess fails', testIterationNotIterableFailure({stdout: 'ignore', stderr: 'ignore'}, nodePrintBothFail));
test('subprocess[Symbol.asyncIterator] throws if only options.stderr is "inherit" and the subprocess fails', testIterationNotIterableFailure({stderr: 'inherit'}, nodePrintBothFail));
test('subprocess[Symbol.asyncIterator] throws if only options.stderr is not "pipe" and the subprocess is signaled', testIterationNotIterableFailure({stderr: 'ignore', timeout: 1e3}, nodeHanging, assertSigterm));

test('subprocess[Symbol.asyncIterator] throws if only options.stderr is not "pipe" and the subprocess is canceled', async () => {
	const signal = AbortSignal.timeout(500);
	const subprocess = spawn(...nodeHanging, {stderr: 'ignore', signal});
	const error = await throwsAsync(arrayFromAsync(subprocess));
	assertAbortError(error, signal.reason);
	assert.equal(error, await throwsAsync(subprocess));
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

// Refusing the iteration means the `subprocess` promise is never awaited. When it rejects, that
// must not surface as an unhandled rejection, which crashes the process by default.
const testIterationLateFailure = (iterableType) => async () => {
	const subprocess = spawn(...nodePrintBothFail);
	await subprocess.nodeChildProcess;
	await throwsAsync(arrayFromAsync(getIterable(subprocess, iterableType)), {message: /must be iterated right away/});
	// Give the rejection enough time to be reported if it is unhandled
	await setTimeout(1e2);
	await throwsAsync(subprocess);
};

test('subprocess.stdout must be called right away, without an unhandled rejection', testIterationLateFailure('stdout'));
test('subprocess.stderr must be called right away, without an unhandled rejection', testIterationLateFailure('stderr'));
test('subprocess[Symbol.asyncIterator] must be called right away, without an unhandled rejection', testIterationLateFailure(''));

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

// A generator suspended on a pending line cannot be resumed, so aborting the iteration while the
// other stream is silent used to deadlock instead of throwing.
const testStreamIterateAllErrorWhileRunning = (streamName) => async () => {
	const subprocess = spawn(...nodeHanging);
	const iterated = arrayFromAsync(subprocess);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	const cause = new Error(testString);
	nodeChildProcess[streamName].destroy(cause);

	try {
		const error = await throwsAsync(Promise.race([
			iterated,
			// Fail fast instead of hanging until the test runner times out
			new Promise((resolve, reject) => {
				globalThis.setTimeout(() => {
					reject(new Error(`The subprocess did not throw on its ${streamName} error`));
				}, 1e4).unref();
			}),
		]));
		assertErrorEvent(error, cause, nodeHangingCommand);
	} finally {
		nodeChildProcess.kill();
	}
};

test('Handles subprocess.stdout error in subprocess[Symbol.asyncIterator] while still running', testStreamIterateAllErrorWhileRunning('stdout'));
test('Handles subprocess.stderr error in subprocess[Symbol.asyncIterator] while still running', testStreamIterateAllErrorWhileRunning('stderr'));

// A stream error on one stream leaves the other one open when the subprocess keeps running, so
// nothing ends the iteration: it waited forever for a line which could never come.
const testStreamErrorOnOtherStream = (streamName, otherStreamName) => async () => {
	const subprocess = spawn(...nodeHanging);
	const iterated = arrayFromAsync(subprocess[streamName]);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	const cause = new Error(testString);
	nodeChildProcess[otherStreamName].destroy(cause);

	try {
		const error = await throwsAsync(Promise.race([
			iterated,
			// Fail fast instead of hanging until the test runner times out
			new Promise((resolve, reject) => {
				globalThis.setTimeout(() => {
					reject(new Error(`The subprocess did not throw on its ${otherStreamName} error`));
				}, 1e4).unref();
			}),
		]));
		assertErrorEvent(error, cause, nodeHangingCommand);
	} finally {
		nodeChildProcess.kill();
	}
};

test('Handles subprocess.stderr error while iterating subprocess.stdout', testStreamErrorOnOtherStream('stdout', 'stderr'));
test('Handles subprocess.stdout error while iterating subprocess.stderr', testStreamErrorOnOtherStream('stderr', 'stdout'));

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
// When one stream ends with the subprocess failure, the lines the other stream already read must still be yielded before the error is thrown
test('subprocess[Symbol.asyncIterator] yields every line before a failure, even when consumed slowly', async () => {
	const subprocess = spawn(...nodeEval('for (let index = 0; index < 1000; index++) { console.log(index); } process.exitCode = 2;'));
	const lines = [];
	const error = await throwsAsync((async () => {
		for await (const line of subprocess) {
			if (lines.length === 0) {
				await setTimeout(1e2);
			}

			lines.push(line);
		}
	})());
	assert.equal(error.exitCode, 2);
	assert.equal(lines.length, 1000);
	assert.equal(lines.at(-1), '999');
});

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
