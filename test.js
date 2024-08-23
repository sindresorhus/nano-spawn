import path from 'node:path';
import process from 'node:process';
import {setTimeout} from 'node:timers/promises';
import test from 'ava';
import nanoSpawn from './index.js';

const isWindows = process.platform === 'win32';
const FIXTURES_URL = new URL('fixtures', import.meta.url);

// TODO: replace with Array.fromAsync() after dropping support for Node <22.0.0
const arrayFromAsync = async asyncIterable => {
	const chunks = [];
	for await (const chunk of asyncIterable) {
		chunks.push(chunk);
	}

	return chunks;
};

const testString = 'test';

test('can pass options.argv0', async t => {
	const {stdout} = await nanoSpawn('node', ['-p', 'process.argv0'], {argv0: testString});
	t.is(stdout, testString);
});

test('can pass options object without any arguments', async t => {
	const {exitCode, signalName} = await nanoSpawn('node', {timeout: 1});
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
});

test('result.exitCode|signalName on success', async t => {
	const {exitCode, signalName} = await nanoSpawn('node', ['--version']);
	t.is(exitCode, 0);
	t.is(signalName, undefined);
});

test('result.exitCode|signalName on non-0 exit code', async t => {
	const {exitCode, signalName} = await nanoSpawn('node', ['-e', 'process.exit(2)']);
	t.is(exitCode, 2);
	t.is(signalName, undefined);
});

test('result.exitCode|signalName on signal termination', async t => {
	const {exitCode, signalName} = await nanoSpawn('node', {timeout: 1});
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
});

test('result.exitCode|signalName on invalid child_process options', t => {
	const {exitCode, signalName} = t.throws(() => nanoSpawn('node', ['--version'], {detached: 'true'}));
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
});

test('result.exitCode|signalName on "error" event before spawn', async t => {
	const {exitCode, signalName} = await t.throwsAsync(nanoSpawn('non-existent-command'));
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
});

test('result.exitCode|signalName on "error" event after spawn', async t => {
	const {exitCode, signalName} = await t.throwsAsync(nanoSpawn('node', {signal: AbortSignal.abort()}));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
});

test('result.stdout is set', async t => {
	const {stdout, stderr} = await nanoSpawn('node', ['-e', 'console.log(".")']);
	t.is(stdout, '.');
	t.is(stderr, '');
});

test('result.stderr is set', async t => {
	const {stdout, stderr} = await nanoSpawn('node', ['-e', 'console.error(".")']);
	t.is(stdout, '');
	t.is(stderr, '.');
});

test('result.stdout strips Windows newline', async t => {
	const {stdout} = await nanoSpawn('node', ['-e', 'process.stdout.write(".\\r\\n")']);
	t.is(stdout, '.');
});

test('result.stderr strips Windows newline', async t => {
	const {stderr} = await nanoSpawn('node', ['-e', 'process.stderr.write(".\\r\\n")']);
	t.is(stderr, '.');
});

const multibyteString = '.\u{1F984}.';
const multibyteUint8Array = new TextEncoder().encode(multibyteString);
const multibyteFirstHalf = multibyteUint8Array.slice(0, 3);
const multibyteSecondHalf = multibyteUint8Array.slice(3);

test.serial('result.stdout works with multibyte sequences', async t => {
	const promise = nanoSpawn('node', ['-e', 'process.stdin.pipe(process.stdout)']);
	promise.subprocess.stdin.write(multibyteFirstHalf);
	await setTimeout(1e2);
	promise.subprocess.stdin.end(multibyteSecondHalf);
	const {stdout} = await promise;
	t.is(stdout, multibyteString);
});

test('promise.stdout can be iterated', async t => {
	const promise = nanoSpawn('node', ['-e', 'console.log("a\\nb")']);

	const lines = await arrayFromAsync(promise.stdout);
	t.deepEqual(lines, ['a', 'b']);

	const {stdout} = await promise;
	t.is(stdout, 'a\nb');
});

test('promise.stderr can be iterated', async t => {
	const promise = nanoSpawn('node', ['-e', 'console.error("a\\nb")']);

	const lines = await arrayFromAsync(promise.stderr);
	t.deepEqual(lines, ['a', 'b']);

	const {stderr} = await promise;
	t.is(stderr, 'a\nb');
});

test('promise can be iterated with both stdout and stderr', async t => {
	const promise = nanoSpawn('node', ['-e', 'console.log("a"); console.error("b"); console.log("c"); console.error("d");']);

	const lines = await arrayFromAsync(promise);
	t.deepEqual(lines, ['a', 'b', 'c', 'd']);

	const {stdout, stderr} = await promise;
	t.is(stdout, 'a\nc');
	t.is(stderr, 'b\nd');
});

