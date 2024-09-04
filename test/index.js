import {createReadStream, createWriteStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import path from 'node:path';
import process from 'node:process';
import {setTimeout} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import getNode from 'get-node';
import pathKey from 'path-key';
import {temporaryWriteTask} from 'tempy';
import {red} from 'yoctocolors';
import nanoSpawn from '../source/index.js';

const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';
const FIXTURES_URL = new URL('fixtures/', import.meta.url);
const fixturesPath = fileURLToPath(FIXTURES_URL);
const testFixtureUrl = new URL('test.txt', FIXTURES_URL);

const nodeDirectory = path.dirname(process.execPath);

// TODO: replace with Array.fromAsync() after dropping support for Node <22.0.0
const arrayFromAsync = async asyncIterable => {
	const chunks = [];
	for await (const chunk of asyncIterable) {
		chunks.push(chunk);
	}

	return chunks;
};

const getIterable = (promise, promiseType) => promiseType === ''
	? promise
	: promise[promiseType];

const testString = 'test';
const secondTestString = 'secondTest';
const thirdTestString = 'thirdTest';
const fourthTestString = 'fourthTest';
const testUpperCase = testString.toUpperCase();
const testDoubleUpperCase = `${testUpperCase}${testUpperCase}`;

const getPipeSize = command => command.split(' | ').length;

const nodeHanging = ['node'];
const [nodeHangingCommand] = nodeHanging;
const nodePrint = bodyString => ['node', ['-p', bodyString]];
const nodeEval = bodyString => ['node', ['-e', bodyString]];
const nodeEvalCommandStart = 'node -e';
const nodePrintStdout = nodeEval(`console.log("${testString}")`);
const nodePrintStderr = nodeEval(`console.error("${testString}")`);
const nodePrintBoth = nodeEval(`console.log("${testString}");
setTimeout(() => {
	console.error("${secondTestString}");
}, 0);`);
const nodePrintBothFail = nodeEval(`console.log("${testString}");
setTimeout(() => {
	console.error("${secondTestString}");
	process.exit(2);
}, 0);`);
const nodePrintFail = nodeEval(`console.log("${testString}");
process.exit(2);`);
const nodePrintSleep = nodeEval(`setTimeout(() => {
	console.log("${testString}");
}, 1e2);`);
const nodePrintSleepFail = nodeEval(`setTimeout(() => {
	console.log("${testString}");
	process.exit(2);
}, 1e2);`);
const nodePrintArgv0 = nodePrint('process.argv0');
const nodePrintNoNewline = output => nodeEval(`process.stdout.write("${output.replaceAll('\n', '\\n').replaceAll('\r', '\\r')}")`);
const nodePassThrough = nodeEval('process.stdin.pipe(process.stdout)');
const nodePassThroughPrint = nodeEval(`process.stdin.pipe(process.stdout);
console.log("${testString}");`);
const nodePassThroughPrintFail = nodeEval(`process.stdin.once("data", (chunk) => {
	console.log(chunk.toString());
	process.exit(2);
});
console.log("${testString}");`);
const nodeToUpperCase = nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim().toUpperCase());
});`);
const nodeToUpperCaseStderr = nodeEval(`process.stdin.on("data", chunk => {
	console.error(chunk.toString().trim().toUpperCase());
});`);
const nodeToUpperCaseFail = nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim().toUpperCase());
	process.exit(2);
});`);
const nodeDouble = nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim() + chunk.toString().trim());
});`);
const nodeDoubleFail = nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim() + chunk.toString().trim());
	process.exit(2);
});`);
const localBinary = ['ava', ['--version']];
const localBinaryCommand = localBinary.flat().join(' ');
const [localBinaryCommandStart] = localBinary;
const nonExistentCommand = 'non-existent-command';

const assertDurationMs = (t, durationMs) => {
	t.true(Number.isFinite(durationMs));
	t.true(durationMs > 0);
};

const assertNonExistent = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, commandStart = nonExistentCommand, expectedCommand = commandStart) => {
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed: ${expectedCommand}`);
	t.is(stderr, '');
	t.true(cause.message.includes(commandStart));
	t.is(cause.code, 'ENOENT');
	t.is(cause.syscall, `spawn ${commandStart}`);
	t.is(cause.path, commandStart);
	assertDurationMs(t, durationMs);
};

const assertWindowsNonExistent = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	t.is(exitCode, 1);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed with exit code 1: ${expectedCommand}`);
	t.true(stderr.includes('not recognized as an internal or external command'));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

const assertUnixNonExistentShell = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	t.is(exitCode, 127);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed with exit code 127: ${expectedCommand}`);
	t.true(stderr.includes('not found'));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

const assertUnixNotFound = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	t.is(exitCode, 127);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed with exit code 127: ${expectedCommand}`);
	t.true(stderr.includes('No such file or directory'));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

const assertFail = (t, {exitCode, signalName, command, message, cause, durationMs}, commandStart = nodeEvalCommandStart) => {
	t.is(exitCode, 2);
	t.is(signalName, undefined);
	t.true(command.startsWith(commandStart));
	t.true(message.startsWith(`Command failed with exit code 2: ${commandStart}`));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

const assertSigterm = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nodeHangingCommand) => {
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
	t.is(command, expectedCommand);
	t.is(message, `Command was terminated with SIGTERM: ${expectedCommand}`);
	t.is(stderr, '');
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

const earlyErrorOptions = {detached: 'true'};

const assertEarlyError = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, commandStart = nodeEvalCommandStart) => {
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(command.startsWith(commandStart));
	t.true(message.startsWith(`Command failed: ${commandStart}`));
	t.is(stderr, '');
	t.true(cause.message.includes('options.detached'));
	t.false(cause.message.includes('Command'));
	assertDurationMs(t, durationMs);
};

