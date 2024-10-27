import {createReadStream, createWriteStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {temporaryWriteTask} from 'tempy';
import test from 'ava';
import spawn from '../source/index.js';
import {
	isWindows,
	FIXTURES_URL,
	earlyErrorOptions,
	arrayFromAsync,
	NODE_VERSION,
} from './helpers/main.js';
import {
	testString,
	testUpperCase,
	testDoubleUpperCase,
	testDouble,
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

test('.pipe() success', async t => {
	const first = spawn(...nodePrintStdout);
	const {stdout, output, durationMs, pipedFrom} = await first.pipe(...nodeToUpperCase);
	const firstResult = await first;
	t.is(firstResult.pipedFrom, undefined);
	t.is(pipedFrom, firstResult);
	t.is(stdout, testUpperCase);
	t.is(output, stdout);
	assertDurationMs(t, durationMs);
});

test('.pipe() source fails', async t => {
	const first = spawn(...nodePrintFail);
	const secondError = await t.throwsAsync(first.pipe(...nodeToUpperCase));
	const firstError = await t.throwsAsync(first);
	t.is(firstError, secondError);
	t.is(secondError.pipedFrom, undefined);
	assertFail(t, secondError);
	t.is(secondError.stdout, testString);
	t.is(secondError.output, secondError.stdout);
});

test('.pipe() source fails due to child_process invalid option', async t => {
	const first = spawn(...nodePrintStdout, earlyErrorOptions);
	const secondError = await t.throwsAsync(first.pipe(...nodeToUpperCase));
	const firstError = await t.throwsAsync(first);
	assertEarlyError(t, secondError);
	t.is(firstError, secondError);
	t.is(secondError.pipedFrom, undefined);
});

test('.pipe() source fails due to stream error', async t => {
	const first = spawn(...nodePrintStdout);
	const second = first.pipe(...nodeToUpperCase);
	const cause = new Error(testString);
	const nodeChildProcess = await first.nodeChildProcess;
	nodeChildProcess.stdout.destroy(cause);
	const secondError = await t.throwsAsync(second);
	const firstError = await t.throwsAsync(first);
	assertErrorEvent(t, secondError, cause);
	assertErrorEvent(t, firstError, cause);
	t.is(firstError.pipedFrom, undefined);
	t.is(secondError.pipedFrom, firstError);
});

test('.pipe() destination fails', async t => {
	const first = spawn(...nodePrintStdout);
	const secondError = await t.throwsAsync(first.pipe(...nodeToUpperCaseFail));
	const firstResult = await first;
	assertFail(t, secondError);
	t.is(firstResult.pipedFrom, undefined);
	t.is(secondError.pipedFrom, firstResult);
	t.is(firstResult.stdout, testString);
	t.is(secondError.stdout, testUpperCase);
});

test('.pipe() destination fails due to child_process invalid option', async t => {
	const first = spawn(...nodePrintStdout);
	const secondError = await t.throwsAsync(first.pipe(...nodeToUpperCase, earlyErrorOptions));
	const firstResult = await first;
	assertEarlyError(t, secondError);
	t.is(firstResult.pipedFrom, undefined);
	t.is(secondError.pipedFrom, undefined);
	t.is(firstResult.stdout, testString);
});

test('.pipe() destination fails due to stream error', async t => {
	const first = spawn(...nodePrintStdout);
	const second = first.pipe(...nodeToUpperCase);
	const cause = new Error(testString);
	const nodeChildProcess = await second.nodeChildProcess;
	nodeChildProcess.stdin.destroy(cause);
	const secondError = await t.throwsAsync(second);
	assertErrorEvent(t, secondError, cause);

	// Node 23 changed the behavior of `stream.pipeline()`
	if (NODE_VERSION >= 23) {
		const firstResult = await first;
		t.is(firstResult.stdout, testString);
		t.is(firstResult.pipedFrom, undefined);
		t.is(secondError.pipedFrom, firstResult);
	} else {
		const firstError = await t.throwsAsync(first);
		assertErrorEvent(t, firstError, cause);
		t.is(firstError.pipedFrom, undefined);
		t.is(secondError.pipedFrom, firstError);
	}
});

test('.pipe() source and destination fail', async t => {
	const first = spawn(...nodePrintFail);
	const secondError = await t.throwsAsync(first.pipe(...nodeToUpperCaseFail));
	const firstError = await t.throwsAsync(first);
	assertFail(t, firstError);
	assertFail(t, secondError);
	t.is(firstError.pipedFrom, undefined);
	t.is(secondError.pipedFrom, firstError);
	t.is(firstError.stdout, testString);
	t.is(firstError.output, firstError.stdout);
	t.is(secondError.stdout, testUpperCase);
	t.is(secondError.output, secondError.stdout);
});

test('.pipe().pipe() success', async t => {
	const first = spawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const secondResult = await first.pipe(...nodeDouble);
	const firstResult = await first;
	t.is(firstResult.stdout, testUpperCase);
	t.is(firstResult.output, firstResult.stdout);
	t.is(secondResult.stdout, testDoubleUpperCase);
	t.is(secondResult.output, secondResult.stdout);
	assertDurationMs(t, firstResult.durationMs);
});

test('.pipe().pipe() first source fail', async t => {
	const first = spawn(...nodePrintFail).pipe(...nodeToUpperCase);
	const secondError = await t.throwsAsync(first.pipe(...nodeDouble));
	const firstError = await t.throwsAsync(first);
	assertFail(t, firstError);
	t.is(firstError, secondError);
	t.is(firstError.stdout, testString);
	t.is(firstError.output, firstError.stdout);
});

test('.pipe().pipe() second source fail', async t => {
	const first = spawn(...nodePrintStdout).pipe(...nodeToUpperCaseFail);
	const secondError = await t.throwsAsync(first.pipe(...nodeDouble));
	const firstError = await t.throwsAsync(first);
	assertFail(t, firstError);
	t.is(firstError, secondError);
	t.is(firstError.stdout, testUpperCase);
	t.is(firstError.output, firstError.stdout);
});

test('.pipe().pipe() destination fail', async t => {
	const first = spawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const secondError = await t.throwsAsync(first.pipe(...nodeDoubleFail));
	const firstResult = await first;
	assertFail(t, secondError);
	t.is(firstResult.stdout, testUpperCase);
	t.is(firstResult.output, firstResult.stdout);
	t.is(secondError.stdout, testDoubleUpperCase);
	t.is(secondError.output, secondError.stdout);
	assertDurationMs(t, firstResult.durationMs);
});

test('.pipe().pipe() all fail', async t => {
	const first = spawn(...nodePrintFail).pipe(...nodeToUpperCaseFail);
	const secondError = await t.throwsAsync(first.pipe(...nodeDoubleFail));
	const firstError = await t.throwsAsync(first);
	assertFail(t, firstError);
	assertFail(t, secondError);
	t.is(secondError.pipedFrom, firstError);
	t.is(firstError.stdout, testUpperCase);
	t.is(firstError.output, firstError.stdout);
	t.is(secondError.stdout, testDoubleUpperCase);
	t.is(secondError.output, secondError.stdout);
});

// Cannot guarantee that `cat` exists on Windows
if (!isWindows) {
	test('.pipe() without arguments', async t => {
		const {stdout} = await spawn(...nodePrintStdout).pipe('cat');
		t.is(stdout, testString);
	});
}

test('.pipe() with options', async t => {
	const argv0 = 'Foo';
	const {stdout} = await spawn(...nodePrintStdout).pipe(...nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim() + process.argv0);
});`), {argv0});
	t.is(stdout, `${testString}${argv0}`);
});

test.serial('.pipe() which does not read stdin, source ends first', async t => {
	const {stdout, output} = await spawn(...nodePrintStdout).pipe(...nodePrintSleep);
	t.is(stdout, testString);
	t.is(output, stdout);
});

test.serial('.pipe() which does not read stdin, source fails first', async t => {
	const error = await t.throwsAsync(spawn(...nodePrintFail).pipe(...nodePrintSleep));
	assertFail(t, error);
	t.is(error.stdout, testString);
	t.is(error.output, error.stdout);
});

test.serial('.pipe() which does not read stdin, source ends last', async t => {
	const {stdout, output} = await spawn(...nodePrintSleep).pipe(...nodePrintStdout);
	t.is(stdout, testString);
	t.is(output, stdout);
});

test.serial('.pipe() which does not read stdin, source fails last', async t => {
	const error = await t.throwsAsync(spawn(...nodePrintStdout).pipe(...nodePrintSleepFail));
	assertFail(t, error);
	t.is(error.stdout, testString);
	t.is(error.output, error.stdout);
});

test('.pipe() which has hanging stdin', async t => {
	const error = await t.throwsAsync(spawn(...nodeHanging, {timeout: 1e3}).pipe(...nodePassThrough));
	assertSigterm(t, error);
	t.is(error.stdout, '');
	t.is(error.output, '');
});

test('.pipe() with stdin stream in source', async t => {
	const stream = createReadStream(testFixtureUrl);
	await once(stream, 'open');
	const {stdout} = await spawn(...nodePassThrough, {stdin: stream}).pipe(...nodeToUpperCase);
	t.is(stdout, testUpperCase);
});

test('.pipe() with stdin stream in destination', async t => {
	const stream = createReadStream(testFixtureUrl);
	await once(stream, 'open');
	await t.throwsAsync(
		spawn(...nodePassThrough).pipe(...nodeToUpperCase, {stdin: stream}),
		{message: 'The "stdin" option must be set on the first "spawn()" call in the pipeline.'});
});

test('.pipe() with stdout stream in destination', async t => {
	await temporaryWriteTask('', async temporaryPath => {
		const stream = createWriteStream(temporaryPath);
		await once(stream, 'open');
		const {stdout} = await spawn(...nodePrintStdout).pipe(...nodePassThrough, {stdout: stream});
		t.is(stdout, '');
		t.is(await readFile(temporaryPath, 'utf8'), `${testString}\n`);
	});
});

test('.pipe() with stdout stream in source', async t => {
	await temporaryWriteTask('', async temporaryPath => {
		const stream = createWriteStream(temporaryPath);
		await once(stream, 'open');
		await t.throwsAsync(
			spawn(...nodePrintStdout, {stdout: stream}).pipe(...nodePassThrough),
			{message: 'The "stdout" option must be set on the last "spawn()" call in the pipeline.'},
		);
	});
});

test('.pipe() + stdout/stderr iteration', async t => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const lines = await arrayFromAsync(subprocess);
	t.deepEqual(lines, [testUpperCase]);
	const {stdout, stderr, output} = await subprocess;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('.pipe() + stdout iteration', async t => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const lines = await arrayFromAsync(subprocess.stdout);
	t.deepEqual(lines, [testUpperCase]);
	const {stdout, output} = await subprocess;
	t.is(stdout, '');
	t.is(output, '');
});

test('.pipe() + stderr iteration', async t => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCaseStderr);
	const lines = await arrayFromAsync(subprocess.stderr);
	t.deepEqual(lines, [testUpperCase]);
	const {stderr, output} = await subprocess;
	t.is(stderr, '');
	t.is(output, '');
});

test('.pipe() + stdout iteration, source fail', async t => {
	const subprocess = spawn(...nodePrintFail).pipe(...nodeToUpperCase);
	const error = await t.throwsAsync(arrayFromAsync(subprocess.stdout));
	assertFail(t, error);
	t.is(error.stdout, testString);
	const secondError = await t.throwsAsync(subprocess);
	t.is(secondError.stdout, testString);
	t.is(secondError.output, secondError.stdout);
});

test('.pipe() + stdout iteration, destination fail', async t => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCaseFail);
	const error = await t.throwsAsync(arrayFromAsync(subprocess.stdout));
	assertFail(t, error);
	t.is(error.stdout, '');
	const secondError = await t.throwsAsync(subprocess);
	t.is(secondError.stdout, '');
	t.is(secondError.output, '');
});

test('.pipe() with EPIPE', async t => {
	const subprocess = spawn(...nodeEval(`setInterval(() => {
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

test('.pipe() one source to multiple destinations', async t => {
	const first = spawn(...nodePrintStdout);
	const [firstResult, secondResult, thirdResult] = await Promise.all([
		first,
		first.pipe(...nodeToUpperCase),
		first.pipe(...nodeDouble),
	]);
	t.is(secondResult.pipedFrom, firstResult);
	t.is(thirdResult.pipedFrom, firstResult);
	t.is(firstResult.stdout, testString);
	t.is(firstResult.output, firstResult.stdout);
	t.is(secondResult.stdout, testUpperCase);
	t.is(secondResult.output, secondResult.stdout);
	t.is(thirdResult.stdout, testDouble);
	t.is(thirdResult.output, thirdResult.stdout);
});