test('stdout handles no newline at the end', async t => {
	const result = nanoSpawn('node', ['-e', 'process.stdout.write("Hello\\nWorld")']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World']);
});

test('stdout handles newline at the end', async t => {
	const result = nanoSpawn('node', ['-e', 'process.stdout.write("Hello\\nWorld\\n")']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World']);
});

test('stdout handles 2 newlines at the end', async t => {
	const result = nanoSpawn('node', ['-e', 'process.stdout.write("Hello\\nWorld\\n\\n")']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World', '']);
});

test('stdout handles Windows newlines', async t => {
	const result = nanoSpawn('node', ['-e', 'process.stdout.write("Hello\\r\\nWorld")']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World']);
});

test('stdout handles Windows newline at the end', async t => {
	const result = nanoSpawn('node', ['-e', 'process.stdout.write("Hello\\r\\nWorld\\r\\n")']);
	const lines = await arrayFromAsync(result.stdout);
	t.deepEqual(lines, ['Hello', 'World']);
});

test('returns a promise', async t => {
	const result = nanoSpawn('node', ['--version']);
	t.false(Object.prototype.propertyIsEnumerable.call(result, 'then'));
	t.false(Object.hasOwn(result, 'then'));
	t.true(result instanceof Promise);
	await result;
});

test('promise.subprocess is set', async t => {
	const promise = nanoSpawn('node');
	promise.subprocess.kill();

	const {exitCode} = await promise;
	t.is(exitCode, undefined);
});

test('Handles stdout error', async t => {
	const promise = nanoSpawn('node', ['--version']);
	const error = new Error(testString);
	promise.subprocess.stdout.emit('error', error);
	t.is(await t.throwsAsync(promise), error);
});

test('Handles stderr error', async t => {
	const promise = nanoSpawn('node', ['--version']);
	const error = new Error(testString);
	promise.subprocess.stderr.emit('error', error);
	t.is(await t.throwsAsync(promise), error);
});

if (isWindows) {
	test('Can run .exe file', async t => {
		t.is(path.extname(process.execPath), '.exe');
		const {stdout} = await nanoSpawn(process.execPath, ['-e', 'console.log(".")']);
		t.is(stdout, '.');
	});

	test('Cannot run .cmd file without options.shell', t => {
		const {code, syscall} = t.throws(() => nanoSpawn('test.cmd', {cwd: FIXTURES_URL, shell: false}));
		t.is(code, 'EINVAL');
		t.is(syscall, 'spawn');
	});

	test('Can run .cmd file with options.shell', async t => {
		const {stdout} = await nanoSpawn('test.cmd', {cwd: FIXTURES_URL, shell: true});
		t.true(stdout.endsWith(testString));
	});

	test('Ignores PATHEXT without options.shell', async t => {
		t.is(path.extname(process.execPath), '.exe');
		const {stdout} = await nanoSpawn(process.execPath.slice(0, -4), ['-e', 'console.log(".")'], {
			env: {...process.env, PATHEXT: '.COM'},
			shell: false,
		});
		t.is(stdout, '.');
	});

	test('Uses PATHEXT with options.shell', async t => {
		t.is(path.extname(process.execPath), '.exe');
		const {exitCode, stderr} = await nanoSpawn(process.execPath.slice(0, -4), ['-e', 'console.log(".")'], {
			env: {...process.env, PATHEXT: '.COM'},
			shell: true,
		});
		t.is(exitCode, 1);
		t.true(stderr.includes('not recognized as an internal or external command'));
	});
} else {
	test('Can run shebangs', async t => {
		const {stdout} = await nanoSpawn('./shebang.js', {cwd: FIXTURES_URL});
		t.is(stdout, testString);
	});
}

test('Handles non-existing command without options.shell', async t => {
	const {code, syscall} = await t.throwsAsync(nanoSpawn('non-existent-command', {shell: false}));
	t.is(code, 'ENOENT');
	t.is(syscall, 'spawn non-existent-command');
});

test('Handles non-existing command with options.shell', async t => {
	const {exitCode, stderr} = await nanoSpawn('non-existent-command', {shell: true});
	if (isWindows) {
		t.is(exitCode, 1);
		t.true(stderr.includes('not recognized as an internal or external command'));
	} else {
		t.is(exitCode, 127);
		t.true(stderr.includes('not found'));
	}
});

test('Can run global npm binaries', async t => {
	const {stdout} = await nanoSpawn('npm', ['--version'], {shell: isWindows});
	t.regex(stdout, /^\d+\.\d+\.\d+/);
});

test('Can run OS binaries', async t => {
	const {stdout} = await nanoSpawn('git', ['--version']);
	t.regex(stdout, /^git version \d+\.\d+\.\d+/);
});