const assertAbortError = (t, {exitCode, signalName, command, stderr, message, cause, durationMs}, expectedCause, expectedCommand = nodeHangingCommand) => {
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed: ${expectedCommand}`);
	t.is(stderr, '');
	t.is(cause.message, 'The operation was aborted');
	t.is(cause.cause, expectedCause);
	assertDurationMs(t, durationMs);
};

const assertErrorEvent = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCause, commandStart = nodeEvalCommandStart) => {
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(command.startsWith(commandStart));
	t.true(message.startsWith(`Command failed: ${commandStart}`));
	t.is(stderr, '');
	t.is(cause, expectedCause);
	assertDurationMs(t, durationMs);
};

const VERSION_REGEXP = /^\d+\.\d+\.\d+$/;

const testArgv0 = async (t, shell) => {
	const {stdout} = await nanoSpawn(...nodePrintArgv0, {argv0: testString, shell});
	t.is(stdout, shell ? process.execPath : testString);
};

test('Can pass options.argv0', testArgv0, false);
test('Can pass options.argv0, shell', testArgv0, true);

const testStdOption = async (t, optionName) => {
	const promise = nanoSpawn(...nodePrintStdout, {[optionName]: 'ignore'});
	const subprocess = await promise.nodeChildProcess;
	t.is(subprocess[optionName], null);
	await promise;
};

test('Can pass options.stdin', testStdOption, 'stdin');
test('Can pass options.stdout', testStdOption, 'stdout');
test('Can pass options.stderr', testStdOption, 'stderr');

test('Can pass options.stdio array', async t => {
	const promise = nanoSpawn(...nodePrintStdout, {stdio: ['ignore', 'pipe', 'pipe', 'pipe']});
	const {stdin, stdout, stderr, stdio} = await promise.nodeChildProcess;
	t.is(stdin, null);
	t.not(stdout, null);
	t.not(stderr, null);
	t.not(stdio[3], null);
	await promise;
});

test('Can pass options.stdio string', async t => {
	const promise = nanoSpawn(...nodePrintStdout, {stdio: 'ignore'});
	const {stdin, stdout, stderr, stdio} = await promise.nodeChildProcess;
	t.is(stdin, null);
	t.is(stdout, null);
	t.is(stderr, null);
	t.is(stdio.length, 3);
	await promise;
});

test('options.stdio array has priority over options.stdout', async t => {
	const promise = nanoSpawn(...nodePrintStdout, {stdio: ['pipe', 'pipe', 'pipe'], stdout: 'ignore'});
	const {stdout} = await promise.nodeChildProcess;
	t.not(stdout, null);
	await promise;
});

test('options.stdio string has priority over options.stdout', async t => {
	const promise = nanoSpawn(...nodePrintStdout, {stdio: 'pipe', stdout: 'ignore'});
	const {stdout} = await promise.nodeChildProcess;
	t.not(stdout, null);
	await promise;
});

test('options.stdin can be {string: string}', async t => {
	const {stdout} = await nanoSpawn(...nodePassThrough, {stdin: {string: testString}});
	t.is(stdout, testString);
});

test('options.stdio[0] can be {string: string}', async t => {
	const {stdout} = await nanoSpawn(...nodePassThrough, {stdio: [{string: testString}, 'pipe', 'pipe']});
	t.is(stdout, testString);
});

test.serial('options.env augments process.env', async t => {
	process.env.ONE = 'one';
	process.env.TWO = 'two';
	const {stdout} = await nanoSpawn(...nodePrint('process.env.ONE + process.env.TWO'), {env: {TWO: testString}});
	t.is(stdout, `${process.env.ONE}${testString}`);
	delete process.env.ONE;
	delete process.env.TWO;
});

test('result.exitCode|signalName on success', async t => {
	const {exitCode, signalName} = await nanoSpawn(...nodePrintStdout);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
});

test('Error on non-0 exit code', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodeEval('process.exit(2)')));
	assertFail(t, error);
});

test('Error on signal termination', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodeHanging, {timeout: 1}));
	assertSigterm(t, error);
});

test('Error on invalid child_process options', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodePrintStdout, earlyErrorOptions));
	assertEarlyError(t, error);
});

test('Error on "error" event before spawn', async t => {
	const error = await t.throwsAsync(nanoSpawn(nonExistentCommand));

	if (isWindows) {
		assertWindowsNonExistent(t, error);
	} else {
		assertNonExistent(t, error);
	}
});

test('Error on "error" event during spawn', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodeHanging, {signal: AbortSignal.abort()}));
	assertSigterm(t, error);
});

test('Error on "error" event during spawn, with iteration', async t => {
	const promise = nanoSpawn(...nodeHanging, {signal: AbortSignal.abort()});
	const error = await t.throwsAsync(arrayFromAsync(promise.stdout));
	assertSigterm(t, error);
});

// The `signal` option sends `SIGTERM`.
// Whether the subprocess is terminated before or after an `error` event is emitted depends on the speed of the OS syscall.
if (isLinux) {
	test('Error on "error" event after spawn', async t => {
		const cause = new Error(testString);
		const controller = new AbortController();
		const promise = nanoSpawn(...nodeHanging, {signal: controller.signal});
		await promise.nodeChildProcess;
		controller.abort(cause);
		const error = await t.throwsAsync(promise);
		assertAbortError(t, error, cause);
	});
}

test('promise.stdout can be iterated', async t => {
	const promise = nanoSpawn(...nodePrintStdout);
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, [testString]);
	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
});

test('promise.stderr can be iterated', async t => {
	const promise = nanoSpawn(...nodePrintStderr);
	const lines = await arrayFromAsync(promise.stderr);
	t.deepEqual(lines, [testString]);
	const {stderr, output} = await promise;
	t.is(stderr, '');
	t.is(output, '');
});

test('promise[Symbol.asyncIterator] can be iterated', async t => {
	const promise = nanoSpawn(...nodeEval(`console.log("${testString}");
console.log("${secondTestString}");
console.error("${thirdTestString}");
console.error("${fourthTestString}");`));

	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, [testString, secondTestString, thirdTestString, fourthTestString]);

	const {stdout, stderr, output} = await promise;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test.serial('promise iteration can be interleaved', async t => {
	const length = 10;
	const promise = nanoSpawn('node', ['--input-type=module', '-e', `
import {setTimeout} from 'node:timers/promises';

for (let index = 0; index < ${length}; index += 1) {
	console.log("${testString}");
	await setTimeout(10);
	console.error("${secondTestString}");
	await setTimeout(10);
}`]);

	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, Array.from({length}, () => [testString, secondTestString]).flat());

	const {stdout, stderr, output} = await promise;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('result.stdout is set', async t => {
	const {stdout, stderr, output} = await nanoSpawn(...nodePrintStdout);
	t.is(stdout, testString);
	t.is(stderr, '');
	t.is(output, stdout);
});

test('result.stderr is set', async t => {
	const {stdout, stderr, output} = await nanoSpawn(...nodePrintStderr);
	t.is(stdout, '');
	t.is(stderr, testString);
	t.is(output, stderr);
});

test('result.output is set', async t => {
	const {stdout, stderr, output} = await nanoSpawn(...nodePrintBoth);
	t.is(stdout, testString);
	t.is(stderr, secondTestString);
	t.is(output, `${stdout}\n${stderr}`);
});

test('error.stdout is set', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodeEval(`console.log("${testString}");
process.exit(2);`)));
	assertFail(t, error);
	t.is(error.stdout, testString);
	t.is(error.stderr, '');
	t.is(error.output, error.stdout);
});

test('error.stderr is set', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodeEval(`console.error("${testString}");
process.exit(2);`)));
	assertFail(t, error);
	t.is(error.stdout, '');
	t.is(error.stderr, testString);
	t.is(error.output, error.stderr);
});

test('error.output is set', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodeEval(`console.log("${testString}");
setTimeout(() => {
	console.error("${secondTestString}");
	process.exit(2);
}, 0);`)));
	assertFail(t, error);
	t.is(error.stdout, testString);
	t.is(error.stderr, secondTestString);
	t.is(error.output, `${error.stdout}\n${error.stderr}`);
});

test('promise.stdout has no iterations if options.stdout "ignore"', async t => {
	const promise = nanoSpawn(...nodePrintBoth, {stdout: 'ignore'});
	const [stdoutLines, stderrLines] = await Promise.all([arrayFromAsync(promise.stdout), arrayFromAsync(promise.stderr)]);
	t.deepEqual(stdoutLines, []);
	t.deepEqual(stderrLines, [secondTestString]);
	const {stdout, stderr, output} = await promise;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('promise.stderr has no iterations if options.stderr "ignore"', async t => {
	const promise = nanoSpawn(...nodePrintBoth, {stderr: 'ignore'});
	const [stdoutLines, stderrLines] = await Promise.all([arrayFromAsync(promise.stdout), arrayFromAsync(promise.stderr)]);
	t.deepEqual(stdoutLines, [testString]);
	t.deepEqual(stderrLines, []);
	const {stdout, stderr, output} = await promise;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('promise[Symbol.asyncIterator] has iterations if only options.stdout "ignore"', async t => {
	const promise = nanoSpawn(...nodePrintBoth, {stdout: 'ignore'});
	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, [secondTestString]);
	const {stdout, stderr, output} = await promise;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('promise[Symbol.asyncIterator] has iterations if only options.stderr "ignore"', async t => {
	const promise = nanoSpawn(...nodePrintBoth, {stderr: 'ignore'});
	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, [testString]);
	const {stdout, stderr, output} = await promise;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('promise[Symbol.asyncIterator] has no iterations if only options.stdout + options.stderr "ignore"', async t => {
	const promise = nanoSpawn(...nodePrintBoth, {stdout: 'ignore', stderr: 'ignore'});
	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, []);
	const {stdout, stderr, output} = await promise;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('promise.stdout has no iterations but waits for the subprocess if options.stdout "ignore"', async t => {
	const promise = nanoSpawn(...nodePrintBothFail, {stdout: 'ignore'});
	const error = await t.throwsAsync(arrayFromAsync(promise.stdout));
	assertFail(t, error);
	const promiseError = await t.throwsAsync(promise);
	t.is(promiseError, error);
	t.is(promiseError.stdout, '');
	t.is(promiseError.stderr, '');
	t.is(promiseError.output, '');
});

test('result.stdout is an empty string if options.stdout "ignore"', async t => {
	const {stdout, stderr, output} = await nanoSpawn(...nodePrintBoth, {stdout: 'ignore'});
	t.is(stdout, '');
	t.is(stderr, secondTestString);
	t.is(output, stderr);
});

test('result.stderr is an empty string if options.stderr "ignore"', async t => {
	const {stdout, stderr, output} = await nanoSpawn(...nodePrintBoth, {stderr: 'ignore'});
	t.is(stdout, testString);
	t.is(stderr, '');
	t.is(output, stdout);
});

test('result.output is an empty string if options.stdout and options.stderr "ignore"', async t => {
	const {stdout, stderr, output} = await nanoSpawn(...nodePrintBoth, {stdout: 'ignore', stderr: 'ignore'});
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

const testIterationLate = async (t, promiseType) => {
	const promise = nanoSpawn(...nodePrintStdout);
	await promise.nodeChildProcess;
	await t.throwsAsync(arrayFromAsync(getIterable(promise, promiseType)), {message: /must be iterated right away/});
};

test('promise.stdout must be called right away', testIterationLate, 'stdout');
test('promise.stderr must be called right away', testIterationLate, 'stderr');
test('promise[Symbol.asyncIterator] must be called right away', testIterationLate, '');

test('promise[Symbol.asyncIterator] is line-wise', async t => {
	const promise = nanoSpawn('node', ['--input-type=module', '-e', `
import {setTimeout} from 'node:timers/promises';

process.stdout.write("a\\nb\\n");
await setTimeout(0);
process.stderr.write("c\\nd\\n");`]);
	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, ['a', 'b', 'c', 'd']);
});

const testNewline = async (t, input, expectedOutput) => {
	const {stdout, output} = await nanoSpawn(...nodePrintNoNewline(input));
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

const testNewlineIteration = async (t, input, expectedLines) => {
	const promise = nanoSpawn(...nodePrintNoNewline(input));
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, expectedLines);
};

test('promise.stdout handles newline at the beginning', testNewlineIteration, '\na\nb', ['', 'a', 'b']);
test('promise.stdout handles newline in the middle', testNewlineIteration, 'a\nb', ['a', 'b']);
test('promise.stdout handles newline at the end', testNewlineIteration, 'a\nb\n', ['a', 'b']);
test('promise.stdout handles Windows newline at the beginning', testNewlineIteration, '\r\na\r\nb', ['', 'a', 'b']);
test('promise.stdout handles Windows newline in the middle', testNewlineIteration, 'a\r\nb', ['a', 'b']);
test('promise.stdout handles Windows newline at the end', testNewlineIteration, 'a\r\nb\r\n', ['a', 'b']);
test('promise.stdout handles 2 newlines at the beginning', testNewlineIteration, '\n\na\nb', ['', '', 'a', 'b']);
test('promise.stdout handles 2 newlines in the middle', testNewlineIteration, 'a\n\nb', ['a', '', 'b']);
test('promise.stdout handles 2 newlines at the end', testNewlineIteration, 'a\nb\n\n', ['a', 'b', '']);
test('promise.stdout handles 2 Windows newlines at the beginning', testNewlineIteration, '\r\n\r\na\r\nb', ['', '', 'a', 'b']);
test('promise.stdout handles 2 Windows newlines in the middle', testNewlineIteration, 'a\r\n\r\nb', ['a', '', 'b']);
test('promise.stdout handles 2 Windows newlines at the end', testNewlineIteration, 'a\r\nb\r\n\r\n', ['a', 'b', '']);

const multibyteString = '.\u{1F984}.';
const multibyteUint8Array = new TextEncoder().encode(multibyteString);
const multibyteFirstHalf = multibyteUint8Array.slice(0, 3);
const multibyteSecondHalf = multibyteUint8Array.slice(3);

const writeMultibyte = async promise => {
	const {stdin} = await promise.nodeChildProcess;
	stdin.write(multibyteFirstHalf);
	await setTimeout(1e2);
	stdin.end(multibyteSecondHalf);
};

test.serial('promise.stdout works with multibyte sequences', async t => {
	const promise = nanoSpawn(...nodePassThrough);
	writeMultibyte(promise);
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, [multibyteString]);
	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
});

test.serial('result.stdout works with multibyte sequences', async t => {
	const promise = nanoSpawn(...nodePassThrough);
	writeMultibyte(promise);
	const {stdout, output} = await promise;
	t.is(stdout, multibyteString);
	t.is(output, stdout);
});

const destroySubprocessStream = async ({nodeChildProcess}, error, streamName) => {
	const subprocess = await nodeChildProcess;
	subprocess[streamName].destroy(error);
};

const testStreamError = async (t, streamName) => {
	const promise = nanoSpawn(...nodePrintStdout);
	const cause = new Error(testString);
	destroySubprocessStream(promise, cause, streamName);
	const error = await t.throwsAsync(promise);
	assertErrorEvent(t, error, cause);
};

test('Handles subprocess.stdin error', testStreamError, 'stdin');
test('Handles subprocess.stdout error', testStreamError, 'stdout');
test('Handles subprocess.stderr error', testStreamError, 'stderr');

const testStreamIterateError = async (t, streamName) => {
	const promise = nanoSpawn(...nodePrintStdout);
	const cause = new Error(testString);
	destroySubprocessStream(promise, cause, streamName);
	const error = await t.throwsAsync(arrayFromAsync(promise[streamName]));
	assertErrorEvent(t, error, cause);
	const promiseError = await t.throwsAsync(promise);
	assertErrorEvent(t, promiseError, cause);
	t.is(promiseError[streamName], '');
	t.is(promiseError.output, '');
};

test('Handles promise.stdout error', testStreamIterateError, 'stdout');
test('Handles promise.stderr error', testStreamIterateError, 'stderr');

const testStreamIterateAllError = async (t, streamName) => {
	const promise = nanoSpawn(...nodePrintStdout);
	const cause = new Error(testString);
	destroySubprocessStream(promise, cause, streamName);
	const error = await t.throwsAsync(arrayFromAsync(promise));
	assertErrorEvent(t, error, cause);
	const promiseError = await t.throwsAsync(promise);
	assertErrorEvent(t, promiseError, cause);
	t.is(promiseError[streamName], '');
	t.is(promiseError.output, '');
};

test('Handles promise.stdout error in promise[Symbol.asyncIterator]', testStreamIterateAllError, 'stdout');
test('Handles promise.stderr error in promise[Symbol.asyncIterator]', testStreamIterateAllError, 'stderr');

// eslint-disable-next-line max-params
const iterateOnOutput = async (t, promise, state, cause, shouldThrow, promiseType) => {
	// eslint-disable-next-line no-unreachable-loop
	for await (const line of getIterable(promise, promiseType)) {
		t.is(line, testString);

		globalThis.setTimeout(async () => {
			const {stdin, stdout} = await promise.nodeChildProcess;
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

const testIteration = async (t, shouldThrow, promiseType) => {
	const promise = nanoSpawn(...nodePassThroughPrint);
	const state = {done: false};
	const cause = new Error(testString);

	try {
		await iterateOnOutput(t, promise, state, cause, shouldThrow, promiseType);
	} catch (error) {
		t.is(error, cause);
	}

	t.true(state.done);

	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
};

test.serial('promise.stdout iteration break waits for the subprocess success', testIteration, false, 'stdout');
test.serial('promise[Symbol.asyncIterator] iteration break waits for the subprocess success', testIteration, false, '');
test.serial('promise.stdout iteration exception waits for the subprocess success', testIteration, true, 'stdout');
test.serial('promise[Symbol.asyncIterator] iteration exception waits for the subprocess success', testIteration, true, '');

const testIterationFail = async (t, shouldThrow, promiseType) => {
	const promise = nanoSpawn(...nodePassThroughPrintFail);
	const state = {done: false};
	const cause = new Error(testString);
	let caughtError;

	try {
		await iterateOnOutput(t, promise, state, cause, shouldThrow, promiseType);
	} catch (error) {
		t.is(error === cause, shouldThrow);
		caughtError = error;
	}

	t.true(state.done);

	const promiseError = await t.throwsAsync(promise);
	assertFail(t, promiseError);
	t.is(promiseError === caughtError, !shouldThrow);
	t.is(promiseError.stdout, '');
	t.is(promiseError.output, '');
};

test.serial('promise.stdout iteration break waits for the subprocess failure', testIterationFail, false, 'stdout');
test.serial('promise[Symbol.asyncIterator] iteration break waits for the subprocess failure', testIterationFail, false, '');
test.serial('promise.stdout iteration exception waits for the subprocess failure', testIterationFail, true, 'stdout');
test.serial('promise[Symbol.asyncIterator] iteration exception waits for the subprocess failure', testIterationFail, true, '');

test('Returns a promise', async t => {
	const promise = nanoSpawn(...nodePrintStdout);
	t.false(Object.prototype.propertyIsEnumerable.call(promise, 'then'));
	t.false(Object.hasOwn(promise, 'then'));
	t.true(promise instanceof Promise);
	await promise;
});

test('promise.nodeChildProcess is set', async t => {
	const promise = nanoSpawn(...nodeHanging);
	const nodeChildProcess = await promise.nodeChildProcess;
	nodeChildProcess.kill();

	const error = await t.throwsAsync(promise);
	assertSigterm(t, error);
});

test('result.command does not quote normal arguments', async t => {
	const {command} = await nanoSpawn('node', ['--version']);
	t.is(command, 'node --version');
});

const testCommandEscaping = async (t, input, expectedCommand) => {
	const {command, stdout} = await nanoSpawn(...nodePrint(`"${input}"`));
	t.is(command, `node -p '"${expectedCommand}"'`);
	t.is(stdout, input);
};

test('result.command quotes spaces', testCommandEscaping, '. .', '. .');
test('result.command quotes single quotes', testCommandEscaping, '\'', '\'\\\'\'');
test('result.command quotes unusual characters', testCommandEscaping, ',', ',');
test('result.command strips ANSI sequences', testCommandEscaping, red(testString), testString);

test('result.durationMs is set', async t => {
	const {durationMs} = await nanoSpawn(...nodePrintStdout);
	assertDurationMs(t, durationMs);
});

test('error.durationMs is set', async t => {
	const {durationMs} = await t.throwsAsync(nanoSpawn('node', ['--unknown']));
	assertDurationMs(t, durationMs);
});

if (isWindows) {
	test('Current OS uses node.exe', t => {
		t.true(process.execPath.endsWith('\\node.exe'));
	});

	const testExe = async (t, shell) => {
		const {stdout} = await nanoSpawn(process.execPath, ['--version'], {shell});
		t.is(stdout, process.version);
	};

	test('Can run .exe file', testExe, undefined);
	test('Can run .exe file, no shell', testExe, false);
	test('Can run .exe file, shell', testExe, true);

	test('.exe does not use shell by default', async t => {
		const {stdout} = await nanoSpawn(...nodePrintArgv0, {argv0: testString});
		t.is(stdout, testString);
	});

	test('.exe can use shell', async t => {
		const {stdout} = await nanoSpawn(...nodePrintArgv0, {argv0: testString, shell: true});
		t.is(stdout, process.execPath);
	});

	const testExeDetection = async (t, execPath) => {
		const {stdout} = await nanoSpawn(execPath, ['-p', 'process.argv0'], {argv0: testString});
		t.is(stdout, testString);
	};

	test('.exe detection with explicit file extension', testExeDetection, process.execPath);
	test('.exe detection with explicit file extension, case insensitive', testExeDetection, process.execPath.toUpperCase());
	test('.exe detection with file paths without file extension', testExeDetection, process.execPath.replace('.exe', ''));
	test('.exe detection with Unix slashes', testExeDetection, process.execPath.replace('\\node.exe', '/node.exe'));

	const testPathValue = async (t, pathValue) => {
		const {stdout} = await nanoSpawn(...nodePrintArgv0, {argv0: testString, env: {[pathKey()]: pathValue}});
		t.is(stdout, testString);
	};

	test('.exe detection with custom Path', testPathValue, nodeDirectory);
	test('.exe detection with custom Path and leading ;', testPathValue, `;${nodeDirectory}`);
	test('.exe detection with custom Path and double quoting', testPathValue, `"${nodeDirectory}"`);

	const testCom = async (t, shell) => {
		const {stdout} = await nanoSpawn('tree.com', [fileURLToPath(FIXTURES_URL), '/f'], {shell});
		t.true(stdout.includes('spawnecho.cmd'));
	};

	test('Can run .com file', testCom, undefined);
	test('Can run .com file, no shell', testCom, false);
	test('Can run .com file, shell', testCom, true);

	const testCmd = async (t, shell) => {
		const {stdout} = await nanoSpawn('spawnecho.cmd', [testString], {cwd: FIXTURES_URL, shell});
		t.is(stdout, testString);
	};

	test('Can run .cmd file', testCmd, undefined);
	test('Can run .cmd file, no shell', testCmd, false);
	test('Can run .cmd file, shell', testCmd, true);

	test('Memoize .cmd file logic', async t => {
		await nanoSpawn('spawnecho.cmd', [testString], {cwd: FIXTURES_URL});
		const {stdout} = await nanoSpawn('spawnecho.cmd', [testString], {cwd: FIXTURES_URL});
		t.is(stdout, testString);
	});

	test('Uses PATHEXT by default', async t => {
		const {stdout} = await nanoSpawn('spawnecho', [testString], {cwd: FIXTURES_URL});
		t.is(stdout, testString);
	});

	test('Uses cwd as string', async t => {
		const {stdout} = await nanoSpawn('spawnecho', [testString], {cwd: fixturesPath});
		t.is(stdout, testString);
	});

	const testPathExtension = async (t, shell) => {
		const error = await t.throwsAsync(nanoSpawn('spawnecho', [testString], {
			env: {PATHEXT: '.COM'},
			cwd: FIXTURES_URL,
			shell,
		}));
		assertWindowsNonExistent(t, error, `spawnecho ${testString}`);
	};

	test('Can set PATHEXT', testPathExtension, undefined);
	test('Can set PATHEXT, no shell', testPathExtension, false);
	test('Can set PATHEXT, shell', testPathExtension, true);

	test('Escapes file when setting shell option', async t => {
		const file = '()[]%0!`';
		const {stdout} = await nanoSpawn(file, {cwd: FIXTURES_URL});
		t.is(stdout, `${file}\r\n${file}`);
	});

	const testEscape = async (t, input) => {
		const {stdout} = await nanoSpawn('spawnecho', [input], {cwd: FIXTURES_URL});
		t.is(stdout, input);
	};

	test('Escapes argument when setting shell option, "', testEscape, '"');
	test('Escapes argument when setting shell option, \\', testEscape, '\\');
	test('Escapes argument when setting shell option, \\.', testEscape, '\\.');
	test('Escapes argument when setting shell option, \\"', testEscape, '\\"');
	test('Escapes argument when setting shell option, \\\\"', testEscape, '\\\\"');
	test('Escapes argument when setting shell option, a b', testEscape, 'a b');
	test('Escapes argument when setting shell option, \'.\'', testEscape, '\'.\'');
	test('Escapes argument when setting shell option, "."', testEscape, '"."');
	test('Escapes argument when setting shell option, (', testEscape, '(');
	test('Escapes argument when setting shell option, )', testEscape, ')');
	test('Escapes argument when setting shell option, ]', testEscape, ']');
	test('Escapes argument when setting shell option, [', testEscape, '[');
	test('Escapes argument when setting shell option, %', testEscape, '%');
	test('Escapes argument when setting shell option, !', testEscape, '!');
	test('Escapes argument when setting shell option, ^', testEscape, '^');
	test('Escapes argument when setting shell option, `', testEscape, '`');
	test('Escapes argument when setting shell option, <', testEscape, '<');
	test('Escapes argument when setting shell option, >', testEscape, '>');
	test('Escapes argument when setting shell option, &', testEscape, '&');
	test('Escapes argument when setting shell option, |', testEscape, '|');
	test('Escapes argument when setting shell option, ;', testEscape, ';');
	test('Escapes argument when setting shell option, ,', testEscape, ',');
	test('Escapes argument when setting shell option, space', testEscape, ' ');
	test('Escapes argument when setting shell option, *', testEscape, '*');
	test('Escapes argument when setting shell option, ?', testEscape, '?');
	test('Escapes argument when setting shell option, é', testEscape, 'é');
	test('Escapes argument when setting shell option, empty', testEscape, '');
	test('Escapes argument when setting shell option, ()', testEscape, '()');
	test('Escapes argument when setting shell option, []', testEscape, '[]');
	test('Escapes argument when setting shell option, %1', testEscape, '%1');
	test('Escapes argument when setting shell option, %*', testEscape, '%*');
	test('Escapes argument when setting shell option, %!', testEscape, '%!');
	test('Escapes argument when setting shell option, %CD%', testEscape, '%CD%');
	test('Escapes argument when setting shell option, ^<', testEscape, '^<');
	test('Escapes argument when setting shell option, >&', testEscape, '>&');
	test('Escapes argument when setting shell option, |;', testEscape, '|;');
	test('Escapes argument when setting shell option, , space', testEscape, ', ');
	test('Escapes argument when setting shell option, !=', testEscape, '!=');
	test('Escapes argument when setting shell option, \\*', testEscape, '\\*');
	test('Escapes argument when setting shell option, ?.', testEscape, '?.');
	test('Escapes argument when setting shell option, =`', testEscape, '=`');
	test('Escapes argument when setting shell option, --help 0', testEscape, '--help 0');
	test('Escapes argument when setting shell option, "a b"', testEscape, '"a b"');
	test('Escapes argument when setting shell option, "foo|bar>baz"', testEscape, '"foo|bar>baz"');
	test('Escapes argument when setting shell option, "(foo|bar>baz|foz)"', testEscape, '"(foo|bar>baz|foz)"');

	test('Cannot run shebangs', async t => {
		const error = await t.throwsAsync(nanoSpawn('./shebang.js', {cwd: FIXTURES_URL}));
		assertWindowsNonExistent(t, error, './shebang.js');
	});
} else {
	test('Can run shebangs', async t => {
		const {stdout} = await nanoSpawn('./shebang.js', {cwd: FIXTURES_URL});
		t.is(stdout, testString);
	});
}

