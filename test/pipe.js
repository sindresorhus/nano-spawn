import {createReadStream, createWriteStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {temporaryWriteTask} from 'tempy';
import test from 'ava';
import nanoSpawn from '../source/index.js';
import {
	isWindows,
	FIXTURES_URL,
	earlyErrorOptions,
	arrayFromAsync,
} from './helpers/main.js';
import {
	testString,
	testUpperCase,
	testDoubleUpperCase,
} from './helpers/arguments.js';
import {
	assertDurationMs,
	assertFail,
	assertEarlyError,
	assertErrorEvent,
	assertSigterm,
} from './helpers/assert.js';
import {
	nodeEval,
	nodePrintStdout,
	nodePassThrough,
	nodeToUpperCase,
	nodeToUpperCaseFail,
	nodeToUpperCaseStderr,
	nodePrintFail,
	nodeDouble,
	nodeDoubleFail,
	nodePrintSleep,
	nodePrintSleepFail,
	nodeHanging,
} from './helpers/commands.js';

const testFixtureUrl = new URL('test.txt', FIXTURES_URL);

const getPipeSize = command => command.split(' | ').length;

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
	const nodeChildProcess = await first.nodeChildProcess;
	nodeChildProcess.stdout.destroy(cause);
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
	const nodeChildProcess = await second.nodeChildProcess;
	nodeChildProcess.stdin.destroy(cause);
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
	const subprocess = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const lines = await arrayFromAsync(subprocess);
	t.deepEqual(lines, [testUpperCase]);
	const {stdout, stderr, output} = await subprocess;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('.pipe() + stdout iteration', async t => {
	const subprocess = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const lines = await arrayFromAsync(subprocess.stdout);
	t.deepEqual(lines, [testUpperCase]);
	const {stdout, output} = await subprocess;
	t.is(stdout, '');
	t.is(output, '');
});

test('.pipe() + stderr iteration', async t => {
	const subprocess = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCaseStderr);
	const lines = await arrayFromAsync(subprocess.stderr);
	t.deepEqual(lines, [testUpperCase]);
	const {stderr, output} = await subprocess;
	t.is(stderr, '');
	t.is(output, '');
});

test('.pipe() + stdout iteration, source fail', async t => {
	const subprocess = nanoSpawn(...nodePrintFail).pipe(...nodeToUpperCase);
	const error = await t.throwsAsync(arrayFromAsync(subprocess.stdout));
	assertFail(t, error);
	t.is(error.stdout, testString);
	const secondError = await t.throwsAsync(subprocess);
	t.is(secondError.stdout, testString);
	t.is(secondError.output, secondError.stdout);
});

test('.pipe() + stdout iteration, destination fail', async t => {
	const subprocess = nanoSpawn(...nodePrintStdout).pipe(...nodeToUpperCaseFail);
	const error = await t.throwsAsync(arrayFromAsync(subprocess.stdout));
	assertFail(t, error);
	t.is(error.stdout, '');
	const secondError = await t.throwsAsync(subprocess);
	t.is(secondError.stdout, '');
	t.is(secondError.output, '');
});

test('.pipe() with EPIPE', async t => {
	const subprocess = nanoSpawn(...nodeEval(`setInterval(() => {
	console.log("${testString}");
}, 0);
process.stdout.on("error", () => {
	process.exit();
});`)).pipe('head', ['-n', '2']);
	const lines = await arrayFromAsync(subprocess);
	t.deepEqual(lines, [testString, testString]);
	const {stdout, output} = await subprocess;
	t.is(stdout, '');
	t.is(output, '');
});
