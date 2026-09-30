import test from 'node:test';
import assert from 'node:assert/strict';
import spawn, {SubprocessError} from '../source/index.js';
import {
	isWindows,
	isLinux,
	destroySubprocessStream,
	arrayFromAsync,
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
	throwsAsync
} from './helpers/assert.js';
import {
	nodePrintStdout,
	nodePrintStderr,
	nodePrintBoth,
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
	const error = await throwsAsync(arrayFromAsync(subprocess.stdout));
	assertSigterm(error);
});

// The `signal` option sends `SIGTERM`.
// Whether the subprocess is terminated before or after an `error` event is emitted depends on the speed of the OS syscall.
if (isLinux) {
	test('Error on "error" event after spawn', async () => {
		const cause = new Error(testString);
		const controller = new AbortController();
		const subprocess = spawn(...nodeHanging, {signal: controller.signal});
		await subprocess.nodeChildProcess;
		controller.abort(cause);
		const error = await throwsAsync(subprocess);
		assertAbortError(error, cause);
	});
}

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

const testStreamError = (streamName) => async () => {
	const subprocess = spawn(...nodePrintStdout);
	const cause = new Error(testString);
	destroySubprocessStream(subprocess, cause, streamName);
	const error = await throwsAsync(subprocess);
	assertErrorEvent(error, cause);
};

test('Handles subprocess.stdin error', testStreamError('stdin'));
test('Handles subprocess.stdout error', testStreamError('stdout'));
test('Handles subprocess.stderr error', testStreamError('stderr'));

// A stdio stream error is a subprocess failure in itself. It must be reported right away, even when
// the subprocess would otherwise keep running forever. Otherwise the error is silently swallowed.
const testStreamErrorWhileRunning = (streamName) => async () => {
	const subprocess = spawn(...nodeHanging);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	const cause = new Error(testString);
	nodeChildProcess[streamName].destroy(cause);

	try {
		const error = await throwsAsync(Promise.race([
			subprocess,
			// Fail fast instead of hanging until the test runner times out
			new Promise((resolve, reject) => {
				setTimeout(() => {
					reject(new Error(`The subprocess did not reject on its ${streamName} error`));
				}, 1e4).unref();
			}),
		]));
		assertErrorEvent(error, cause, nodeHangingCommand);
	} finally {
		nodeChildProcess.kill();
	}
};

test('Handles subprocess.stdin error while the subprocess is still running', testStreamErrorWhileRunning('stdin'));
test('Handles subprocess.stdout error while the subprocess is still running', testStreamErrorWhileRunning('stdout'));
test('Handles subprocess.stderr error while the subprocess is still running', testStreamErrorWhileRunning('stderr'));

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