test('Can run Bash', async t => {
	const {stdout} = await nanoSpawn(`echo ${testString}`, {cwd: FIXTURES_URL, shell: 'bash'});
	t.is(stdout, testString);
});

test('Does not double escape shell strings', async t => {
	const {stdout} = await nanoSpawn('node -p "0"', {shell: true});
	t.is(stdout, '0');
});

test('Handles non-existing command', async t => {
	const error = await t.throwsAsync(nanoSpawn(nonExistentCommand));

	if (isWindows) {
		assertWindowsNonExistent(t, error);
	} else {
		assertNonExistent(t, error);
	}
});

test('Handles non-existing command, shell', async t => {
	const error = await t.throwsAsync(nanoSpawn(nonExistentCommand, {shell: true}));

	if (isWindows) {
		assertWindowsNonExistent(t, error);
	} else {
		assertUnixNonExistentShell(t, error);
	}
});

test('Can run global npm binaries', async t => {
	const {stdout} = await nanoSpawn('npm', ['--version']);
	t.regex(stdout, VERSION_REGEXP);
});

const testLocalBinaryExec = async (t, cwd) => {
	const {stdout} = await nanoSpawn(...localBinary, {preferLocal: true, cwd});
	t.regex(stdout, VERSION_REGEXP);
};

