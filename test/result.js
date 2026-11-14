import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import spawn, {SubprocessError} from '../source/index.js';
import {
	isWindows,
	destroySubprocessStream,
	earlyErrorOptions,
} from './helpers/main.js';
import {testString, secondTestString} from './helpers/arguments.js';
import {
	assertAbortError,
	assertEarlyError,
	assertErrorEvent,
	assertFail,
	assertNonExistent,
	assertSigterm,
	assertSubprocessErrorName,
	assertWindowsNonExistent,
	throwsAsync,
} from './helpers/assert.js';
import {
	nodePrintStdout,
	nodePrintStderr,
	nodePrintBoth,
	nodePrintBothFail,
	nodeHanging,
	nodeHangingCommand,
	nodeEval,
	nodePrintNoNewline,
	nonExistentCommand,
} from './helpers/commands.js';

test('result.exitCode|signalName on success', async () => {
	const {exitCode, signalName} = await spawn(...nodePrintStdout);
	assert.equal(exitCode, undefined);
	assert.equal(signalName, undefined);
});

test('Error is an instance of SubprocessError', async () => {
	const error = await throwsAsync(spawn(...nodeEval('process.exit(2)')));
	assert.ok(error instanceof SubprocessError);
	assertSubprocessErrorName(error.name);
});

test('Error on non-0 exit code', async () => {
	const error = await throwsAsync(spawn(...nodeEval('process.exit(2)')));
	assertFail(error);
});

test('Error on signal termination', async () => {
	const error = await throwsAsync(spawn(...nodeHanging, {timeout: 1}));
	assertSigterm(error);
});

test('Error on invalid child_process options', async () => {
	const error = await throwsAsync(spawn(...nodePrintStdout, earlyErrorOptions));
	assertEarlyError(error);
});

test('Error on "error" event before spawn', async () => {
	const error = await throwsAsync(spawn(nonExistentCommand));

	if (isWindows) {
		assertWindowsNonExistent(error);
	} else {
		assertNonExistent(error);
	}
});

test('Error on "error" event during spawn', async () => {
	const error = await throwsAsync(spawn(...nodeHanging, {signal: AbortSignal.abort()}));
	assertSigterm(error);
});

test('Error on "error" event during spawn, with iteration', async () => {
	const subprocess = spawn(...nodeHanging, {signal: AbortSignal.abort()});
	const error = await throwsAsync(Array.fromAsync(subprocess.stdout));
	assertSigterm(error);
});

// The `signal` option sends `SIGTERM`.
// The `error` event is emitted right away, but the error is only reported once the subprocess has been terminated, so it has `signalName` set.
test('Error on "error" event after spawn', async () => {
	const cause = new Error(testString);
	const controller = new AbortController();
	const subprocess = spawn(...nodeHanging, {signal: controller.signal});
	await subprocess.nodeChildProcess;
	controller.abort(cause);
	const error = await throwsAsync(subprocess);
	assertAbortError(error, cause);
});

if (!isWindows) {
	test('Cancellation waits for the subprocess to close and collects its final output', {timeout: 1e4}, async () => {
		const controller = new AbortController();
		const cause = new Error(testString);
		const subprocess = spawn(...nodeEval(`process.on('SIGTERM', () => {
			setTimeout(() => {
				console.error('cleanup complete');
				process.exit();
			}, 100);
		});
		setInterval(() => {}, 1000);
		console.log('ready');`), {signal: controller.signal});
		const nodeChildProcess = await subprocess.nodeChildProcess;
		const closed = new Promise(resolve => {
			nodeChildProcess.once('close', resolve);
		});

		try {
			// Wait until the child has installed its signal handler.
			await once(nodeChildProcess.stdout, 'data');
			controller.abort(cause);
			const error = await throwsAsync(subprocess);
			assert.equal(nodeChildProcess.exitCode, 0);
			assert.ok(error instanceof SubprocessError);
			assert.equal(error.isCanceled, true);
			assert.equal(error.cause.code, 'ABORT_ERR');
			assert.equal(error.cause.cause, cause);
			assert.equal(error.stdout, 'ready');
			assert.equal(error.stderr, 'cleanup complete');
			assert.equal(error.output, 'ready\ncleanup complete');
		} finally {
			nodeChildProcess.kill('SIGKILL');
			await closed;
		}
	});
}

