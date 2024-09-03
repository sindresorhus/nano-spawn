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
import nanoSpawn from './index.js';

const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';
const FIXTURES_URL = new URL('fixtures/', import.meta.url);
const fixturesPath = fileURLToPath(FIXTURES_URL);
const testFixtureUrl = new URL('test.txt', FIXTURES_URL);

// TODO: replace with Array.fromAsync() after dropping support for Node <22.0.0
const arrayFromAsync = async asyncIterable => {
	const chunks = [];
	for await (const chunk of asyncIterable) {
		chunks.push(chunk);
	}

	return chunks;
};

const testString = 'test';
const secondTestString = 'secondTest';
const testUpperCase = testString.toUpperCase();
const testDoubleUpperCase = `${testUpperCase}${testUpperCase}`;

const getPipeSize = command => command.split(' | ').length;

const nodeHanging = ['node'];
const nodePrint = bodyString => ['node', ['-p', bodyString]];
const nodeEval = bodyString => ['node', ['-e', bodyString]];
const nodePrintStdout = nodeEval(`console.log("${testString}")`);
const nodePrintStderr = nodeEval(`console.error("${testString}")`);
const nodePrintBoth = nodeEval(`console.log("${testString}");
setTimeout(() => {
	console.error("${secondTestString}");
}, 0)`);
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
const nonExistentCommand = 'non-existent-command';

const commandEvalFailStart = 'node -e';
const messageEvalFailStart = `Command failed: ${commandEvalFailStart}`;
const messageExitEvalFailStart = `Command failed with exit code 2: ${commandEvalFailStart}`;

const VERSION_REGEXP = /^\d+\.\d+\.\d+$/;

test('Can pass options.argv0', async t => {
	const {stdout} = await nanoSpawn(...nodePrintArgv0, {argv0: testString});
	t.is(stdout, testString);
});

test('Can pass options.argv0, shell', async t => {
	const {stdout} = await nanoSpawn(...nodePrintArgv0, {argv0: testString, shell: true});
	t.is(stdout, process.execPath);
});

test('Can pass options.stdin', async t => {
	const promise = nanoSpawn(...nodePrintStdout, {stdin: 'ignore'});
	const {stdin} = await promise.nodeChildProcess;
	t.is(stdin, null);
	await promise;
});

test('Can pass options.stdout', async t => {
	const promise = nanoSpawn(...nodePrintStdout, {stdout: 'ignore'});
	const {stdout} = await promise.nodeChildProcess;
	t.is(stdout, null);
	await promise;
});

test('Can pass options.stderr', async t => {
	const promise = nanoSpawn(...nodePrintStdout, {stderr: 'ignore'});
	const {stderr} = await promise.nodeChildProcess;
	t.is(stderr, null);
	await promise;
});

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
	const {stdout} = await nanoSpawn('node', ['-p', 'process.env.ONE + process.env.TWO'], {env: {TWO: testString}});
	t.is(stdout, `${process.env.ONE}${testString}`);
	delete process.env.ONE;
	delete process.env.TWO;
});

test('Can pass options object without any arguments', async t => {
	const {exitCode, signalName} = await t.throwsAsync(nanoSpawn(...nodeHanging, {timeout: 1}));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
});

test('result.exitCode|signalName on success', async t => {
	const {exitCode, signalName} = await nanoSpawn(...nodePrintStdout);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
});

test('Error on non-0 exit code', async t => {
	const {exitCode, signalName, message, cause} = await t.throwsAsync(nanoSpawn(...nodeEval('process.exit(2)')));
	t.is(exitCode, 2);
	t.is(signalName, undefined);
	t.is(message, 'Command failed with exit code 2: node -e \'process.exit(2)\'');
	t.is(cause, undefined);
});

test('Error on signal termination', async t => {
	const {exitCode, signalName, message, cause} = await t.throwsAsync(nanoSpawn(...nodeHanging, {timeout: 1}));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
	t.is(message, 'Command was terminated with SIGTERM: node');
	t.is(cause, undefined);
});

test('Error on invalid child_process options', async t => {
	const {exitCode, signalName, message, cause} = await t.throwsAsync(nanoSpawn(...nodePrintStdout, {detached: 'true'}));
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(message.startsWith(messageEvalFailStart));
	t.true(cause.message.includes('options.detached'));
	t.false(cause.message.includes('Command'));
});

test('Error on "error" event before spawn', async t => {
	const {stderr, cause} = await t.throwsAsync(nanoSpawn(nonExistentCommand));

	if (isWindows) {
		t.true(stderr.includes('not recognized as an internal or external command'));
	} else {
		t.is(cause.code, 'ENOENT');
	}
});

test('Error on "error" event during spawn', async t => {
	const error = new Error(testString);
	const {exitCode, signalName, message, cause} = await t.throwsAsync(nanoSpawn(...nodeHanging, {signal: AbortSignal.abort(error)}));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
	t.is(message, 'Command was terminated with SIGTERM: node');
	t.is(cause, undefined);
});

test('Error on "error" event during spawn, with iteration', async t => {
	const error = new Error(testString);
	const promise = nanoSpawn(...nodeHanging, {signal: AbortSignal.abort(error)});
	const {exitCode, signalName, message, cause} = await t.throwsAsync(arrayFromAsync(promise.stdout));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
	t.is(message, 'Command was terminated with SIGTERM: node');
	t.is(cause, undefined);
});