test('options.preferLocal true runs local npm binaries', testLocalBinaryExec, undefined);
test('options.preferLocal true runs local npm binaries with options.cwd string', testLocalBinaryExec, fixturesPath);
test('options.preferLocal true runs local npm binaries with options.cwd URL', testLocalBinaryExec, FIXTURES_URL);

const testPathVariable = async (t, pathName) => {
	const {stdout} = await nanoSpawn(...localBinary, {preferLocal: true, env: {PATH: undefined, Path: undefined, [pathName]: isWindows ? process.env[pathKey()] : nodeDirectory}});
	t.regex(stdout, VERSION_REGEXP);
};

test('options.preferLocal true uses options.env.PATH when set', testPathVariable, 'PATH');
test('options.preferLocal true uses options.env.Path when set', testPathVariable, 'Path');

const testNoLocal = async (t, preferLocal) => {
	const PATH = process.env[pathKey()]
		.split(path.delimiter)
		.filter(pathPart => !pathPart.includes(path.join('node_modules', '.bin')))
		.join(path.delimiter);
	const error = await t.throwsAsync(nanoSpawn(...localBinary, {preferLocal, env: {Path: undefined, PATH}}));
	if (isWindows) {
		assertWindowsNonExistent(t, error, localBinaryCommand);
	} else {
		assertNonExistent(t, error, localBinaryCommandStart, localBinaryCommand);
	}
};