test('Child process errors are reported while the subprocess is still running', {timeout: 1e4}, async () => {
	const subprocess = spawn(...nodeHanging);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	const closed = new Promise(resolve => {
		nodeChildProcess.once('close', resolve);
	});
	const cause = new Error(testString);

	try {
		nodeChildProcess.emit('error', cause);
		assertErrorEvent(await throwsAsync(subprocess), cause, nodeHangingCommand);
	} finally {
		nodeChildProcess.kill();
		await closed;
	}
});

test('result.stdout is set', async () => {
	const {stdout, stderr, output} = await spawn(...nodePrintStdout);
	assert.equal(stdout, testString);
	assert.equal(stderr, '');
	assert.equal(output, stdout);
});

test('result.stderr is set', async () => {
	const {stdout, stderr, output} = await spawn(...nodePrintStderr);
	assert.equal(stdout, '');
	assert.equal(stderr, testString);
	assert.equal(output, stderr);
});

test('result.output is set', async () => {
	const {stdout, stderr, output} = await spawn(...nodePrintBoth);
	assert.equal(stdout, testString);
	assert.equal(stderr, secondTestString);
	assert.equal(output, `${stdout}\n${stderr}`);
});

test('error.stdout is set', async () => {
	const error = await throwsAsync(spawn(...nodeEval(`console.log("${testString}");
process.exit(2);`)));
	assertFail(error);
	assert.equal(error.stdout, testString);
	assert.equal(error.stderr, '');
	assert.equal(error.output, error.stdout);
});

test('error.stderr is set', async () => {
	const error = await throwsAsync(spawn(...nodeEval(`console.error("${testString}");
process.exit(2);`)));
	assertFail(error);
	assert.equal(error.stdout, '');
	assert.equal(error.stderr, testString);
	assert.equal(error.output, error.stderr);
});

test('error.output is set', async () => {
	const error = await throwsAsync(spawn(...nodeEval(`console.log("${testString}");
setTimeout(() => {
	console.error("${secondTestString}");
	process.exit(2);
}, 0);`)));
	assertFail(error);
	assert.equal(error.stdout, testString);
	assert.equal(error.stderr, secondTestString);
	assert.equal(error.output, `${error.stdout}\n${error.stderr}`);
});

const testStreamError = streamName => async () => {
	const subprocess = spawn(...nodePrintStdout);
	const cause = new Error(testString);
	destroySubprocessStream(subprocess, cause, streamName);
	const error = await throwsAsync(subprocess);
	assertErrorEvent(error, cause);
};

test('Handles subprocess.stdin error', testStreamError('stdin'));
test('Handles subprocess.stdout error', testStreamError('stdout'));
test('Handles subprocess.stderr error', testStreamError('stderr'));

for (const [name, fixture] of [['success', nodePrintStdout], ['failure', nodePrintBothFail]]) {
	test(`Completion removes stream error listeners after ${name}`, async () => {
		const subprocess = spawn(...fixture);
		const nodeChildProcess = await subprocess.nodeChildProcess;
		if (name === 'success') {
			await subprocess;
		} else {
			assertFail(await throwsAsync(subprocess));
		}

		for (const stream of nodeChildProcess.stdio) {
			assert.equal(stream.listenerCount('error'), 0);
		}
	});
}

test('Stream errors remain handled until the subprocess closes after an early failure', {timeout: 1e4}, async () => {
	const subprocess = spawn(...nodeHanging);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	const closed = new Promise(resolve => {
		nodeChildProcess.once('close', resolve);
	});
	const cause = new Error(testString);

	try {
		nodeChildProcess.stdout.destroy(cause);
		assertErrorEvent(await throwsAsync(subprocess), cause, nodeHangingCommand);

		const stderrClosed = new Promise(resolve => {
			nodeChildProcess.stderr.once('close', resolve);
		});
		nodeChildProcess.stderr.destroy(new Error(secondTestString));
		await stderrClosed;
	} finally {
		nodeChildProcess.kill();
		await closed;
	}

	for (const stream of nodeChildProcess.stdio) {
		assert.equal(stream.listenerCount('error'), 0);
	}
});

