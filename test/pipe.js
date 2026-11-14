import {createReadStream, createWriteStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import {temporaryWriteTask} from 'tempy';
import spawn, {SubprocessError} from '../source/index.js';
import {
	isWindows,
	FIXTURES_URL,
	earlyErrorOptions,
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
	assertSubprocessErrorName,
	throwsAsync,
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
	nonExistentExecutable,
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

test('.pipe() with input in source', async () => {
	const {stdout} = await spawn(...nodePassThrough, {input: testString}).pipe(...nodeToUpperCase);
	assert.equal(stdout, testUpperCase);
});

test('.pipe() with stdin stream in destination', async () => {
	const stream = createReadStream(testFixtureUrl);
	await once(stream, 'open');
	await throwsAsync(
		spawn(...nodePassThrough).pipe(...nodeToUpperCase, {stdin: stream}),
		{message: /^The "stdin" option must be "pipe" on the destination of "\.pipe\(\)"\.$/v});
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
			{message: /^The "stdout" option must be "pipe" on the source of "\.pipe\(\)"\.$/v},
		);
	});
});

// Invalid `stdin`/`stdout` options are `spawn()` misuse, so they must reject with the same `SubprocessError` shape as any other subprocess failure, not with a bare `Error`.
const testPipeSetupError = (message, spawnPiped) => async () => {
	const error = await throwsAsync(spawnPiped());
	assert.ok(error instanceof SubprocessError);
	assertSubprocessErrorName(error.name);
	assert.ok(error.command.startsWith('node -e '));
	assert.equal(error.message, message);
	assert.equal(error.exitCode, undefined);
	assert.equal(error.signalName, undefined);
	assert.equal(error.isCanceled, false);
	assert.equal(error.stdout, '');
	assert.equal(error.stderr, '');
	assert.equal(error.output, '');
	assertDurationMs(error.durationMs);
};

test('.pipe() rejects with a SubprocessError if the destination "stdin" is not a pipe', testPipeSetupError(
	'The "stdin" option must be "pipe" on the destination of ".pipe()".',
	() => spawn(...nodePrintStdout).pipe(...nodeToUpperCase, {stdin: 'ignore'}),
));

test('.pipe() rejects with a SubprocessError if the source "stdout" is not a pipe', testPipeSetupError(
	'The "stdout" option must be "pipe" on the source of ".pipe()".',
	() => spawn(...nodePrintStdout, {stdout: 'ignore'}).pipe(...nodeToUpperCase),
));

// The destination's input comes from the source, so `input` is a conflict: its stdin is already written to by the source.
test('.pipe() rejects with a SubprocessError if the destination has an "input"', async () => {
	const error = await throwsAsync(spawn(...nodePrintStdout).pipe(...nodeToUpperCase, {input: testString}));
	assert.ok(error instanceof SubprocessError);
	assertSubprocessErrorName(error.name);
	assert.equal(error.message, 'The "input" option must not be set on the destination of ".pipe()".');
	assert.equal(error.pipedFrom, undefined);
});

// An empty string is still set
test('.pipe() rejects with a SubprocessError if the destination has an empty "input"', async () => {
	const error = await throwsAsync(spawn(...nodePrintStdout).pipe(...nodeToUpperCase, {input: ''}));
	assert.ok(error instanceof SubprocessError);
	assertSubprocessErrorName(error.name);
	assert.equal(error.message, 'The "input" option must not be set on the destination of ".pipe()".');
	assert.equal(error.pipedFrom, undefined);
});

// The destination's input comes from the source, so it is never written: a rejected setup must not deliver the input to the destination.
test('.pipe() destination with "input" does not receive the input', async () => {
	await temporaryWriteTask('', async temporaryPath => {
		const stream = createWriteStream(temporaryPath);
		await once(stream, 'open');
		const destination = spawn(...nodePrintStdout).pipe(...nodePassThrough, {input: testString, stdout: stream});
		const error = await throwsAsync(destination);
		assert.equal(error.message, 'The "input" option must not be set on the destination of ".pipe()".');
		const nodeChildProcess = await destination.nodeChildProcess;
		if (nodeChildProcess.exitCode === null) {
			await once(nodeChildProcess, 'exit');
		}

		assert.equal(await readFile(temporaryPath, 'utf8'), '');
	});
});

// `input` together with `stdin`/`stdio` is caught by `spawn()` itself, so it throws right away instead of rejecting
test('.pipe() destination "input" cannot be combined with "stdin"', () => {
	assert.throws(() => spawn(...nodePrintStdout).pipe(...nodeToUpperCase, {input: testString, stdin: 'pipe'}), {
		name: 'TypeError',
		message: 'The `input` option cannot be used with the `stdin` or `stdio` options.',
	});
});

// The message names which subprocess is at fault, so it must not contradict itself. `error.command` is always the destination, even for the `stdout` option, which belongs to the source.
test('.pipe() "stdout" setup error uses the destination command', async () => {
	const error = await throwsAsync(spawn(...nodePrintStdout, {stdout: 'ignore'}).pipe(...nodeToUpperCase));
	assert.ok(error.command.includes('toUpperCase'));
	assert.equal(error.pipedFrom, undefined);
});