test('options.preferLocal undefined does not run local npm binaries', testNoLocal, undefined);
test('options.preferLocal false does not run local npm binaries', testNoLocal, false);

test('options.preferLocal true uses options.env when empty', async t => {
	const error = await t.throwsAsync(nanoSpawn(...localBinary, {preferLocal: true, env: {PATH: undefined, Path: undefined}}));
	if (isWindows) {
		assertNonExistent(t, error, 'cmd.exe', localBinaryCommand);
	} else {
		assertUnixNotFound(t, error, localBinaryCommand);
	}
});

test('options.preferLocal true does not add node_modules/.bin if already present', async t => {
	const localDirectory = fileURLToPath(new URL('node_modules/.bin', import.meta.url));
	const currentPath = process.env[pathKey()];
	const pathValue = `${localDirectory}${path.delimiter}${currentPath}`;
	const {stdout} = await nanoSpawn(...nodePrint(`process.env.${pathKey()}`), {preferLocal: true, env: {[pathKey()]: pathValue}});
	t.is(
		stdout.split(path.delimiter).filter(pathPart => pathPart === localDirectory).length
		- currentPath.split(path.delimiter).filter(pathPart => pathPart === localDirectory).length,
		1,
	);
});

const testLocalBinary = async (t, input) => {
	const {stderr} = await nanoSpawn('ava', ['test.js', '--', input], {preferLocal: true, cwd: FIXTURES_URL});
	t.is(stderr, input);
};

