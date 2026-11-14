import test from 'node:test';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {setTimeout} from 'node:timers/promises';
import assert from 'node:assert/strict';
import spawn from '../source/index.js';
import {
	isWindows,
	destroySubprocessStream,
	writeMultibyte,
	FIXTURES_URL,
} from './helpers/main.js';
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
	throwsAsync,
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
	const lines = await Array.fromAsync(subprocess.stdout);
	assert.deepEqual(lines, [testString]);
	const {stdout, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(output, '');
});

test('subprocess.stderr can be iterated', async () => {
	const subprocess = spawn(...nodePrintStderr);
	const lines = await Array.fromAsync(subprocess.stderr);
	assert.deepEqual(lines, [testString]);
	const {stderr, output} = await subprocess;
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess[Symbol.asyncIterator] can be iterated', async () => {
	// Writes are spaced out: two pipes have no ordering guarantee, so this makes the merged iteration order deterministic
	const subprocess = spawn('node', ['--input-type=module', '-e', `
import {setTimeout} from 'node:timers/promises';

console.log("${testString}");
await setTimeout(50);
console.log("${secondTestString}");
await setTimeout(50);
console.error("${thirdTestString}");
await setTimeout(50);
console.error("${fourthTestString}");`]);

	const lines = await Array.fromAsync(subprocess);
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

	const lines = await Array.fromAsync(subprocess);
	assert.deepEqual(lines, Array.from({length}, () => [testString, secondTestString]).flat());

	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

for (const streamName of ['stdout', 'stderr']) {
	test(`Merged iteration does not retain callbacks while only ${streamName} produces lines`, async () => {
		const {stdout} = await spawn(process.execPath, ['--expose-gc', fileURLToPath(new URL('iteration-memory.js', FIXTURES_URL)), streamName], {timeout: 1e4});
		const {lines, retainedHeap} = JSON.parse(stdout);
		assert.equal(lines, 100_000);
		assert.ok(Number.isFinite(retainedHeap));
		// Allow runtime overhead while detecting retained callbacks for every line.
		assert.ok(retainedHeap < 10e6, `Retained ${retainedHeap} bytes after 100,000 lines`);
	});
}

test('subprocess.stdout throws if options.stdout "ignore"', async () => {
	const subprocess = spawn(...nodePrintBoth, {stdout: 'ignore'});
	const [{reason}, {value: stderrLines}] = await Promise.allSettled([Array.fromAsync(subprocess.stdout), Array.fromAsync(subprocess.stderr)]);
	assert.equal(reason.message, 'The subprocess cannot be iterated unless the option `stdout` is \'pipe\'.');
	assert.deepEqual(stderrLines, [secondTestString]);
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess.stderr throws if options.stderr "ignore"', async () => {
	const subprocess = spawn(...nodePrintBoth, {stderr: 'ignore'});
	const [{value: stdoutLines}, {reason}] = await Promise.allSettled([Array.fromAsync(subprocess.stdout), Array.fromAsync(subprocess.stderr)]);
	assert.equal(reason.message, 'The subprocess cannot be iterated unless the option `stderr` is \'pipe\'.');
	assert.deepEqual(stdoutLines, [testString]);
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess[Symbol.asyncIterator] has iterations if only options.stdout "ignore"', async () => {
	const subprocess = spawn(...nodePrintBoth, {stdout: 'ignore'});
	const lines = await Array.fromAsync(subprocess);
	assert.deepEqual(lines, [secondTestString]);
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('subprocess[Symbol.asyncIterator] has iterations if only options.stderr "ignore"', async () => {
	const subprocess = spawn(...nodePrintBoth, {stderr: 'ignore'});
	const lines = await Array.fromAsync(subprocess);
	assert.deepEqual(lines, [testString]);
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

// A stream which cannot be iterated must not make a subprocess failure disappear: the "not iterable" error is only ignored when the subprocess itself did not fail.
const testIterationNotIterableFailure = (options, fixture, assertError = assertFail) => async () => {
	const subprocess = spawn(...fixture, options);
	const error = await throwsAsync(Array.fromAsync(subprocess));
	assertError(error);
	assert.equal(error, await throwsAsync(subprocess));
};

test('subprocess[Symbol.asyncIterator] throws if only options.stderr is not "pipe" and the subprocess fails', testIterationNotIterableFailure({stderr: 'ignore'}, nodePrintBothFail));
test('subprocess[Symbol.asyncIterator] throws if only options.stdout is not "pipe" and the subprocess fails', testIterationNotIterableFailure({stdout: 'ignore'}, nodePrintBothFail));
test('subprocess[Symbol.asyncIterator] throws if both options.stdout + options.stderr are not "pipe" and the subprocess fails',
	testIterationNotIterableFailure({stdout: 'ignore', stderr: 'ignore'}, nodePrintBothFail));
test('subprocess[Symbol.asyncIterator] throws if only options.stderr is "inherit" and the subprocess fails', testIterationNotIterableFailure({stderr: 'inherit'}, nodePrintBothFail));
test('subprocess[Symbol.asyncIterator] throws if only options.stderr is not "pipe" and the subprocess is signaled',
	testIterationNotIterableFailure({stderr: 'ignore', timeout: 1e3}, nodeHanging, assertSigterm));

test('subprocess[Symbol.asyncIterator] throws if only options.stderr is not "pipe" and the subprocess is canceled', async () => {
	const signal = AbortSignal.timeout(500);
	const subprocess = spawn(...nodeHanging, {stderr: 'ignore', signal});
	const error = await throwsAsync(Array.fromAsync(subprocess));
	assertAbortError(error, signal.reason);
	assert.equal(error, await throwsAsync(subprocess));
});

test('subprocess[Symbol.asyncIterator] throws if only options.stdout + options.stderr "ignore"', async () => {
	const subprocess = spawn(...nodePrintBoth, {stdout: 'ignore', stderr: 'ignore'});
	const error = await throwsAsync(Array.fromAsync(subprocess));
	assert.equal(error.message, 'The subprocess cannot be iterated unless either the option `stdout` or `stderr` is \'pipe\'.');
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

for (const streamNames of [['stdout', 'stderr'], ['stderr', 'stdout']]) {
	test(`Unavailable stream errors are independent of iteration order: ${streamNames.join(', ')}`, async () => {
		const subprocess = spawn(...nodePrintBoth, {stdio: 'ignore'});
		const errors = await Promise.all(streamNames.map(async streamName => {
			const error = await throwsAsync(Array.fromAsync(subprocess[streamName]));
			assert.ok(error instanceof TypeError);
			assert.equal(error.message, `The subprocess cannot be iterated unless the option \`${streamName}\` is 'pipe'.`);
			return error;
		}));
		assert.notEqual(errors[0], errors[1]);
		await subprocess;
	});
}

test('Merged iteration keeps a late iteration error when the other stream is unavailable', async () => {
	const subprocess = spawn(...nodePrintStdout, {stderr: 'ignore'});
	await subprocess.nodeChildProcess;
	await assert.rejects(Array.fromAsync(subprocess), /must be iterated right away/v);
	const {stdout} = await subprocess;
	assert.equal(stdout, testString);
});

test('subprocess.stdout has no iterations but waits for the subprocess if options.stdout "ignore"', async () => {
	const subprocess = spawn(...nodePrintBothFail, {stdout: 'ignore'});
	const error = await throwsAsync(Array.fromAsync(subprocess.stdout));
	assertFail(error);
	const promiseError = await throwsAsync(subprocess);
	assert.equal(promiseError, error);
	assert.equal(promiseError.stdout, '');
	assert.equal(promiseError.stderr, secondTestString);
	assert.equal(promiseError.output, secondTestString);
});

// Refusing the iteration means the `subprocess` promise is never awaited. When it rejects, that must not surface as an unhandled rejection, which crashes the process by default.
const testIterationLateFailure = iterableType => async () => {
	const subprocess = spawn(...nodePrintBothFail);
	await subprocess.nodeChildProcess;
	await throwsAsync(Array.fromAsync(getIterable(subprocess, iterableType)), {message: /must be iterated right away/v});
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
	const lines = await Array.fromAsync(subprocess);
	assert.deepEqual(lines, ['a', 'b', 'c', 'd']);
});

const testNewlineIteration = (input, expectedLines) => async () => {
	const subprocess = spawn(...nodePrintNoNewline(input));
	const lines = await Array.fromAsync(subprocess.stdout);
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
	const lines = await Array.fromAsync(subprocess.stdout);
	assert.deepEqual(lines, [multibyteString]);
	const {stdout, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(output, '');
});

const testStreamIterateError = (streamName, fixture) => async () => {
	const subprocess = spawn(...fixture);
	const cause = new Error(testString);
	destroySubprocessStream(subprocess, cause, streamName);
	const error = await throwsAsync(Array.fromAsync(subprocess[streamName]));
	assertErrorEvent(error, cause);
	const promiseError = await throwsAsync(subprocess);
	assertErrorEvent(promiseError, cause);
	assert.equal(promiseError[streamName], '');
	assert.equal(promiseError.output, '');
};

test('Handles subprocess.stdout error', testStreamIterateError('stdout', nodePrintStdout));
test('Handles subprocess.stderr error', testStreamIterateError('stderr', nodePrintStderr));

const testStreamIterateAllError = streamName => async () => {
	const subprocess = spawn(...nodePrintStdout);
	const cause = new Error(testString);
	destroySubprocessStream(subprocess, cause, streamName);
	const error = await throwsAsync(Array.fromAsync(subprocess));
	assertErrorEvent(error, cause);
	const promiseError = await throwsAsync(subprocess);
	assertErrorEvent(promiseError, cause);
	assert.equal(promiseError[streamName], '');
	assert.equal(promiseError.output, '');
};

test('Handles subprocess.stdout error in subprocess[Symbol.asyncIterator]', testStreamIterateAllError('stdout'));
test('Handles subprocess.stderr error in subprocess[Symbol.asyncIterator]', testStreamIterateAllError('stderr'));

// A stream error leaves the other streams open when the subprocess keeps running. The iteration must still end with that error, instead of waiting forever for a line which can never come.
const testStreamErrorWhileRunning = (iterableType, brokenStreamName) => async () => {
	const subprocess = spawn(...nodeHanging);
	const iterated = Array.fromAsync(getIterable(subprocess, iterableType));
	const nodeChildProcess = await subprocess.nodeChildProcess;
	const cause = new Error(testString);
	nodeChildProcess[brokenStreamName].destroy(cause);

	try {
		assertErrorEvent(await throwsAsync(iterated), cause, nodeHangingCommand);
	} finally {
		nodeChildProcess.kill();
	}
};

test('Handles subprocess.stdout error in subprocess[Symbol.asyncIterator] while still running', {timeout: 1e4}, testStreamErrorWhileRunning('', 'stdout'));
test('Handles subprocess.stderr error in subprocess[Symbol.asyncIterator] while still running', {timeout: 1e4}, testStreamErrorWhileRunning('', 'stderr'));
test('Handles subprocess.stderr error while iterating subprocess.stdout', {timeout: 1e4}, testStreamErrorWhileRunning('stdout', 'stderr'));
test('Handles subprocess.stdout error while iterating subprocess.stderr', {timeout: 1e4}, testStreamErrorWhileRunning('stderr', 'stdout'));

for (const streamName of ['stdout', 'stderr']) {
	for (const iterableType of [streamName, '']) {
		test(`Failed ${iterableType || 'merged'} iteration releases the ${streamName} reader before another stream error`, {timeout: 1e4}, async () => {
			const subprocess = spawn(...nodeHanging);
			const iterated = Array.fromAsync(getIterable(subprocess, iterableType));
			const nodeChildProcess = await subprocess.nodeChildProcess;
			const closed = new Promise(resolve => {
				nodeChildProcess.once('close', resolve);
			});
			const cause = new Error(testString);

			try {
				const otherStreamName = streamName === 'stdout' ? 'stderr' : 'stdout';
				nodeChildProcess[otherStreamName].destroy(cause);
				assertErrorEvent(await throwsAsync(iterated), cause, nodeHangingCommand);
				assert.equal(nodeChildProcess[streamName].listenerCount('data'), 0);

				const streamClosed = new Promise(resolve => {
					nodeChildProcess[streamName].once('close', resolve);
				});
				nodeChildProcess[streamName].destroy(new Error(secondTestString));
				await streamClosed;
			} finally {
				nodeChildProcess.kill();
				await closed;
			}
		});
	}
}

const testStreamIterateSignal = streamName => async () => {
	const signal = AbortSignal.timeout(0);
	const subprocess = spawn(...nodeHanging, {signal});
	const error = await throwsAsync(Array.fromAsync(subprocess[streamName]));
	assertAbortError(error, signal.reason);
	const promiseError = await throwsAsync(subprocess);
	assert.equal(promiseError, error);
	assert.equal(promiseError.stdout, '');
	assert.equal(promiseError.stderr, '');
	assert.equal(promiseError.output, '');
};

test('Handles subprocess.stdout error with the "signal" option', testStreamIterateSignal('stdout'));
test('Handles subprocess.stderr error with the "signal" option', testStreamIterateSignal('stderr'));

// `SIGTERM` handlers do not run on Windows
if (!isWindows) {
	test('subprocess[Symbol.asyncIterator] yields the lines printed after cancellation', {timeout: 1e4}, async () => {
		const controller = new AbortController();
		const subprocess = spawn(...nodeEval(`process.on('SIGTERM', () => {
			setTimeout(() => {
				console.log('${secondTestString}');
				process.exit();
			}, 100);
		});
		setTimeout(() => {}, 1e4);
		console.log('${testString}');`), {signal: controller.signal});
		const lines = [];
		const error = await throwsAsync((async () => {
			for await (const line of subprocess) {
				lines.push(line);
				controller.abort();
			}
		})());
		assert.deepEqual(lines, [testString, secondTestString]);
		assert.equal(error.isCanceled, true);
		assert.equal(error.cause.code, 'ABORT_ERR');
	});
}

// eslint-disable-next-line max-params
const iterateOnOutput = async (subprocess, state, cause, shouldThrow, iterableType) => {
	// eslint-disable-next-line no-unreachable-loop
	for await (const line of getIterable(subprocess, iterableType)) {
		assert.equal(line, testString);
		state.ending = endSubprocessLater(subprocess, state);

		if (shouldThrow) {
			throw cause;
		}

		break;
	}
};

// The subprocess only ends after the iteration stopped, so stopping it must wait for the subprocess
const endSubprocessLater = async (subprocess, state) => {
	await setTimeout(1e2);
	const {stdin, stdout} = await subprocess.nodeChildProcess;

	try {
		assert.ok(stdout.readable);
		assert.ok(stdin.writable);
	} finally {
		stdin.end(secondTestString);
		state.done = true;
	}
};

const testIteration = (shouldThrow, iterableType) => async () => {
	const subprocess = spawn(...nodePassThroughPrint);
	const state = {done: false};
	const cause = new Error(testString);

	const iteration = iterateOnOutput(subprocess, state, cause, shouldThrow, iterableType);
	if (shouldThrow) {
		assert.equal(await throwsAsync(iteration), cause);
	} else {
		await iteration;
	}

	assert.ok(state.done);
	await state.ending;

	const {stdout, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(output, '');
};

test('subprocess.stdout iteration break waits for the subprocess success', testIteration(false, 'stdout'));
test('subprocess[Symbol.asyncIterator] iteration break waits for the subprocess success', testIteration(false, ''));
test('subprocess.stdout iteration exception waits for the subprocess success', testIteration(true, 'stdout'));
test('subprocess[Symbol.asyncIterator] iteration exception waits for the subprocess success', testIteration(true, ''));

for (const streamName of ['stdout', 'stderr']) {
	for (const iterableType of [streamName, '']) {
		test(`Stopping ${iterableType || 'merged'} iteration drains large remaining ${streamName} after a consumer pause`, {timeout: 1e4}, async () => {
			const subprocess = spawn(...nodeEval(`console.${streamName === 'stdout' ? 'log' : 'error'}("${testString}");
process.stdin.once("data", () => {
	process.${streamName}.write("remaining output\\n".repeat(300_000), () => {
		process.exit();
	});
});`), {timeout: 3e3});

			// eslint-disable-next-line no-unreachable-loop
			for await (const line of getIterable(subprocess, iterableType)) {
				assert.equal(line, testString);
				const nodeChildProcess = await subprocess.nodeChildProcess;
				const paused = once(nodeChildProcess[streamName], 'pause');
				nodeChildProcess.stdin.end('continue');
				await paused;
				break;
			}

			const result = await subprocess;
			assert.equal(result[streamName], '');
			assert.equal(result.output, '');
		});
	}
}

const testIterationFail = (shouldThrow, iterableType) => async () => {
	const subprocess = spawn(...nodePassThroughPrintFail);
	const state = {done: false};
	const cause = new Error(testString);
	// Breaking out of the loop throws the subprocess failure, since the iteration waits for the subprocess
	const caughtError = await throwsAsync(iterateOnOutput(subprocess, state, cause, shouldThrow, iterableType));
	assert.equal(caughtError === cause, shouldThrow);
	assert.ok(state.done);
	await state.ending;

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
	const lines = await Array.fromAsync(subprocess[streamName]);
	assert.deepEqual(lines, [expectedLines]);
	const result = await subprocess;
	assert.equal(result[streamName], '');
	assert.equal(result[otherStreamName], expectedOutput);
	assert.equal(result.output, expectedOutput);
};

test('subprocess.stderr is still buffered when subprocess.stdout is iterated', testPartialIteration('stdout', 'stderr', testString, secondTestString));
test('subprocess.stdout is still buffered when subprocess.stderr is iterated', testPartialIteration('stderr', 'stdout', secondTestString, testString));