// A stdio stream error is a subprocess failure in itself. It must be reported right away, even when the subprocess would otherwise keep running forever. Otherwise the error is silently swallowed.
const testStreamErrorWhileRunning = streamName => async () => {
	const subprocess = spawn(...nodeHanging);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	const cause = new Error(testString);
	nodeChildProcess[streamName].destroy(cause);

	try {
		assertErrorEvent(await throwsAsync(subprocess), cause, nodeHangingCommand);
	} finally {
		nodeChildProcess.kill();
	}
};

test('Handles subprocess.stdin error while the subprocess is still running', {timeout: 1e4}, testStreamErrorWhileRunning('stdin'));
test('Handles subprocess.stdout error while the subprocess is still running', {timeout: 1e4}, testStreamErrorWhileRunning('stdout'));
test('Handles subprocess.stderr error while the subprocess is still running', {timeout: 1e4}, testStreamErrorWhileRunning('stderr'));

// A subprocess which exits without reading its input closes its stdin, so writing the rest of the input fails with `EPIPE`. That is not a failure of the subprocess.
test('options.stdin string larger than the pipe buffer does not fail a subprocess which does not read it', async () => {
	const {exitCode, stdout} = await spawn(...nodeEval('0'), {stdin: {string: 'a'.repeat(5e6)}});
	assert.equal(exitCode, undefined);
	assert.equal(stdout, '');
});

const testNewline = (input, expectedOutput) => async () => {
	const {stdout, output} = await spawn(...nodePrintNoNewline(input));
	assert.equal(stdout, expectedOutput);
	assert.equal(output, stdout);
};

test('result.stdout handles newline at the beginning', testNewline('\na\nb', '\na\nb'));
test('result.stdout handles newline in the middle', testNewline('a\nb', 'a\nb'));
test('result.stdout handles newline at the end', testNewline('a\nb\n', 'a\nb'));
test('result.stdout handles Windows newline at the beginning', testNewline('\r\na\r\nb', '\r\na\r\nb'));
test('result.stdout handles Windows newline in the middle', testNewline('a\r\nb', 'a\r\nb'));
test('result.stdout handles Windows newline at the end', testNewline('a\r\nb\r\n', 'a\r\nb'));
test('result.stdout handles 2 newlines at the beginning', testNewline('\n\na\nb', '\n\na\nb'));
test('result.stdout handles 2 newlines in the middle', testNewline('a\n\nb', 'a\n\nb'));
test('result.stdout handles 2 newlines at the end', testNewline('a\nb\n\n', 'a\nb\n'));
test('result.stdout handles 2 Windows newlines at the beginning', testNewline('\r\n\r\na\r\nb', '\r\n\r\na\r\nb'));
test('result.stdout handles 2 Windows newlines in the middle', testNewline('a\r\n\r\nb', 'a\r\n\r\nb'));
test('result.stdout handles 2 Windows newlines at the end', testNewline('a\r\nb\r\n\r\n', 'a\r\nb\r\n'));

// `result.output` is the interleaved output, so only ONE trailing newline is stripped from it
const testOutputNewline = (options, expected) => async () => {
	const {output} = await spawn(...nodePrintBoth, options);
	assert.equal(output, expected);
};

test('result.output strips the trailing newline of both streams', testOutputNewline({}, `${testString}\n${secondTestString}`));
test('result.output keeps the trailing newline when only stdout ends with one', testOutputNewline({stderr: 'ignore'}, testString));
test('result.output keeps the trailing newline when only stderr ends with one', testOutputNewline({stdout: 'ignore'}, secondTestString));