test('options.preferLocal true can pass arguments to local npm binaries, "', testLocalBinary, '"');
test('options.preferLocal true can pass arguments to local npm binaries, \\', testLocalBinary, '\\');
test('options.preferLocal true can pass arguments to local npm binaries, \\.', testLocalBinary, '\\.');
test('options.preferLocal true can pass arguments to local npm binaries, \\"', testLocalBinary, '\\"');
test('options.preferLocal true can pass arguments to local npm binaries, \\\\"', testLocalBinary, '\\\\"');
test('options.preferLocal true can pass arguments to local npm binaries, a b', testLocalBinary, 'a b');
test('options.preferLocal true can pass arguments to local npm binaries, \'.\'', testLocalBinary, '\'.\'');
test('options.preferLocal true can pass arguments to local npm binaries, "."', testLocalBinary, '"."');
test('options.preferLocal true can pass arguments to local npm binaries, (', testLocalBinary, '(');
test('options.preferLocal true can pass arguments to local npm binaries, )', testLocalBinary, ')');
test('options.preferLocal true can pass arguments to local npm binaries, ]', testLocalBinary, ']');
test('options.preferLocal true can pass arguments to local npm binaries, [', testLocalBinary, '[');
test('options.preferLocal true can pass arguments to local npm binaries, %', testLocalBinary, '%');
test('options.preferLocal true can pass arguments to local npm binaries, %1', testLocalBinary, '%1');
test('options.preferLocal true can pass arguments to local npm binaries, !', testLocalBinary, '!');
test('options.preferLocal true can pass arguments to local npm binaries, ^', testLocalBinary, '^');
test('options.preferLocal true can pass arguments to local npm binaries, `', testLocalBinary, '`');
test('options.preferLocal true can pass arguments to local npm binaries, <', testLocalBinary, '<');
test('options.preferLocal true can pass arguments to local npm binaries, >', testLocalBinary, '>');
test('options.preferLocal true can pass arguments to local npm binaries, &', testLocalBinary, '&');
test('options.preferLocal true can pass arguments to local npm binaries, |', testLocalBinary, '|');
test('options.preferLocal true can pass arguments to local npm binaries, ;', testLocalBinary, ';');
test('options.preferLocal true can pass arguments to local npm binaries, ,', testLocalBinary, ',');
test('options.preferLocal true can pass arguments to local npm binaries, space', testLocalBinary, ' ');
test('options.preferLocal true can pass arguments to local npm binaries, *', testLocalBinary, '*');
test('options.preferLocal true can pass arguments to local npm binaries, ?', testLocalBinary, '?');