test('.pipe() setup error takes priority over a failing source', async () => {
	const error = await throwsAsync(spawn(...nodePrintFail, {stdout: 'ignore'}).pipe(...nodeToUpperCase));
	assert.equal(error.message, 'The "stdout" option must be "pipe" on the source of ".pipe()".');
});

// Nothing is piped when the setup fails, so the error must not wait for a source which may never exit
const testPipeSetupNoWait = destinationArguments => async () => {
	const first = spawn(...nodeEval('setInterval(() => {}, 1e3)'));
	await throwsAsync(first.pipe(...destinationArguments));
	const nodeChildProcess = await first.nodeChildProcess;
	nodeChildProcess.kill();
	const {signalName} = await throwsAsync(first);
	assert.equal(signalName, 'SIGTERM');
};

test('.pipe() setup error does not wait for the source to exit', testPipeSetupNoWait([...nodeToUpperCase, {stdin: 'ignore'}]));
test('.pipe() destination spawn error does not wait for the source to exit', testPipeSetupNoWait([nonExistentExecutable]));

// A subprocess which failed to spawn is already a `SubprocessError`: it must be rethrown as is, without being wrapped nor referencing itself through `error.pipedFrom`.
test('.pipe() does not wrap a source which failed to spawn', async () => {
	const first = spawn(nonExistentExecutable);
	const error = await throwsAsync(first.pipe(...nodeToUpperCase));
	assert.equal(error, await throwsAsync(first));
	assert.equal(error.pipedFrom, undefined);
});

test('.pipe() does not wrap a destination which failed to spawn', async () => {
	const first = spawn(...nodePrintStdout);
	const error = await throwsAsync(first.pipe(nonExistentExecutable));
	assert.equal(error.command, nonExistentExecutable);
	assert.equal(error.pipedFrom, undefined);
});

test('.pipe() + stdout/stderr iteration', async () => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const lines = await Array.fromAsync(subprocess);
	assert.deepEqual(lines, [testUpperCase]);
	const {stdout, stderr, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('.pipe() + stdout iteration', async () => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCase);
	const lines = await Array.fromAsync(subprocess.stdout);
	assert.deepEqual(lines, [testUpperCase]);
	const {stdout, output} = await subprocess;
	assert.equal(stdout, '');
	assert.equal(output, '');
});

test('.pipe() + stderr iteration', async () => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCaseStderr);
	const lines = await Array.fromAsync(subprocess.stderr);
	assert.deepEqual(lines, [testUpperCase]);
	const {stderr, output} = await subprocess;
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('.pipe() + stdout iteration, source fail', async () => {
	const subprocess = spawn(...nodePrintFail).pipe(...nodeToUpperCase);
	const error = await throwsAsync(Array.fromAsync(subprocess.stdout));
	assertFail(error);
	assert.equal(error.stdout, testString);
	const secondError = await throwsAsync(subprocess);
	assert.equal(secondError.stdout, testString);
	assert.equal(secondError.output, secondError.stdout);
});

test('.pipe() + stdout iteration, destination fail', async () => {
	const subprocess = spawn(...nodePrintStdout).pipe(...nodeToUpperCaseFail);
	const error = await throwsAsync(Array.fromAsync(subprocess.stdout));
	assertFail(error);
	assert.equal(error.stdout, '');
	const secondError = await throwsAsync(subprocess);
	assert.equal(secondError.stdout, '');
	assert.equal(secondError.output, '');
});

// The destination exits after two lines, so the source keeps writing to a closed pipe and its `stdout` emits an `EPIPE` error, which it handles by exiting. Unlike a process killed by `SIGPIPE`, that is a clean exit, so this asserts the destination's result is what comes back.
if (!isWindows) {
	test('.pipe() when the destination stops reading', async () => {
		const subprocess = spawn(...nodeEval(`setInterval(() => {
	console.log("${testString}");
}, 0);
process.stdout.on("error", () => {
	process.exit();
});`)).pipe('head', ['-n', '2']);
		const lines = await Array.fromAsync(subprocess);
		assert.deepEqual(lines, [testString, testString]);
		// Iterating turns off buffering, so the output is not kept a second time
		const {stdout, output} = await subprocess;
		assert.equal(stdout, '');
		assert.equal(output, '');
	});
}

test('.pipe().pipe().pipe() result.pipedFrom is a chain', async () => {
	const result = await spawn(...nodePrintStdout).pipe(...nodeToUpperCase).pipe(...nodeDouble).pipe(...nodeDouble);
	assert.equal(result.stdout, `${testDoubleUpperCase}${testDoubleUpperCase}`);
	let depth = 0;
	let current = result;
	while (current.pipedFrom !== undefined) {
		depth += 1;
		current = current.pipedFrom;
	}

	// 4 subprocesses, so 3 `pipedFrom` links
	assert.equal(depth, 3);
	assert.equal(current.stdout, testString);
	assert.equal(current.pipedFrom, undefined);
});