// The `signal` option sends `SIGTERM`.
// Whether the subprocess is terminated before or after an `error` event is emitted depends on the speed of the OS syscall.
if (isLinux) {
	test('Error on "error" event after spawn', async t => {
		const error = new Error(testString);
		const controller = new AbortController();
		const promise = nanoSpawn(...nodeHanging, {signal: controller.signal});
		await promise.nodeChildProcess;
		controller.abort(error);
		const {exitCode, signalName, message, cause} = await t.throwsAsync(promise);
		t.is(exitCode, undefined);
		t.is(signalName, undefined);
		t.is(message, 'Command failed: node');
		t.is(cause.message, 'The operation was aborted');
		t.is(cause.cause, error);
	});
}

test('Error on stdin', async t => {
	const error = new Error(testString);
	const promise = nanoSpawn(...nodePrintStdout);
	const subprocess = await promise.nodeChildProcess;
	subprocess.stdin.destroy(error);
	const {exitCode, signalName, message, cause} = await t.throwsAsync(promise);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(message.startsWith(messageEvalFailStart));
	t.is(cause, error);
});

test('Error on stdout', async t => {
	const error = new Error(testString);
	const promise = nanoSpawn(...nodePrintStderr);
	const subprocess = await promise.nodeChildProcess;
	subprocess.stdout.destroy(error);
	const {exitCode, signalName, message, cause} = await t.throwsAsync(promise);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(message.startsWith(messageEvalFailStart));
	t.is(cause, error);
});

test('Error on stderr', async t => {
	const error = new Error(testString);
	const promise = nanoSpawn(...nodePrintStdout);
	const subprocess = await promise.nodeChildProcess;
	subprocess.stderr.destroy(error);
	const {exitCode, signalName, message, cause} = await t.throwsAsync(promise);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(message.startsWith(messageEvalFailStart));
	t.is(cause, error);
});

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
	const promise = nanoSpawn(...nodeEval(`console.log("a");
console.log("b");
console.error("c");
console.error("d");`));

	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, ['a', 'b', 'c', 'd']);

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
	console.log("a");
	await setTimeout(10);
	console.error("b");
	await setTimeout(10);
}`]);

	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, Array.from({length}, () => ['a', 'b']).flat());

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
	const {exitCode, stdout, stderr, output} = await t.throwsAsync(nanoSpawn(...nodeEval(`console.log("${testString}");
process.exit(2);`)));
	t.is(exitCode, 2);
	t.is(stdout, testString);
	t.is(stderr, '');
	t.is(output, stdout);
});

test('error.stderr is set', async t => {
	const {exitCode, stdout, stderr, output} = await t.throwsAsync(nanoSpawn(...nodeEval(`console.error("${testString}");
process.exit(2);`)));
	t.is(exitCode, 2);
	t.is(stdout, '');
	t.is(stderr, testString);
	t.is(output, stderr);
});

test('error.output is set', async t => {
	const {exitCode, stdout, stderr, output} = await t.throwsAsync(nanoSpawn(...nodeEval(`console.log("${testString}");
setTimeout(() => {
	console.error("${secondTestString}");
	process.exit(2);
}, 0);`)));
	t.is(exitCode, 2);
	t.is(stdout, testString);
	t.is(stderr, secondTestString);
	t.is(output, `${stdout}\n${stderr}`);
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

test('promise[Symbol.asyncIterator] is line-wise', async t => {
	const promise = nanoSpawn('node', ['--input-type=module', '-e', `
import {setTimeout} from 'node:timers/promises';

