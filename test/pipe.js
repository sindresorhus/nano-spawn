import {createReadStream, createWriteStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {temporaryWriteTask} from 'tempy';
import test from 'node:test';
import assert from 'node:assert/strict';
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
	assertEarlyError,
	assertErrorEvent,
	assertFail,
	assertSigterm,
	throwsAsync
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

test('.pipe() success', async () => {
	const first = spawn(...nodePrintStdout);
	const {stdout, output, durationMs, pipedFrom} = await first.pipe(...nodeToUpperCase);
	const firstResult = await first;
	assert.equal(firstResult.pipedFrom, undefined);
	assert.equal(pipedFrom, firstResult);
	assert.equal(stdout, testUpperCase);
	assert.equal(output, stdout);
	assertDurationMs(durationMs);
});

test('.pipe() source fails', async () => {
	const first = spawn(...nodePrintFail);
	const secondError = await throwsAsync(first.pipe(...nodeToUpperCase));
	const firstError = await throwsAsync(first);
	assert.equal(firstError, secondError);
	assert.equal(secondError.pipedFrom, undefined);
	assertFail(secondError);
	assert.equal(secondError.stdout, testString);
	assert.equal(secondError.output, secondError.stdout);
});

test('.pipe() source fails due to child_process invalid option', async () => {
	const first = spawn(...nodePrintStdout, earlyErrorOptions);
	const secondError = await throwsAsync(first.pipe(...nodeToUpperCase));
	const firstError = await throwsAsync(first);
	assertEarlyError(secondError);
	assert.equal(firstError, secondError);
	assert.equal(secondError.pipedFrom, undefined);
});

test('.pipe() source fails due to stream error', async () => {
	const first = spawn(...nodePrintStdout);
	const second = first.pipe(...nodeToUpperCase);
	const cause = new Error(testString);
	const nodeChildProcess = await first.nodeChildProcess;
	nodeChildProcess.stdout.destroy(cause);
	const secondError = await throwsAsync(second);
	const firstError = await throwsAsync(first);
	assertErrorEvent(secondError, cause);
	assertErrorEvent(firstError, cause);
	assert.equal(firstError.pipedFrom, undefined);
	assert.equal(secondError.pipedFrom, firstError);
});

test('.pipe() destination fails', async () => {
	const first = spawn(...nodePrintStdout);
	const secondError = await throwsAsync(first.pipe(...nodeToUpperCaseFail));
	const firstResult = await first;
	assertFail(secondError);
	assert.equal(firstResult.pipedFrom, undefined);
	assert.equal(secondError.pipedFrom, firstResult);
	assert.equal(firstResult.stdout, testString);
	assert.equal(secondError.stdout, testUpperCase);
});

test('.pipe() destination fails due to child_process invalid option', async () => {
	const first = spawn(...nodePrintStdout);
	const secondError = await throwsAsync(first.pipe(...nodeToUpperCase, earlyErrorOptions));
	const firstResult = await first;
	assertEarlyError(secondError);
	assert.equal(firstResult.pipedFrom, undefined);
	assert.equal(secondError.pipedFrom, undefined);
	assert.equal(firstResult.stdout, testString);
});

test('.pipe() destination fails due to stream error', async () => {
	const first = spawn(...nodePrintStdout);
	const second = first.pipe(...nodeToUpperCase);
	const cause = new Error(testString);
	const nodeChildProcess = await second.nodeChildProcess;
	nodeChildProcess.stdin.destroy(cause);
	const secondError = await throwsAsync(second);
	assertErrorEvent(secondError, cause);

	// Node 23 changed the behavior of `stream.pipeline()`
	if (NODE_VERSION >= 23) {
		const firstResult = await first;
		assert.equal(firstResult.stdout, testString);
		assert.equal(firstResult.pipedFrom, undefined);
		assert.equal(secondError.pipedFrom, firstResult);
	} else {
		const firstError = await throwsAsync(first);
		assertErrorEvent(firstError, cause);
		assert.equal(firstError.pipedFrom, undefined);
		assert.equal(secondError.pipedFrom, firstError);
	}
});

test('.pipe() source and destination fail', async () => {
	const first = spawn(...nodePrintFail);
	const secondError = await throwsAsync(first.pipe(...nodeToUpperCaseFail));
	const firstError = await throwsAsync(first);
	assertFail(firstError);
	assertFail(secondError);
	assert.equal(firstError.pipedFrom, undefined);
	assert.equal(secondError.pipedFrom, firstError);
	assert.equal(firstError.stdout, testString);
	assert.equal(firstError.output, firstError.stdout);
	assert.equal(secondError.stdout, testUpperCase);
	assert.equal(secondError.output, secondError.stdout);
});

test('.pipe().pipe() success', async () => {
	const first = spawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const secondResult = await first.pipe(...nodeDouble);
	const firstResult = await first;
	assert.equal(firstResult.stdout, testUpperCase);
	assert.equal(firstResult.output, firstResult.stdout);
	assert.equal(secondResult.stdout, testDoubleUpperCase);
	assert.equal(secondResult.output, secondResult.stdout);
	assertDurationMs(firstResult.durationMs);
});

test('.pipe().pipe() first source fail', async () => {
	const first = spawn(...nodePrintFail).pipe(...nodeToUpperCase);
	const secondError = await throwsAsync(first.pipe(...nodeDouble));
	const firstError = await throwsAsync(first);
	assertFail(firstError);
	assert.equal(firstError, secondError);
	assert.equal(firstError.stdout, testString);
	assert.equal(firstError.output, firstError.stdout);
});

test('.pipe().pipe() second source fail', async () => {
	const first = spawn(...nodePrintStdout).pipe(...nodeToUpperCaseFail);
	const secondError = await throwsAsync(first.pipe(...nodeDouble));
	const firstError = await throwsAsync(first);
	assertFail(firstError);
	assert.equal(firstError, secondError);
	assert.equal(firstError.stdout, testUpperCase);
	assert.equal(firstError.output, firstError.stdout);
});

test('.pipe().pipe() destination fail', async () => {
	const first = spawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const secondError = await throwsAsync(first.pipe(...nodeDoubleFail));
	const firstResult = await first;
	assertFail(secondError);
	assert.equal(firstResult.stdout, testUpperCase);
	assert.equal(firstResult.output, firstResult.stdout);
	assert.equal(secondError.stdout, testDoubleUpperCase);
	assert.equal(secondError.output, secondError.stdout);
	assertDurationMs(firstResult.durationMs);
});

test('.pipe().pipe() all fail', async () => {
	const first = spawn(...nodePrintFail).pipe(...nodeToUpperCaseFail);
	const secondError = await throwsAsync(first.pipe(...nodeDoubleFail));
	const firstError = await throwsAsync(first);
	assertFail(firstError);
	assertFail(secondError);
	assert.equal(secondError.pipedFrom, firstError);
	assert.equal(firstError.stdout, testUpperCase);
	assert.equal(firstError.output, firstError.stdout);
	assert.equal(secondError.stdout, testDoubleUpperCase);
	assert.equal(secondError.output, secondError.stdout);
});

// Cannot guarantee that `cat` exists on Windows
if (!isWindows) {
	test('.pipe() without arguments', async () => {
		const {stdout} = await spawn(...nodePrintStdout).pipe('cat');
		assert.equal(stdout, testString);
	});
}

test('.pipe() with options', async () => {
	const argv0 = 'Foo';
	const {stdout} = await spawn(...nodePrintStdout).pipe(...nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim() + process.argv0);
});`), {argv0});
	assert.equal(stdout, `${testString}${argv0}`);
});

test('.pipe() which does not read stdin, source ends first', async () => {
	const {stdout, output} = await spawn(...nodePrintStdout).pipe(...nodePrintSleep);
	assert.equal(stdout, testString);
	assert.equal(output, stdout);
});

test('.pipe() which does not read stdin, source fails first', async () => {
	const error = await throwsAsync(spawn(...nodePrintFail).pipe(...nodePrintSleep));
	assertFail(error);
	assert.equal(error.stdout, testString);
	assert.equal(error.output, error.stdout);
});

test('.pipe() which does not read stdin, source ends last', async () => {
	const {stdout, output} = await spawn(...nodePrintSleep).pipe(...nodePrintStdout);
	assert.equal(stdout, testString);
	assert.equal(output, stdout);
});

test('.pipe() which does not read stdin, source fails last', async () => {
	const error = await throwsAsync(spawn(...nodePrintStdout).pipe(...nodePrintSleepFail));
	assertFail(error);
	assert.equal(error.stdout, testString);
	assert.equal(error.output, error.stdout);
});

test('.pipe() which has hanging stdin', async () => {
	const error = await throwsAsync(spawn(...nodeHanging, {timeout: 1e3}).pipe(...nodePassThrough));
	assertSigterm(error);
	assert.equal(error.stdout, '');
	assert.equal(error.output, '');
});

test('.pipe() with stdin stream in source', async () => {
	const stream = createReadStream(testFixtureUrl);
	await once(stream, 'open');
	const {stdout} = await spawn(...nodePassThrough, {stdin: stream}).pipe(...nodeToUpperCase);
	assert.equal(stdout, testUpperCase);
});

test('.pipe() with stdin stream in destination', async () => {
	const stream = createReadStream(testFixtureUrl);
	await once(stream, 'open');
	await throwsAsync(
		spawn(...nodePassThrough).pipe(...nodeToUpperCase, {stdin: stream}),
		{message: 'The "stdin" option must be set on the first "spawn()" call in the pipeline.'});
});

test('.pipe() with stdout stream in destination', async () => {
	await temporaryWriteTask('', async temporaryPath => {
		const stream = createWriteStream(temporaryPath);
		await once(stream, 'open');
		const {stdout} = await spawn(...nodePrintStdout).pipe(...nodePassThrough, {stdout: stream});
		assert.equal(stdout, '');
		assert.equal(await readFile(temporaryPath, 'utf8'), `${testString}\n`);
	});
});

test('.pipe() with stdout stream in source', async () => {
	await temporaryWriteTask('', async temporaryPath => {
		const stream = createWriteStream(temporaryPath);
		await once(stream, 'open');
		await throwsAsync(
			spawn(...nodePrintStdout, {stdout: stream}).pipe(...nodePassThrough),
			{message: 'The "stdout" option must be set on the last "spawn()" call in the pipeline.'},
		);
	});
});

test('.pipe() + stdout/stderr iteration', async () => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const lines = await arrayFromAsync(subprocess);
	assert.deepEqual(lines, [testUpperCase]);
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('.pipe() + stdout iteration', async () => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const lines = await arrayFromAsync(subprocess.stdout);
	assert.deepEqual(lines, [testUpperCase]);
	const {stdout, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(output, '');
});

test('.pipe() + stderr iteration', async () => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCaseStderr);
	const lines = await arrayFromAsync(subprocess.stderr);
	assert.deepEqual(lines, [testUpperCase]);
	const {stderr, output} = await subprocess;
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('.pipe() + stdout iteration, source fail', async () => {
	const subprocess = spawn(...nodePrintFail).pipe(...nodeToUpperCase);
	const error = await throwsAsync(arrayFromAsync(subprocess.stdout));
	assertFail(error);
	assert.equal(error.stdout, testString);
	const secondError = await throwsAsync(subprocess);
	assert.equal(secondError.stdout, testString);
	assert.equal(secondError.output, secondError.stdout);
});

test('.pipe() + stdout iteration, destination fail', async () => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCaseFail);
	const error = await throwsAsync(arrayFromAsync(subprocess.stdout));
	assertFail(error);
	assert.equal(error.stdout, '');
	const secondError = await throwsAsync(subprocess);
	assert.equal(secondError.stdout, '');
	assert.equal(secondError.output, '');
});

test('.pipe() with EPIPE', async () => {
	// Skip this test if the current OS is lacking the Unix utility `head`
	try {
		await spawn('head', ['--version']);
	} catch {
		return;
	}

	const subprocess = spawn(...nodeEval(`setInterval(() => {
	console.log("${testString}");
}, 0);
process.stdout.on("error", () => {
	process.exit();
});`)).pipe('head', ['-n', '2']);
	const lines = await arrayFromAsync(subprocess);
	assert.deepEqual(lines, [testString, testString]);
	const {stdout, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(output, '');
});

test('.pipe() one source to multiple destinations', async () => {
	const first = spawn(...nodePrintStdout);
	const [firstResult, secondResult, thirdResult] = await Promise.all([
		first,
		first.pipe(...nodeToUpperCase),
		first.pipe(...nodeDouble),
	]);
	assert.equal(secondResult.pipedFrom, firstResult);
	assert.equal(thirdResult.pipedFrom, firstResult);
	assert.equal(firstResult.stdout, testString);
	assert.equal(firstResult.output, firstResult.stdout);
	assert.equal(secondResult.stdout, testUpperCase);
	assert.equal(secondResult.output, secondResult.stdout);
	assert.equal(thirdResult.stdout, testDouble);
	assert.equal(thirdResult.output, thirdResult.stdout);
});