test('.pipe().pipe().pipe() error.pipedFrom is a chain', async () => {
	const first = spawn(...nodePrintStdout).pipe(...nodeToUpperCase).pipe(...nodeDouble);
	const error = await throwsAsync(first.pipe(...nodeDoubleFail));
	assertFail(error);
	assert.equal(error.pipedFrom, await first);
	assert.equal(error.pipedFrom.pipedFrom.stdout, testUpperCase);
	assert.equal(error.pipedFrom.pipedFrom.pipedFrom.stdout, testString);
	assert.equal(error.pipedFrom.pipedFrom.pipedFrom.pipedFrom, undefined);
});

test('.pipe() destination error has the destination command', async () => {
	const first = spawn(...nodePrintStdout);
	const error = await throwsAsync(first.pipe(...nodeToUpperCaseFail));
	assertFail(error);
	assert.ok(error.command.startsWith('node -e '));
	assert.ok(error.command.includes('toUpperCase'));
	assert.equal(error.pipedFrom.command, `node -e 'console.log("${testString}")'`);
});

// Piping one source to many destinations adds several `pipeline()` listeners per destination to the source's `stdout`, which Node warns about past 10 listeners. The project's own test setup turns any warning into a failure, and users would get the same noise.
test('.pipe() one source to many destinations', async () => {
	const first = spawn(...nodePrintStdout);
	const destinations = Array.from({length: 6}, () => [first.pipe(...nodeToUpperCase), first.pipe(...nodeDouble)]).flat();
	const [firstResult, ...results] = await Promise.all([first, ...destinations]);
	assert.equal(firstResult.stdout, testString);
	assert.equal(firstResult.output, firstResult.stdout);
	assert.deepEqual(results.map(({stdout}) => stdout), Array.from({length: 6}, () => [testUpperCase, testDouble]).flat());

	for (const {stdout, output, pipedFrom} of results) {
		assert.equal(output, stdout);
		assert.equal(pipedFrom, firstResult);
	}
});

test('.pipe() can pass options without arguments', async () => {
	const {stdout} = await spawn(...nodeEval('console.log("console.log(process.env.TEST_PIPE)")')).pipe('node', {env: {TEST_PIPE: testString}});
	assert.equal(stdout, testString);
});

test('.pipe() destination can be aborted', async () => {
	const controller = new AbortController();
	const first = spawn(...nodePrintStdout);
	const destination = first.pipe(...nodeEval('setInterval(() => {}, 1e3)'), {signal: controller.signal});
	const firstResult = await first;
	controller.abort();
	const error = await throwsAsync(destination);
	assert.equal(error.isCanceled, true);
	assert.equal(error.pipedFrom, firstResult);
});

// A setup failure must end the stdin of the destination, so that a destination waiting for its input exits instead of hanging
test('.pipe() setup error ends the destination stdin', {timeout: 1e4}, async () => {
	const destination = spawn(...nodePrintStdout, {stdout: 'ignore'}).pipe(...nodePassThrough);
	await throwsAsync(destination);
	const nodeChildProcess = await destination.nodeChildProcess;
	if (nodeChildProcess.exitCode === null) {
		await once(nodeChildProcess, 'exit');
	}

	assert.equal(nodeChildProcess.exitCode, 0);
});

// The destination stopping to read ends the source with `SIGPIPE`. The pipeline itself caused that, so the pipeline takes the destination's outcome, as a shell does, and the source's error is still reachable through `pipedFrom`.
if (!isWindows) {
	test('.pipe() source killed by SIGPIPE is not a pipeline failure', async () => {
		// Large enough that `cat` cannot write it all before `head` exits, so it is ended by SIGPIPE
		await temporaryWriteTask(`${testString}\n`.repeat(100_000), async temporaryPath => {
			const {stdout, pipedFrom} = await spawn('cat', [temporaryPath]).pipe('head', ['-n', '2']);
			assert.equal(stdout, `${testString}\n${testString}`);
			assertSubprocessErrorName(pipedFrom.name);
			assert.equal(pipedFrom.signalName, 'SIGPIPE');
		});
	});

	// Each destination takes the outcome of its own destination, so a `SIGPIPE` in the middle of a pipeline does not fail it either
	test('.pipe() source killed by SIGPIPE in the middle of a pipeline', async () => {
		const {stdout, pipedFrom} = await spawn('yes').pipe('head', ['-n', '1']).pipe(...nodeToUpperCase);
		assert.equal(stdout, 'Y');
		assert.equal(pipedFrom.stdout, 'y');
		assert.equal(pipedFrom.pipedFrom.signalName, 'SIGPIPE');
	});

	test('.pipe() destination failure takes priority over a source killed by SIGPIPE', async () => {
		const error = await throwsAsync(spawn('yes').pipe('sh', ['-c', 'head -n 1; exit 2']));
		assert.equal(error.exitCode, 2);
		assert.equal(error.stdout, 'y');
		assert.equal(error.pipedFrom.signalName, 'SIGPIPE');
	});

	test('.pipe() source failing for another reason is still a pipeline failure', async () => {
		const error = await throwsAsync(spawn('node', ['-e', 'process.exit(2)']).pipe('cat'));
		assertFail(error);
		assert.equal(error.pipedFrom, undefined);
	});
}