process.stdout.write("a\\nb\\n");
await setTimeout(0);
process.stderr.write("c\\nd\\n");`]);
	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, ['a', 'b', 'c', 'd']);
});

test('promise.stdout handles no newline at the end', async t => {
	const promise = nanoSpawn(...nodePrintNoNewline('a\nb'));
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, ['a', 'b']);
});

test('result.stdout handles no newline at the end', async t => {
	const {stdout, output} = await nanoSpawn(...nodePrintNoNewline('a\nb'));
	t.is(stdout, 'a\nb');
	t.is(output, stdout);
});

test('promise.stdout handles newline at the end', async t => {
	const promise = nanoSpawn(...nodePrintNoNewline('a\nb\n'));
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, ['a', 'b']);
});

test('result.stdout handles newline at the end', async t => {
	const {stdout, output} = await nanoSpawn(...nodePrintNoNewline('a\nb\n'));
	t.is(stdout, 'a\nb');
	t.is(output, stdout);
});

test('promise.stdout handles newline at the beginning', async t => {
	const promise = nanoSpawn(...nodePrintNoNewline('\na\nb'));
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, ['', 'a', 'b']);
});

test('result.stdout handles newline at the beginning', async t => {
	const {stdout, output} = await nanoSpawn(...nodePrintNoNewline('\na\nb'));
	t.is(stdout, '\na\nb');
	t.is(output, stdout);
});

test('promise.stdout handles 2 newlines at the end', async t => {
	const promise = nanoSpawn(...nodePrintNoNewline('a\nb\n\n'));
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, ['a', 'b', '']);
});

test('result.stdout handles 2 newlines at the end', async t => {
	const {stdout, output} = await nanoSpawn(...nodePrintNoNewline('a\nb\n\n'));
	t.is(stdout, 'a\nb\n');
	t.is(output, stdout);
});

test('promise.stdout handles Windows newlines', async t => {
	const promise = nanoSpawn(...nodePrintNoNewline('a\r\nb'));
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, ['a', 'b']);
});

test('result.stdout handles Windows newlines', async t => {
	const {stdout, output} = await nanoSpawn(...nodePrintNoNewline('a\r\nb'));
	t.is(stdout, 'a\r\nb');
	t.is(output, stdout);
});

test('promise.stdout handles Windows newline at the end', async t => {
	const promise = nanoSpawn(...nodePrintNoNewline('a\r\nb\r\n'));
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, ['a', 'b']);
});

test('result.stdout handles Windows newline at the end', async t => {
	const {stdout, output} = await nanoSpawn(...nodePrintNoNewline('a\r\nb\r\n'));
	t.is(stdout, 'a\r\nb');
	t.is(output, stdout);
});

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

const destroyStdout = async ({nodeChildProcess}, error) => {
	const {stdout} = await nodeChildProcess;
	stdout.destroy(error);
};

const destroyStderr = async ({nodeChildProcess}, error) => {
	const {stderr} = await nodeChildProcess;
	stderr.destroy(error);
};

test('Handles promise.stdout error', async t => {
	const promise = nanoSpawn(...nodePrintStdout);
	const error = new Error(testString);
	destroyStdout(promise, error);
	const {cause} = await t.throwsAsync(arrayFromAsync(promise.stdout));
	t.is(cause, error);
	const {stdout, output} = await t.throwsAsync(promise);
	t.is(stdout, '');
	t.is(output, '');
});

test('Handles promise.stderr error', async t => {
	const promise = nanoSpawn(...nodePrintStderr);
	const error = new Error(testString);
	destroyStderr(promise, error);
	const {cause} = await t.throwsAsync(arrayFromAsync(promise.stderr));
	t.is(cause, error);
	const {stderr, output} = await t.throwsAsync(promise);
	t.is(stderr, '');
	t.is(output, '');
});

test('Handles promise.stdout error in promise[Symbol.asyncIterator]', async t => {
	const promise = nanoSpawn(...nodePrintStdout);
	const error = new Error(testString);
	destroyStdout(promise, error);
	const {cause} = await t.throwsAsync(arrayFromAsync(promise));
	t.is(cause, error);
	const {stdout, output} = await t.throwsAsync(promise);
	t.is(stdout, '');
	t.is(output, '');
});

test('Handles promise.stderr error in promise[Symbol.asyncIterator]', async t => {
	const promise = nanoSpawn(...nodePrintStderr);
	const error = new Error(testString);
	destroyStderr(promise, error);
	const {cause} = await t.throwsAsync(arrayFromAsync(promise));
	t.is(cause, error);
	const {stderr, output} = await t.throwsAsync(promise);
	t.is(stderr, '');
	t.is(output, '');
});

test('Handles result.stdout error', async t => {
	const promise = nanoSpawn(...nodePrintStdout);
	const error = new Error(testString);
	destroyStdout(promise, error);
	const {cause} = await t.throwsAsync(promise);
	t.is(cause, error);
});

test('Handles result.stderr error', async t => {
	const promise = nanoSpawn(...nodePrintStdout);
	const error = new Error(testString);
	destroyStderr(promise, error);
	const {cause} = await t.throwsAsync(promise);
	t.is(cause, error);
});

test.serial('promise.stdout iteration break waits for the subprocess success', async t => {
	const promise = nanoSpawn(...nodePassThroughPrint);
	let done = false;

	// eslint-disable-next-line no-unreachable-loop
	for await (const line of promise.stdout) {
		t.is(line, testString);
		globalThis.setTimeout(async () => {
			const {stdin, stdout} = await promise.nodeChildProcess;
			t.true(stdout.readable);
			t.true(stdin.writable);
			stdin.end(secondTestString);
			done = true;
		}, 1e2);
		break;
	}

	t.true(done);
	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
});

test.serial('promise[Symbol.asyncIterator] iteration break waits for the subprocess success', async t => {
	const promise = nanoSpawn(...nodePassThroughPrint);
	let done = false;

	// eslint-disable-next-line no-unreachable-loop
	for await (const line of promise) {
		t.is(line, testString);
		globalThis.setTimeout(async () => {
			const {stdin, stdout} = await promise.nodeChildProcess;
			t.true(stdout.readable);
			t.true(stdin.writable);
			stdin.end(secondTestString);
			done = true;
		}, 1e2);
		break;
	}

	t.true(done);
	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
});

test.serial('promise.stdout iteration exception waits for the subprocess success', async t => {
	const promise = nanoSpawn(...nodePassThroughPrint);
	let done = false;

	const cause = new Error(testString);
	try {
		// eslint-disable-next-line no-unreachable-loop
		for await (const line of promise.stdout) {
			t.is(line, testString);
			globalThis.setTimeout(async () => {
				const {stdin, stdout} = await promise.nodeChildProcess;
				t.true(stdout.readable);
				t.true(stdin.writable);
				stdin.end(secondTestString);
				done = true;
			}, 1e2);
			throw cause;
		}
	} catch (error) {
		t.is(error, cause);
	}

	t.true(done);
	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
});

test.serial('promise[Symbol.asyncIterator] iteration exception waits for the subprocess success', async t => {
	const promise = nanoSpawn(...nodePassThroughPrint);
	let done = false;

	const cause = new Error(testString);
	try {
		// eslint-disable-next-line no-unreachable-loop
		for await (const line of promise) {
			t.is(line, testString);
			globalThis.setTimeout(async () => {
				const {stdin, stdout} = await promise.nodeChildProcess;
				t.true(stdout.readable);
				t.true(stdin.writable);
				stdin.end(secondTestString);
				done = true;
			}, 1e2);
			throw cause;
		}
	} catch (error) {
		t.is(error, cause);
	}

	t.true(done);
	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
});

test.serial('promise.stdout iteration break waits for the subprocess failure', async t => {
	const promise = nanoSpawn(...nodePassThroughPrintFail);
	let done = false;

	let cause;
	try {
		// eslint-disable-next-line no-unreachable-loop
		for await (const line of promise.stdout) {
			t.is(line, testString);
			globalThis.setTimeout(async () => {
				const {stdin, stdout} = await promise.nodeChildProcess;
				t.true(stdout.readable);
				t.true(stdin.writable);
				stdin.end(secondTestString);
				done = true;
			}, 1e2);
			break;
		}
	} catch (error) {
		cause = error;
	}

	t.true(done);
	const error = await t.throwsAsync(promise);
	t.is(error, cause);
	t.is(error.stdout, '');
	t.is(error.output, '');
});

test.serial('promise[Symbol.asyncIterator] iteration break waits for the subprocess failure', async t => {
	const promise = nanoSpawn(...nodePassThroughPrintFail);
	let done = false;

	let cause;
	try {
		// eslint-disable-next-line no-unreachable-loop
		for await (const line of promise) {
			t.is(line, testString);
			globalThis.setTimeout(async () => {
				const {stdin, stdout} = await promise.nodeChildProcess;
				t.true(stdout.readable);
				t.true(stdin.writable);
				stdin.end(secondTestString);
				done = true;
			}, 1e2);
			break;
		}
	} catch (error) {
		cause = error;
	}

	t.true(done);
	const error = await t.throwsAsync(promise);
	t.is(error, cause);
	t.is(error.stdout, '');
	t.is(error.output, '');
});

test.serial('promise.stdout iteration exception waits for the subprocess failure', async t => {
	const promise = nanoSpawn(...nodePassThroughPrintFail);
	let done = false;

	const cause = new Error(testString);
	try {
		// eslint-disable-next-line no-unreachable-loop
		for await (const line of promise.stdout) {
			t.is(line, testString);
			globalThis.setTimeout(async () => {
				const {stdin, stdout} = await promise.nodeChildProcess;
				t.true(stdout.readable);
				t.true(stdin.writable);
				stdin.end(secondTestString);
				done = true;
			}, 1e2);
			throw cause;
		}
	} catch (error) {
		t.is(error, cause);
	}

	t.true(done);
	const error = await t.throwsAsync(promise);
	t.not(error, cause);
	t.is(error.stdout, '');
	t.is(error.output, '');
});

test.serial('promise[Symbol.asyncIterator] iteration exception waits for the subprocess failure', async t => {
	const promise = nanoSpawn(...nodePassThroughPrintFail);
	let done = false;

	const cause = new Error(testString);
	try {
		// eslint-disable-next-line no-unreachable-loop
		for await (const line of promise) {
			t.is(line, testString);
			globalThis.setTimeout(async () => {
				const {stdin, stdout} = await promise.nodeChildProcess;
				t.true(stdout.readable);
				t.true(stdin.writable);
				stdin.end(secondTestString);
				done = true;
			}, 1e2);
			throw cause;
		}
	} catch (error) {
		t.is(error, cause);
	}

	t.true(done);
	const error = await t.throwsAsync(promise);
	t.not(error, cause);
	t.is(error.stdout, '');
	t.is(error.output, '');
});

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

	const {signalName} = await t.throwsAsync(promise);
	t.is(signalName, 'SIGTERM');
});

test('result.command is defined', async t => {
	const {command} = await nanoSpawn('node', ['--version']);
	t.is(command, 'node --version');
});

test('result.command quotes spaces', async t => {
	const {command, stdout} = await nanoSpawn(...nodePrint('". ."'));
	t.is(command, 'node -p \'". ."\'');
	t.is(stdout, '. .');
});

test('result.command quotes single quotes', async t => {
	const {command, stdout} = await nanoSpawn(...nodePrint('"\'"'));
	t.is(command, 'node -p \'"\'\\\'\'"\'');
	t.is(stdout, '\'');
});

test('result.command quotes unusual characters', async t => {
	const {command, stdout} = await nanoSpawn(...nodePrint('","'));
	t.is(command, 'node -p \'","\'');
	t.is(stdout, ',');
});

test('result.command strips ANSI sequences', async t => {
	const {command, stdout} = await nanoSpawn(...nodePrint(`"${red(testString)}"`));
	t.is(command, `node -p '"${testString}"'`);
	t.is(stdout, red(testString));
});

test('result.durationMs is set', async t => {
	const {durationMs} = await nanoSpawn(...nodePrintStdout);
	t.true(Number.isFinite(durationMs));
	t.true(durationMs > 0);
});

test('error.durationMs is set', async t => {
	const {durationMs} = await t.throwsAsync(nanoSpawn('node', ['--unknown']));
	t.true(Number.isFinite(durationMs));
	t.true(durationMs > 0);
});

if (isWindows) {
	const testExe = async (t, shell) => {
		t.is(path.extname(process.execPath), '.exe');
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

	test('.exe detection with explicit file extension', async t => {
		const {stdout} = await nanoSpawn(process.execPath, ['-p', 'process.argv0'], {argv0: testString});
		t.is(stdout, testString);
	});

	test('.exe detection with explicit file extension, case insensitive', async t => {
		const {stdout} = await nanoSpawn(process.execPath.toUpperCase(), ['-p', 'process.argv0'], {argv0: testString});
		t.is(stdout, testString);
	});

	test('.exe detection with file paths without file extension', async t => {
		const {stdout} = await nanoSpawn(process.execPath.replace('.exe', ''), ['-p', 'process.argv0'], {argv0: testString});
		t.is(stdout, testString);
	});

	test('.exe detection with Unix slashes', async t => {
		t.true(process.execPath.endsWith('\\node.exe'));
		const {stdout} = await nanoSpawn(process.execPath.replace('\\node.exe', '/node.exe'), ['-p', 'process.argv0'], {argv0: testString});
		t.is(stdout, testString);
	});

	test('.exe detection with custom Path', async t => {
		const {stdout} = await nanoSpawn(...nodePrintArgv0, {argv0: testString, env: {[pathKey()]: path.dirname(process.execPath)}});
		t.is(stdout, testString);
	});

	test('.exe detection with custom Path and leading ;', async t => {
		const {stdout} = await nanoSpawn(...nodePrintArgv0, {argv0: testString, env: {[pathKey()]: `;${path.dirname(process.execPath)}`}});
		t.is(stdout, testString);
	});

	test('.exe detection with custom Path and double quoting', async t => {
		const {stdout} = await nanoSpawn(...nodePrintArgv0, {argv0: testString, env: {[pathKey()]: `"${path.dirname(process.execPath)}"`}});
		t.is(stdout, testString);
	});

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
		const {exitCode, stderr} = await t.throwsAsync(nanoSpawn('spawnecho', [testString], {
			env: {PATHEXT: '.COM'},
			cwd: FIXTURES_URL,
			shell,
		}));
		t.is(exitCode, 1);
		t.true(stderr.includes('not recognized as an internal or external command'));
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
		const {message, exitCode, signalName, stderr, cause} = await t.throwsAsync(nanoSpawn('./shebang.js', {cwd: FIXTURES_URL}));
		t.is(signalName, undefined);
		t.is(exitCode, 1);
		t.is(message, 'Command failed with exit code 1: ./shebang.js');
		t.true(stderr.includes('not recognized as an internal or external command'));
		t.is(cause, undefined);
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
	const {message, exitCode, signalName, stderr, cause} = await t.throwsAsync(nanoSpawn(nonExistentCommand));

	if (isWindows) {
		t.is(signalName, undefined);
		t.is(exitCode, 1);
		t.is(message, 'Command failed with exit code 1: non-existent-command');
		t.true(stderr.includes('not recognized as an internal or external command'));
		t.is(cause, undefined);
	} else {
		t.is(signalName, undefined);
		t.is(exitCode, undefined);
		t.is(message, 'Command failed: non-existent-command');
		t.is(stderr, '');
		t.true(cause.message.includes(nonExistentCommand));
		t.is(cause.code, 'ENOENT');
		t.is(cause.syscall, 'spawn non-existent-command');
	}
});

test('Handles non-existing command, shell', async t => {
	const {message, exitCode, signalName, stderr, cause} = await t.throwsAsync(nanoSpawn(nonExistentCommand, {shell: true}));

	if (isWindows) {
		t.is(signalName, undefined);
		t.is(exitCode, 1);
		t.is(message, 'Command failed with exit code 1: non-existent-command');
		t.true(stderr.includes('not recognized as an internal or external command'));
		t.is(cause, undefined);
	} else {
		t.is(signalName, undefined);
		t.is(exitCode, 127);
		t.is(message, 'Command failed with exit code 127: non-existent-command');
		t.true(stderr.includes('not found'));
		t.is(cause, undefined);
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
test('options.preferLocal true runs local npm binaries with options.cwd string', testLocalBinaryExec, './fixtures');
test('options.preferLocal true runs local npm binaries with options.cwd URL', testLocalBinaryExec, FIXTURES_URL);

if (!isWindows) {
	const testPathVariable = async (t, pathName) => {
		const {stdout} = await nanoSpawn(...localBinary, {preferLocal: true, env: {Path: undefined, [pathName]: path.dirname(process.execPath)}});
		t.regex(stdout, VERSION_REGEXP);
	};

	test('options.preferLocal true uses options.env.PATH when set', testPathVariable, 'PATH');
	test('options.preferLocal true uses options.env.Path when set', testPathVariable, 'Path');
}

const testNoLocal = async (t, preferLocal) => {
	const PATH = process.env[pathKey()]
		.split(path.delimiter)
		.filter(pathPart => !pathPart.includes(path.join('node_modules', '.bin')))
		.join(path.delimiter);
	const {stderr, cause} = await t.throwsAsync(nanoSpawn(...localBinary, {preferLocal, env: {Path: undefined, PATH}}));
	if (isWindows) {
		t.true(stderr.includes('\'ava\' is not recognized as an internal or external command'));
	} else {
		t.is(cause.code, 'ENOENT');
		t.is(cause.path, localBinary[0]);
	}
};

test('options.preferLocal undefined does not run local npm binaries', testNoLocal, undefined);
test('options.preferLocal false does not run local npm binaries', testNoLocal, false);

test('options.preferLocal true uses options.env when empty', async t => {
	const {exitCode, stderr, cause} = await t.throwsAsync(nanoSpawn(...localBinary, {preferLocal: true, env: {PATH: undefined, Path: undefined}}));
	if (isWindows) {
		t.is(cause.code, 'ENOENT');
	} else {
		t.is(exitCode, 127);
		t.true(stderr.includes('No such file'));
	}
});

if (isWindows) {
	test('options.preferLocal true runs local npm binaries with process.env.Path', async t => {
		const {stdout} = await nanoSpawn(...localBinary, {preferLocal: true, env: {PATH: undefined, Path: process.env[pathKey()]}});
		t.regex(stdout, VERSION_REGEXP);
	});
}

test('options.preferLocal true does not add node_modules/.bin if already present', async t => {
	const localDirectory = fileURLToPath(new URL('node_modules/.bin', import.meta.url));
	const currentPath = process.env[pathKey()];
	const pathValue = `${localDirectory}${path.delimiter}${currentPath}`;
	const {stdout} = await nanoSpawn('node', ['-p', `process.env.${pathKey()}`], {preferLocal: true, env: {[pathKey()]: pathValue}});
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

test('Keeps Node flags', async t => {
	const {stdout} = await nanoSpawn('node', [nodeCliFlag, 'node-flags.js'], {cwd: FIXTURES_URL});
	t.true(stdout.includes(nodeCliFlag));
});

test('Does not keep --inspect* Node flags', async t => {
	const {stdout} = await nanoSpawn('node', [nodeCliFlag, inspectCliFlag, 'node-flags.js'], {cwd: FIXTURES_URL});
	t.true(stdout.includes(nodeCliFlag));
	t.false(stdout.includes(inspectCliFlag));
});

test('Does not keep Node flags, full path', async t => {
	const {stdout} = await nanoSpawn('node', [nodeCliFlag, 'node-flags-path.js'], {cwd: FIXTURES_URL});
	t.false(stdout.includes(nodeCliFlag));
});

if (isWindows) {
	test('Keeps Node flags, node.exe', async t => {
		const {stdout} = await nanoSpawn('node.exe', [nodeCliFlag, 'node-flags.js'], {cwd: FIXTURES_URL});
		t.true(stdout.includes(nodeCliFlag));
	});

	test('Keeps Node flags, case-insensitive', async t => {
		const {stdout} = await nanoSpawn('NODE', [nodeCliFlag, 'node-flags.js'], {cwd: FIXTURES_URL});
		t.true(stdout.includes(nodeCliFlag));
	});
}

const TEST_NODE_VERSION = '18.0.0';

test.serial('Keeps Node version', async t => {
	const {path: nodePath} = await getNode(TEST_NODE_VERSION);
	t.not(nodePath, process.execPath);
	const {stdout} = await nanoSpawn(nodePath, ['node-version.js'], {cwd: FIXTURES_URL});
	t.is(stdout, `v${TEST_NODE_VERSION}`);
});

test('.pipe() success', async t => {
	const {stdout, output, command, durationMs} = await nanoSpawn(...nodePrintStdout)
		.pipe(...nodeToUpperCase);
	t.is(stdout, testUpperCase);
	t.is(output, stdout);
	t.is(getPipeSize(command), 2);
	t.true(durationMs > 0);
});

test('.pipe() source fails', async t => {
	const {exitCode, stdout, output, command, durationMs} = await t.throwsAsync(nanoSpawn(...nodePrintFail)
		.pipe(...nodeToUpperCase));
	t.is(exitCode, 2);
	t.is(stdout, testString);
	t.is(output, stdout);
	t.is(getPipeSize(command), 1);
	t.true(durationMs > 0);
});

test('.pipe() source fails due to child_process invalid option', async t => {
	const {exitCode, cause, command, durationMs} = await t.throwsAsync(nanoSpawn(...nodePrintStdout, {detached: 'true'})
		.pipe(...nodeToUpperCase));
	t.is(exitCode, undefined);
	t.true(cause.message.includes('options.detached'));
	t.is(getPipeSize(command), 1);
	t.true(durationMs > 0);
});

test('.pipe() source fails due to stream error', async t => {
	const first = nanoSpawn(...nodePrintStdout);
	const second = first.pipe(...nodeToUpperCase);
	const error = new Error(testString);
	const subprocess = await first.nodeChildProcess;
	subprocess.stdout.destroy(error);
	const {exitCode, signalName, message, cause} = await t.throwsAsync(second);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(message.startsWith(messageEvalFailStart));
	t.is(cause, error);
});

test('.pipe() destination fails', async t => {
	const {exitCode, stdout, command, durationMs} = await t.throwsAsync(nanoSpawn(...nodePrintStdout)
		.pipe(...nodeToUpperCaseFail));
	t.is(exitCode, 2);
	t.is(stdout, testUpperCase);
	t.is(getPipeSize(command), 2);
	t.true(durationMs > 0);
});

test('.pipe() destination fails due to child_process invalid option', async t => {
	const {exitCode, cause, command, durationMs} = await t.throwsAsync(nanoSpawn(...nodePrintStdout)
		.pipe(...nodeToUpperCase, {detached: 'true'}));
	t.is(exitCode, undefined);
	t.true(cause.message.includes('options.detached'));
	t.is(getPipeSize(command), 2);
	t.true(durationMs > 0);
});

test('.pipe() destination fails due to stream error', async t => {
	const first = nanoSpawn(...nodePrintStdout);
	const second = first.pipe(...nodeToUpperCase);
	const error = new Error(testString);
	const subprocess = await second.nodeChildProcess;
	subprocess.stdin.destroy(error);
	const {exitCode, signalName, message, cause} = await t.throwsAsync(second);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(message.startsWith(messageEvalFailStart));
	t.is(cause, error);
});

test('.pipe() source and destination fail', async t => {
	const {exitCode, stdout, command, durationMs} = await t.throwsAsync(nanoSpawn(...nodePrintFail)
		.pipe(...nodeToUpperCaseFail));
	t.is(exitCode, 2);
	t.is(stdout, testString);
	t.is(getPipeSize(command), 1);
	t.true(durationMs > 0);
});

test('.pipe().pipe() success', async t => {
	const first = nanoSpawn(...nodePrintStdout)
		.pipe(...nodeToUpperCase);
	const secondResult = await first.pipe(...nodeDouble);
	const firstResult = await first;
	t.is(firstResult.stdout, testUpperCase);
	t.is(firstResult.output, firstResult.stdout);
	t.is(secondResult.stdout, testDoubleUpperCase);
	t.is(secondResult.output, secondResult.stdout);
	t.is(getPipeSize(firstResult.command), 2);
	t.is(getPipeSize(secondResult.command), 3);
	t.true(firstResult.durationMs > 0);
	t.true(secondResult.durationMs > firstResult.durationMs);
});

test('.pipe().pipe() first source fail', async t => {
	const first = nanoSpawn(...nodePrintFail)
		.pipe(...nodeToUpperCase);
	const secondResult = await t.throwsAsync(first.pipe(...nodeDouble));
	const firstResult = await t.throwsAsync(first);
	t.is(firstResult, secondResult);
	t.is(firstResult.stdout, testString);
	t.is(firstResult.output, firstResult.stdout);
	t.is(getPipeSize(firstResult.command), 1);
	t.true(firstResult.durationMs > 0);
});

test('.pipe().pipe() second source fail', async t => {
	const first = nanoSpawn(...nodePrintStdout)
		.pipe(...nodeToUpperCaseFail);
	const secondResult = await t.throwsAsync(first.pipe(...nodeDouble));
	const firstResult = await t.throwsAsync(first);
	t.is(firstResult, secondResult);
	t.is(firstResult.stdout, testUpperCase);
	t.is(firstResult.output, firstResult.stdout);
	t.is(getPipeSize(firstResult.command), 2);
	t.true(firstResult.durationMs > 0);
});

test('.pipe().pipe() destination fail', async t => {
	const first = nanoSpawn(...nodePrintStdout)
		.pipe(...nodeToUpperCase);
	const secondResult = await t.throwsAsync(first.pipe(...nodeDoubleFail));
	const firstResult = await first;
	t.not(firstResult, secondResult);
	t.is(firstResult.stdout, testUpperCase);
	t.is(firstResult.output, firstResult.stdout);
	t.is(secondResult.stdout, testDoubleUpperCase);
	t.is(secondResult.output, secondResult.stdout);
	t.is(getPipeSize(firstResult.command), 2);
	t.is(getPipeSize(secondResult.command), 3);
	t.true(firstResult.durationMs > 0);
	t.true(secondResult.durationMs > 0);
});

test('.pipe().pipe() all fail', async t => {
	const first = nanoSpawn(...nodePrintFail)
		.pipe(...nodeToUpperCaseFail);
	const secondResult = await t.throwsAsync(first.pipe(...nodeDoubleFail));
	const firstResult = await t.throwsAsync(first);
	t.is(firstResult, secondResult);
	t.is(firstResult.stdout, testString);
	t.is(firstResult.output, firstResult.stdout);
	t.is(getPipeSize(firstResult.command), 1);
	t.true(firstResult.durationMs > 0);
});

// Cannot guarantee that `cat` exists on Windows
if (!isWindows) {
	test('.pipe() without arguments', async t => {
		const {stdout} = await nanoSpawn(...nodePrintStdout)
			.pipe('cat');
		t.is(stdout, testString);
	});
}

test('.pipe() with options', async t => {
	const argv0 = 'Foo';
	const {stdout} = await nanoSpawn(...nodePrintStdout)
		.pipe(...nodeEval(`process.stdin.on("data", chunk => {
				console.log(chunk.toString().trim() + process.argv0);
			});`), {argv0});
	t.is(stdout, `${testString}${argv0}`);
});

test.serial('.pipe() which does not read stdin, source ends first', async t => {
	const {stdout, output} = await nanoSpawn(...nodePrintStdout)
		.pipe(...nodePrintSleep);
	t.is(stdout, testString);
	t.is(output, stdout);
});

test.serial('.pipe() which does not read stdin, source fails first', async t => {
	const {stdout, output} = await t.throwsAsync(nanoSpawn(...nodePrintFail)
		.pipe(...nodePrintSleep));
	t.is(stdout, testString);
	t.is(output, stdout);
});

test.serial('.pipe() which does not read stdin, source ends last', async t => {
	const {stdout, output} = await nanoSpawn(...nodePrintSleep)
		.pipe(...nodePrintStdout);
	t.is(stdout, testString);
	t.is(output, stdout);
});

test.serial('.pipe() which does not read stdin, source fails last', async t => {
	const {stdout, output} = await t.throwsAsync(nanoSpawn(...nodePrintStdout)
		.pipe(...nodePrintSleepFail));
	t.is(stdout, testString);
	t.is(output, stdout);
});

test('.pipe() which has hanging stdin', async t => {
	const {signalName, command, stdout, output} = await t.throwsAsync(nanoSpawn('node', {timeout: 1e3})
		.pipe(...nodePassThrough));
	t.is(signalName, 'SIGTERM');
	t.is(command, 'node');
	t.is(stdout, '');
	t.is(output, '');
});

test('.pipe() with stdin stream in source', async t => {
	const stream = createReadStream(testFixtureUrl);
	await once(stream, 'open');
	const {stdout} = await nanoSpawn(...nodePassThrough, {stdin: stream})
		.pipe(...nodeToUpperCase);
	t.is(stdout, testUpperCase);
});

test('.pipe() with stdin stream in destination', async t => {
	const stream = createReadStream(testFixtureUrl);
	await once(stream, 'open');
	await t.throwsAsync(
		nanoSpawn(...nodePassThrough)
			.pipe(...nodeToUpperCase, {stdin: stream}),
		{message: 'The "stdin" option must be set on the first "nanoSpawn()" call in the pipeline.'});
});

test('.pipe() with stdout stream in destination', async t => {
	await temporaryWriteTask('', async temporaryPath => {
		const stream = createWriteStream(temporaryPath);
		await once(stream, 'open');
		const {stdout} = await nanoSpawn(...nodePrintStdout)
			.pipe(...nodePassThrough, {stdout: stream});
		t.is(stdout, '');
		t.is(await readFile(temporaryPath, 'utf8'), `${testString}\n`);
	});
});

test('.pipe() with stdout stream in source', async t => {
	await temporaryWriteTask('', async temporaryPath => {
		const stream = createWriteStream(temporaryPath);
		await once(stream, 'open');
		await t.throwsAsync(
			nanoSpawn(...nodePrintStdout, {stdout: stream})
				.pipe(...nodePassThrough),
			{message: 'The "stdout" option must be set on the last "nanoSpawn()" call in the pipeline.'},
		);
	});
});

test('.pipe() + stdout/stderr iteration', async t => {
	const promise = nanoSpawn(...nodePrintStdout)
		.pipe(...nodeToUpperCase);
	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, [testUpperCase]);
	const {stdout, stderr, output} = await promise;
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test('.pipe() + stdout iteration', async t => {
	const promise = nanoSpawn(...nodePrintStdout)
		.pipe(...nodeToUpperCase);
	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, [testUpperCase]);
	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
});

test('.pipe() + stderr iteration', async t => {
	const promise = nanoSpawn(...nodePrintStdout)
		.pipe(...nodeToUpperCaseStderr);
	const lines = await arrayFromAsync(promise.stderr);
	t.deepEqual(lines, [testUpperCase]);
	const {stderr, output} = await promise;
	t.is(stderr, '');
	t.is(output, '');
});

test('.pipe() + stdout iteration, source fail', async t => {
	const promise = nanoSpawn(...nodePrintFail)
		.pipe(...nodeToUpperCase);
	const {exitCode, stdout, message, command, durationMs} = await t.throwsAsync(arrayFromAsync(promise.stdout));
	t.is(exitCode, 2);
	t.is(stdout, testString);
	t.true(message.startsWith(messageExitEvalFailStart));
	t.true(command.startsWith(commandEvalFailStart));
	t.true(durationMs > 0);
	const error = await t.throwsAsync(promise);
	t.is(error.stdout, testString);
	t.is(error.output, error.stdout);
});

test('.pipe() + stdout iteration, destination fail', async t => {
	const promise = nanoSpawn(...nodePrintStdout)
		.pipe(...nodeToUpperCaseFail);
	const {exitCode, stdout, message, command, durationMs} = await t.throwsAsync(arrayFromAsync(promise.stdout));
	t.is(exitCode, 2);
	t.is(stdout, '');
	t.true(message.startsWith(messageExitEvalFailStart));
	t.true(command.startsWith(commandEvalFailStart));
	t.true(durationMs > 0);
	const error = await t.throwsAsync(promise);
	t.is(error.stdout, '');
	t.is(error.output, '');
});

test('.pipe() with EPIPE', async t => {
	const promise = nanoSpawn(...nodeEval(`setInterval(() => {
	console.log("${testString}");
}, 0);
process.stdout.on("error", () => {
	process.exit();
});`))
		.pipe('head', ['-n', '2']);
	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, [testString, testString]);
	const {stdout, output} = await promise;
	t.is(stdout, '');
	t.is(output, '');
});