test('Can run OS binaries', async t => {
	const {stdout} = await nanoSpawn('git', ['--version']);
	t.regex(stdout, /^git version \d+\.\d+\.\d+/);
});

const nodeCliFlag = '--jitless';
const inspectCliFlag = '--inspect-port=8091';

const testNodeFlags = async (t, binaryName, fixtureName, hasFlag) => {
	const {stdout} = await nanoSpawn(binaryName, [nodeCliFlag, fixtureName], {cwd: FIXTURES_URL});
	t.is(stdout.includes(nodeCliFlag), hasFlag);
};

test('Keeps Node flags', testNodeFlags, 'node', 'node-flags.js', true);
test('Does not keep Node flags, full path', testNodeFlags, 'node', 'node-flags-path.js', false);

if (isWindows) {
	test('Keeps Node flags, node.exe', testNodeFlags, 'node.exe', 'node-flags.js', true);
	test('Keeps Node flags, case-insensitive', testNodeFlags, 'NODE', 'node-flags.js', true);
}

test('Does not keep --inspect* Node flags', async t => {
	const {stdout} = await nanoSpawn('node', [nodeCliFlag, inspectCliFlag, 'node-flags.js'], {cwd: FIXTURES_URL});
	t.true(stdout.includes(nodeCliFlag));
	t.false(stdout.includes(inspectCliFlag));
});

const TEST_NODE_VERSION = '18.0.0';

test.serial('Keeps Node version', async t => {
	const {path: nodePath} = await getNode(TEST_NODE_VERSION);
	t.not(nodePath, process.execPath);
	const {stdout} = await nanoSpawn(nodePath, ['node-version.js'], {cwd: FIXTURES_URL});
	t.is(stdout, `v${TEST_NODE_VERSION}`);
});

test('.pipe() success', async t => {
	const {stdout, output, command, durationMs} = await nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	t.is(stdout, testUpperCase);
	t.is(output, stdout);
	t.is(getPipeSize(command), 2);
	assertDurationMs(t, durationMs);
});

test('.pipe() source fails', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodePrintFail).pipe(...nodeToUpperCase));
	assertFail(t, error);
	t.is(error.stdout, testString);
	t.is(error.output, error.stdout);
	t.is(getPipeSize(error.command), 1);
});

test('.pipe() source fails due to child_process invalid option', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodePrintStdout, earlyErrorOptions).pipe(...nodeToUpperCase));
	assertEarlyError(t, error);
	t.is(getPipeSize(error.command), 1);
});

test('.pipe() source fails due to stream error', async t => {
	const first = nanoSpawn(...nodePrintStdout);
	const second = first.pipe(...nodeToUpperCase);
	const cause = new Error(testString);
	const subprocess = await first.nodeChildProcess;
	subprocess.stdout.destroy(cause);
	const error = await t.throwsAsync(second);
	assertErrorEvent(t, error, cause);
});

test('.pipe() destination fails', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCaseFail));
	assertFail(t, error);
	t.is(error.stdout, testUpperCase);
	t.is(getPipeSize(error.command), 2);
});

test('.pipe() destination fails due to child_process invalid option', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCase, earlyErrorOptions));
	assertEarlyError(t, error);
	t.is(getPipeSize(error.command), 2);
});

test('.pipe() destination fails due to stream error', async t => {
	const first = nanoSpawn(...nodePrintStdout);
	const second = first.pipe(...nodeToUpperCase);
	const cause = new Error(testString);
	const subprocess = await second.nodeChildProcess;
	subprocess.stdin.destroy(cause);
	const error = await t.throwsAsync(second);
	assertErrorEvent(t, error, cause);
});

test('.pipe() source and destination fail', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodePrintFail).pipe(...nodeToUpperCaseFail));
	assertFail(t, error);
	t.is(error.stdout, testString);
	t.is(getPipeSize(error.command), 1);
});

test('.pipe().pipe() success', async t => {
	const first = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const secondResult = await first.pipe(...nodeDouble);
	const firstResult = await first;
	t.is(firstResult.stdout, testUpperCase);
	t.is(firstResult.output, firstResult.stdout);
	t.is(secondResult.stdout, testDoubleUpperCase);
	t.is(secondResult.output, secondResult.stdout);
	t.is(getPipeSize(firstResult.command), 2);
	t.is(getPipeSize(secondResult.command), 3);
	assertDurationMs(t, firstResult.durationMs);
	t.true(secondResult.durationMs > firstResult.durationMs);
});

test('.pipe().pipe() first source fail', async t => {
	const first = nanoSpawn(...nodePrintFail).pipe(...nodeToUpperCase);
	const secondError = await t.throwsAsync(first.pipe(...nodeDouble));
	const firstError = await t.throwsAsync(first);
	assertFail(t, firstError);
	t.is(firstError, secondError);
	t.is(firstError.stdout, testString);
	t.is(firstError.output, firstError.stdout);
	t.is(getPipeSize(firstError.command), 1);
});