test('error is the same instance for the promise and the iteration', async () => {
	const subprocess = spawn(...nodePrintBothFail);
	const iterationError = await throwsAsync(Array.fromAsync(subprocess));
	assertFail(iterationError);
	assert.equal(iterationError, await throwsAsync(subprocess));
});

test('error.isCanceled is false when killed by a signal, not the signal option', async () => {
	const subprocess = spawn(...nodeHanging);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	nodeChildProcess.kill('SIGKILL');
	const error = await throwsAsync(subprocess);
	assert.equal(error.isCanceled, false);
	assert.equal(error.signalName, 'SIGKILL');
});

test('options.killSignal is used', async () => {
	const error = await throwsAsync(spawn(...nodeHanging, {killSignal: 'SIGKILL', timeout: 1e3}));
	assert.equal(error.signalName, 'SIGKILL');
	assert.equal(error.exitCode, undefined);
	assert.equal(error.isCanceled, false);
});

test('options.timeout is not reported as canceled', async () => {
	const error = await throwsAsync(spawn(...nodeHanging, {timeout: 1}));
	assertSigterm(error);
	assert.equal(error.isCanceled, false);
});

// Every failure must be reported as a `SubprocessError`, whichever way it is observed: awaiting the subprocess, or iterating one of its streams. A failure silently reported as a success, or as a bare `Error`, breaks `if (error instanceof SubprocessError)`.
const FAILING_SCRIPT = 'console.log("out"); console.error("err"); process.exit(2)';
const nodeFailing = ['node', ['-e', FAILING_SCRIPT]];

const failureCases = [
	['exit code', () => spawn(...nodeFailing)],
	['signal', () => spawn('node', ['-e', 'console.log("out"); process.kill(process.pid, "SIGTERM")'])],
	['non-existing command', () => spawn(nonExistentCommand)],
	['timeout', () => spawn('node', ['-e', 'setTimeout(() => {}, 1e4)'], {timeout: 1e3})],
	['canceled', () => spawn('node', ['-e', 'setTimeout(() => {}, 1e4)'], {signal: AbortSignal.timeout(1e3)})],
	['invalid child_process option', () => spawn(...nodePrintStdout, earlyErrorOptions)],
	['options.stdout not "pipe"', () => spawn(...nodeFailing, {stdout: 'ignore'})],
	['options.stderr not "pipe"', () => spawn(...nodeFailing, {stderr: 'ignore'})],
	['options.stdout and options.stderr not "pipe"', () => spawn(...nodeFailing, {stdout: 'ignore', stderr: 'ignore'})],
	['stdin string', () => spawn('node', ['-e', 'process.stdin.resume(); process.exit(2)'], {stdin: {string: testString}})],
	['.pipe() invalid stdio', () => spawn(...nodePrintStdout).pipe(...nodePrintStdout, {stdin: 'ignore'})],
	['.pipe() source failure', () => spawn(...nodeFailing).pipe(...nodePrintStdout)],
	['.pipe() destination failure', () => spawn(...nodePrintStdout).pipe(...nodeFailing)],
	['.pipe() both failures', () => spawn(...nodeFailing).pipe(...nodeFailing)],
	['.pipe() non-existing destination', () => spawn(...nodePrintStdout).pipe(nonExistentCommand)],
];

// Every failure mode must be reported the same way, whether awaited or iterated. The individual cases each assert their own details, so this is the cross-cutting invariant: the same error object shape, and `isCanceled` true for exactly the one case which is canceled.
for (const iterated of [false, true]) {
	for (const [name, getSubprocess] of failureCases) {
		const how = iterated ? 'iterated' : 'awaited';
		test(`every failure is a SubprocessError, ${how}: ${name}`, async () => {
			const subprocess = getSubprocess();
			const error = await throwsAsync(iterated ? Array.fromAsync(subprocess) : subprocess);
			assert.ok(error instanceof SubprocessError);
			assert.equal(error.name, 'SubprocessError');
			assert.equal(error.isCanceled, name === 'canceled');
		});
	}
}
