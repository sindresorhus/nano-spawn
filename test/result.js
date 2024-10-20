import test from 'ava';
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
	assertSubprocessErrorName,
	assertFail,
	assertSigterm,
	assertEarlyError,
	assertWindowsNonExistent,
	assertNonExistent,
	assertAbortError,
	assertErrorEvent,
} from './helpers/assert.js';
import {
	nodePrintStdout,
	nodePrintStderr,
	nodePrintBoth,
	nodeHanging,
	nodeEval,
	nodePrintNoNewline,
	nonExistentCommand,
} from './helpers/commands.js';

test('result.exitCode|signalName on success', async t => {
	const {exitCode, signalName} = await spawn(...nodePrintStdout);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
});

test('Error is an instance of SubprocessError', async t => {
	const error = await t.throwsAsync(spawn(...nodeEval('process.exit(2)')));
	t.true(error instanceof SubprocessError);
	assertSubprocessErrorName(t, error.name);
});

test('Error on non-0 exit code', async t => {
	const error = await t.throwsAsync(spawn(...nodeEval('process.exit(2)')));
	assertFail(t, error);
});

test('Error on signal termination', async t => {
	const error = await t.throwsAsync(spawn(...nodeHanging, {timeout: 1}));
	assertSigterm(t, error);
});

test('Error on invalid child_process options', async t => {
	const error = await t.throwsAsync(spawn(...nodePrintStdout, earlyErrorOptions));
	assertEarlyError(t, error);
});

test('Error on "error" event before spawn', async t => {
	const error = await t.throwsAsync(spawn(nonExistentCommand));

	if (isWindows) {
		assertWindowsNonExistent(t, error);
	} else {
		assertNonExistent(t, error);
	}
});

test('Error on "error" event during spawn', async t => {
	const error = await t.throwsAsync(spawn(...nodeHanging, {signal: AbortSignal.abort()}));
	assertSigterm(t, error);
});

test('Error on "error" event during spawn, with iteration', async t => {
	const subprocess = spawn(...nodeHanging, {signal: AbortSignal.abort()});
	const error = await t.throwsAsync(arrayFromAsync(subprocess.stdout));
	assertSigterm(t, error);
});

// The `signal` option sends `SIGTERM`.
// Whether the subprocess is terminated before or after an `error` event is emitted depends on the speed of the OS syscall.
if (isLinux) {
	test('Error on "error" event after spawn', async t => {
		const cause = new Error(testString);
		const controller = new AbortController();
		const subprocess = spawn(...nodeHanging, {signal: controller.signal});
		await subprocess.nodeChildProcess;
		controller.abort(cause);
		const error = await t.throwsAsync(subprocess);
		assertAbortError(t, error, cause);
	});
}

test('result.stdout is set', async t => {
	const {stdout, stderr, output} = await spawn(...nodePrintStdout);
	t.is(stdout, testString);
	t.is(stderr, '');
	t.is(output, stdout);
});

test('result.stderr is set', async t => {
	const {stdout, stderr, output} = await spawn(...nodePrintStderr);
	t.is(stdout, '');
	t.is(stderr, testString);
	t.is(output, stderr);
});

test('result.output is set', async t => {
	const {stdout, stderr, output} = await spawn(...nodePrintBoth);
	t.is(stdout, testString);
	t.is(stderr, secondTestString);
	t.is(output, `${stdout}\n${stderr}`);
});

test('error.stdout is set', async t => {
	const error = await t.throwsAsync(spawn(...nodeEval(`console.log("${testString}");
process.exit(2);`)));
	assertFail(t, error);
	t.is(error.stdout, testString);
	t.is(error.stderr, '');
	t.is(error.output, error.stdout);
});

test('error.stderr is set', async t => {
	const error = await t.throwsAsync(spawn(...nodeEval(`console.error("${testString}");
process.exit(2);`)));
	assertFail(t, error);
	t.is(error.stdout, '');
	t.is(error.stderr, testString);
	t.is(error.output, error.stderr);
});

test('error.output is set', async t => {
	const error = await t.throwsAsync(spawn(...nodeEval(`console.log("${testString}");
setTimeout(() => {
	console.error("${secondTestString}");
	process.exit(2);
}, 0);`)));
	assertFail(t, error);
	t.is(error.stdout, testString);
	t.is(error.stderr, secondTestString);
	t.is(error.output, `${error.stdout}\n${error.stderr}`);
});

const testStreamError = async (t, streamName) => {
	const subprocess = spawn(...nodePrintStdout);
	const cause = new Error(testString);
	destroySubprocessStream(subprocess, cause, streamName);
	const error = await t.throwsAsync(subprocess);
	assertErrorEvent(t, error, cause);
};

test('Handles subprocess.stdin error', testStreamError, 'stdin');
test('Handles subprocess.stdout error', testStreamError, 'stdout');
test('Handles subprocess.stderr error', testStreamError, 'stderr');

const testNewline = async (t, input, expectedOutput) => {
	const {stdout, output} = await spawn(...nodePrintNoNewline(input));
	t.is(stdout, expectedOutput);
	t.is(output, stdout);
};

test('result.stdout handles newline at the beginning', testNewline, '\na\nb', '\na\nb');
test('result.stdout handles newline in the middle', testNewline, 'a\nb', 'a\nb');
test('result.stdout handles newline at the end', testNewline, 'a\nb\n', 'a\nb');
test('result.stdout handles Windows newline at the beginning', testNewline, '\r\na\r\nb', '\r\na\r\nb');
test('result.stdout handles Windows newline in the middle', testNewline, 'a\r\nb', 'a\r\nb');
test('result.stdout handles Windows newline at the end', testNewline, 'a\r\nb\r\n', 'a\r\nb');
test('result.stdout handles 2 newlines at the beginning', testNewline, '\n\na\nb', '\n\na\nb');
test('result.stdout handles 2 newlines in the middle', testNewline, 'a\n\nb', 'a\n\nb');
test('result.stdout handles 2 newlines at the end', testNewline, 'a\nb\n\n', 'a\nb\n');
test('result.stdout handles 2 Windows newlines at the beginning', testNewline, '\r\n\r\na\r\nb', '\r\n\r\na\r\nb');
test('result.stdout handles 2 Windows newlines in the middle', testNewline, 'a\r\n\r\nb', 'a\r\n\r\nb');
test('result.stdout handles 2 Windows newlines at the end', testNewline, 'a\r\nb\r\n\r\n', 'a\r\nb\r\n');