test('.pipe().pipe() second source fail', async t => {
	const first = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCaseFail);
	const secondError = await t.throwsAsync(first.pipe(...nodeDouble));
	const firstError = await t.throwsAsync(first);
	assertFail(t, firstError);
	t.is(firstError, secondError);
	t.is(firstError.stdout, testUpperCase);
	t.is(firstError.output, firstError.stdout);
	t.is(getPipeSize(firstError.command), 2);
});

test('.pipe().pipe() destination fail', async t => {
	const first = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const secondError = await t.throwsAsync(first.pipe(...nodeDoubleFail));
	const firstResult = await first;
	assertFail(t, secondError);
	t.is(firstResult.stdout, testUpperCase);
	t.is(firstResult.output, firstResult.stdout);
	t.is(secondError.stdout, testDoubleUpperCase);
	t.is(secondError.output, secondError.stdout);
	t.is(getPipeSize(firstResult.command), 2);
	t.is(getPipeSize(secondError.command), 3);
	assertDurationMs(t, firstResult.durationMs);
});

test('.pipe().pipe() all fail', async t => {
	const first = nanoSpawn(...nodePrintFail).pipe(...nodeToUpperCaseFail);
	const secondError = await t.throwsAsync(first.pipe(...nodeDoubleFail));
	const firstError = await t.throwsAsync(first);
	assertFail(t, firstError);
	t.is(firstError, secondError);
	t.is(firstError.stdout, testString);
	t.is(firstError.output, firstError.stdout);
	t.is(getPipeSize(firstError.command), 1);
});

// Cannot guarantee that `cat` exists on Windows
if (!isWindows) {
	test('.pipe() without arguments', async t => {
		const {stdout} = await nanoSpawn(...nodePrintStdout).pipe('cat');
		t.is(stdout, testString);
	});
}

test('.pipe() with options', async t => {
	const argv0 = 'Foo';
	const {stdout} = await nanoSpawn(...nodePrintStdout).pipe(...nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim() + process.argv0);
});`), {argv0});
	t.is(stdout, `${testString}${argv0}`);
});

test.serial('.pipe() which does not read stdin, source ends first', async t => {
	const {stdout, output} = await nanoSpawn(...nodePrintStdout).pipe(...nodePrintSleep);
	t.is(stdout, testString);
	t.is(output, stdout);
});

test.serial('.pipe() which does not read stdin, source fails first', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodePrintFail).pipe(...nodePrintSleep));
	assertFail(t, error);
	t.is(error.stdout, testString);
	t.is(error.output, error.stdout);
});

test.serial('.pipe() which does not read stdin, source ends last', async t => {
	const {stdout, output} = await nanoSpawn(...nodePrintSleep).pipe(...nodePrintStdout);
	t.is(stdout, testString);
	t.is(output, stdout);
});

test.serial('.pipe() which does not read stdin, source fails last', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodePrintStdout).pipe(...nodePrintSleepFail));
	assertFail(t, error);
	t.is(error.stdout, testString);
	t.is(error.output, error.stdout);
});

test('.pipe() which has hanging stdin', async t => {
	const error = await t.throwsAsync(nanoSpawn(...nodeHanging, {timeout: 1e3}).pipe(...nodePassThrough));
	assertSigterm(t, error);
	t.is(error.stdout, '');
	t.is(error.output, '');
});

test('.pipe() with stdin stream in source', async t => {
	const stream = createReadStream(testFixtureUrl);
	await once(stream, 'open');
	const {stdout} = await nanoSpawn(...nodePassThrough, {stdin: stream}).pipe(...nodeToUpperCase);
	t.is(stdout, testUpperCase);
});

test('.pipe() with stdin stream in destination', async t => {
	const stream = createReadStream(testFixtureUrl);
	await once(stream, 'open');
	await t.throwsAsync(
		nanoSpawn(...nodePassThrough).pipe(...nodeToUpperCase, {stdin: stream}),
		{message: 'The "stdin" option must be set on the first "nanoSpawn()" call in the pipeline.'});
});

test('.pipe() with stdout stream in destination', async t => {
	await temporaryWriteTask('', async temporaryPath => {
		const stream = createWriteStream(temporaryPath);
		await once(stream, 'open');
		const {stdout} = await nanoSpawn(...nodePrintStdout).pipe(...nodePassThrough, {stdout: stream});
		t.is(stdout, '');
		t.is(await readFile(temporaryPath, 'utf8'), `${testString}\n`);
	});
});

test('.pipe() with stdout stream in source', async t => {
	await temporaryWriteTask('', async temporaryPath => {
		const stream = createWriteStream(temporaryPath);
		await once(stream, 'open');
		await t.throwsAsync(
			nanoSpawn(...nodePrintStdout, {stdout: stream}).pipe(...nodePassThrough),
			{message: 'The "stdout" option must be set on the last "nanoSpawn()" call in the pipeline.'},
		);
	});
});

test('.pipe() + stdout/stderr iteration', async t => {
	const promise = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, [testUpperCase]);
	const {stdout, stderr, output} = await promise;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('.pipe() + stdout iteration', async t => {
	const promise = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, [testUpperCase]);
	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
});

test('.pipe() + stderr iteration', async t => {
	const promise = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCaseStderr);
	const lines = await arrayFromAsync(promise.stderr);
	t.deepEqual(lines, [testUpperCase]);
	const {stderr, output} = await promise;
	t.is(stderr, '');
	t.is(output, '');
});

test('.pipe() + stdout iteration, source fail', async t => {
	const promise = nanoSpawn(...nodePrintFail).pipe(...nodeToUpperCase);
	const error = await t.throwsAsync(arrayFromAsync(promise.stdout));
	assertFail(t, error);
	t.is(error.stdout, testString);
	const secondError = await t.throwsAsync(promise);
	t.is(secondError.stdout, testString);
	t.is(secondError.output, secondError.stdout);
});

test('.pipe() + stdout iteration, destination fail', async t => {
	const promise = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCaseFail);
	const error = await t.throwsAsync(arrayFromAsync(promise.stdout));
	assertFail(t, error);
	t.is(error.stdout, '');
	const secondError = await t.throwsAsync(promise);
	t.is(secondError.stdout, '');
	t.is(secondError.output, '');
});

test('.pipe() with EPIPE', async t => {
	const promise = nanoSpawn(...nodeEval(`setInterval(() => {
	console.log("${testString}");
}, 0);
process.stdout.on("error", () => {
	process.exit();
});`)).pipe('head', ['-n', '2']);
	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, [testString, testString]);
	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
});
