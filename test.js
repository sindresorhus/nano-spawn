import path from 'node:path';
import process from 'node:process';
import {setTimeout} from 'node:timers/promises';
import test from 'ava';
import {red} from 'yoctocolors';
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

test('can pass options.stdin', async t => {
	const promise = nanoSpawn('node', ['--version'], {stdin: 'ignore'});
	t.is(promise.subprocess.stdin, null);
	await promise;
});

test('can pass options.stdout', async t => {
	const promise = nanoSpawn('node', ['--version'], {stdout: 'ignore'});
	t.is(promise.subprocess.stdout, null);
	await promise;
});

test('can pass options.stderr', async t => {
	const promise = nanoSpawn('node', ['--version'], {stderr: 'ignore'});
	t.is(promise.subprocess.stderr, null);
	await promise;
});

test('can pass options.stdio array', async t => {
	const promise = nanoSpawn('node', ['--version'], {stdio: ['ignore', 'pipe', 'pipe', 'pipe']});
	t.is(promise.subprocess.stdin, null);
	t.not(promise.subprocess.stdout, null);
	t.not(promise.subprocess.stderr, null);
	t.not(promise.subprocess.stdio[3], null);
	await promise;
});

test('can pass options.stdio string', async t => {
	const promise = nanoSpawn('node', ['--version'], {stdio: 'ignore'});
	t.is(promise.subprocess.stdin, null);
	t.is(promise.subprocess.stdout, null);
	t.is(promise.subprocess.stderr, null);
	t.is(promise.subprocess.stdio.length, 3);
	await promise;
});

test('options.stdio array has priority over options.stdout', async t => {
	const promise = nanoSpawn('node', ['--version'], {stdio: ['pipe', 'pipe', 'pipe'], stdout: 'ignore'});
	t.not(promise.subprocess.stdout, null);
	await promise;
});

test('options.stdio string has priority over options.stdout', async t => {
	const promise = nanoSpawn('node', ['--version'], {stdio: 'pipe', stdout: 'ignore'});
	t.not(promise.subprocess.stdout, null);
	await promise;
});

test('can pass options object without any arguments', async t => {
	const {exitCode, signalName} = await t.throwsAsync(nanoSpawn('node', {timeout: 1}));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
});

test('result.exitCode|signalName on success', async t => {
	const {exitCode, signalName} = await nanoSpawn('node', ['--version']);
	t.is(exitCode, 0);
	t.is(signalName, undefined);
});

test('error on non-0 exit code', async t => {
	const {exitCode, signalName, message, cause} = await t.throwsAsync(nanoSpawn('node', ['-e', 'process.exit(2)']));
	t.is(exitCode, 2);
	t.is(signalName, undefined);
	t.is(message, 'Command failed with exit code 2: node -e \'process.exit(2)\'');
	t.is(cause, undefined);
});

test('error on signal termination', async t => {
	const {exitCode, signalName, message, cause} = await t.throwsAsync(nanoSpawn('node', {timeout: 1}));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
	t.is(message, 'Command was terminated with SIGTERM: node');
	t.is(cause, undefined);
});

test('error on invalid child_process options', t => {
	const {exitCode, signalName, message, cause} = t.throws(() => nanoSpawn('node', ['--version'], {detached: 'true'}));
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(message.includes('options.detached'));
	t.false(message.includes('Command'));
	t.is(cause, undefined);
});

test('error on "error" event before spawn', async t => {
	const {exitCode, signalName, message, cause} = await t.throwsAsync(nanoSpawn('non-existent-command'));
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.is(message, 'Command failed: non-existent-command');
	t.true(cause.message.includes('non-existent-command'));
});

test('error on "error" event after spawn', async t => {
	const error = new Error(testString);
	const {exitCode, signalName, message, cause} = await t.throwsAsync(nanoSpawn('node', {signal: AbortSignal.abort(error)}));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
	t.is(message, 'Command failed: node');
	t.is(cause.message, 'The operation was aborted');
	t.is(cause.cause, error);
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

test('error.stdout is set', async t => {
	const {exitCode, stdout, stderr} = await t.throwsAsync(nanoSpawn('node', ['-e', 'console.log("."); process.exit(2);']));
	t.is(exitCode, 2);
	t.is(stdout, '.');
	t.is(stderr, '');
});

test('error.stderr is set', async t => {
	const {exitCode, stdout, stderr} = await t.throwsAsync(nanoSpawn('node', ['-e', 'console.error("."); process.exit(2);']));
	t.is(exitCode, 2);
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

test('result.stdout is undefined if options.stdout "ignore"', async t => {
	const {stdout, stderr} = await nanoSpawn('node', ['-e', 'console.log("."); console.error(".");'], {stdout: 'ignore'});
	t.is(stdout, undefined);
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

test('promise.stdout has no iterations if options.stdout "ignore"', async t => {
	const promise = nanoSpawn('node', ['-e', 'console.log("."); console.error(".");'], {stdout: 'ignore'});
	const [stdoutLines, stderrLines] = await Promise.all([arrayFromAsync(promise.stdout), arrayFromAsync(promise.stderr)]);
	t.deepEqual(stdoutLines, []);
	t.deepEqual(stderrLines, ['.']);

	const {stdout, stderr} = await promise;
	t.is(stdout, undefined);
	t.is(stderr, '.');
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

	const {signalName} = await t.throwsAsync(promise);
	t.is(signalName, 'SIGTERM');
});

test('Handles stdout error', async t => {
	const promise = nanoSpawn('node', ['--version']);
	const error = new Error(testString);
	promise.subprocess.stdout.emit('error', error);
	const {cause} = await t.throwsAsync(promise);
	t.is(cause, error);
});

test('Handles stderr error', async t => {
	const promise = nanoSpawn('node', ['--version']);
	const error = new Error(testString);
	promise.subprocess.stderr.emit('error', error);
	const {cause} = await t.throwsAsync(promise);
	t.is(cause, error);
});

test('result.command is defined', async t => {
	const {command} = await nanoSpawn('node', ['--version']);
	t.is(command, 'node --version');
});

test('result.command quotes spaces', async t => {
	const {command, stdout} = await nanoSpawn('node', ['-p', '". ."']);
	t.is(command, 'node -p \'". ."\'');
	t.is(stdout, '. .');
});

test('result.command quotes single quotes', async t => {
	const {command, stdout} = await nanoSpawn('node', ['-p', '"\'"']);
	t.is(command, 'node -p \'"\'\\\'\'"\'');
	t.is(stdout, '\'');
});

test('result.command quotes unusual characters', async t => {
	const {command, stdout} = await nanoSpawn('node', ['-p', '","']);
	t.is(command, 'node -p \'","\'');
	t.is(stdout, ',');
});

test('result.command strips ANSI sequences', async t => {
	const {command, stdout} = await nanoSpawn('node', ['-p', `"${red('.')}"`]);
	t.is(command, 'node -p \'"."\'');
	t.is(stdout, red('.'));
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
		const {exitCode, stderr} = await t.throwsAsync(nanoSpawn(process.execPath.slice(0, -4), ['-e', 'console.log(".")'], {
			env: {...process.env, PATHEXT: '.COM'},
			shell: true,
		}));
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
	const {cause} = await t.throwsAsync(nanoSpawn('non-existent-command', {shell: false}));
	t.is(cause.code, 'ENOENT');
	t.is(cause.syscall, 'spawn non-existent-command');
});

test('Handles non-existing command with options.shell', async t => {
	const {exitCode, stderr} = await t.throwsAsync(nanoSpawn('non-existent-command', {shell: true}));
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
