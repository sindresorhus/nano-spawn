import path from 'node:path';
import process from 'node:process';
import {setTimeout} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import pathKey from 'path-key';
import {red} from 'yoctocolors';
import nanoSpawn from './index.js';

const isWindows = process.platform === 'win32';
const FIXTURES_URL = new URL('fixtures', import.meta.url);
const fixturesPath = fileURLToPath(FIXTURES_URL);

// TODO: replace with Array.fromAsync() after dropping support for Node <22.0.0
const arrayFromAsync = async asyncIterable => {
	const chunks = [];
	for await (const chunk of asyncIterable) {
		chunks.push(chunk);
	}

	return chunks;
};

const testString = 'test';

test('Can pass options.argv0', async t => {
	const {stdout} = await nanoSpawn('node', ['-p', 'process.argv0'], {argv0: testString});
	t.is(stdout, testString);
});

test('Can pass options.argv0, shell', async t => {
	const {stdout} = await nanoSpawn('node', ['-p', 'process.argv0'], {argv0: testString, shell: true});
	t.is(stdout, 'node');
});

test('Can pass options.stdin', async t => {
	const promise = nanoSpawn('node', ['--version'], {stdin: 'ignore'});
	t.is(promise.subprocess.stdin, null);
	await promise;
});

test('Can pass options.stdout', async t => {
	const promise = nanoSpawn('node', ['--version'], {stdout: 'ignore'});
	t.is(promise.subprocess.stdout, null);
	await promise;
});

test('Can pass options.stderr', async t => {
	const promise = nanoSpawn('node', ['--version'], {stderr: 'ignore'});
	t.is(promise.subprocess.stderr, null);
	await promise;
});

test('Can pass options.stdio array', async t => {
	const promise = nanoSpawn('node', ['--version'], {stdio: ['ignore', 'pipe', 'pipe', 'pipe']});
	t.is(promise.subprocess.stdin, null);
	t.not(promise.subprocess.stdout, null);
	t.not(promise.subprocess.stderr, null);
	t.not(promise.subprocess.stdio[3], null);
	await promise;
});

test('Can pass options.stdio string', async t => {
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

test('options.stdin can be {string: string}', async t => {
	const {stdout} = await nanoSpawn('node', ['-e', 'process.stdin.pipe(process.stdout)'], {stdin: {string: testString}});
	t.is(stdout, testString);
});

test('options.stdio[0] can be {string: string}', async t => {
	const {stdout} = await nanoSpawn('node', ['-e', 'process.stdin.pipe(process.stdout)'], {stdio: [{string: testString}, 'pipe', 'pipe']});
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
	const {exitCode, signalName} = await t.throwsAsync(nanoSpawn('node', {timeout: 1}));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
});

test('result.exitCode|signalName on success', async t => {
	const {exitCode, signalName} = await nanoSpawn('node', ['--version']);
	t.is(exitCode, 0);
	t.is(signalName, undefined);
});

test('Error on non-0 exit code', async t => {
	const {exitCode, signalName, message, cause} = await t.throwsAsync(nanoSpawn('node', ['-e', 'process.exit(2)']));
	t.is(exitCode, 2);
	t.is(signalName, undefined);
	t.is(message, 'Command failed with exit code 2: node -e \'process.exit(2)\'');
	t.is(cause, undefined);
});

test('Error on signal termination', async t => {
	const {exitCode, signalName, message, cause} = await t.throwsAsync(nanoSpawn('node', {timeout: 1}));
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
	t.is(message, 'Command was terminated with SIGTERM: node');
	t.is(cause, undefined);
});

test('Error on invalid child_process options', t => {
	const {exitCode, signalName, message, cause} = t.throws(() => nanoSpawn('node', ['--version'], {detached: 'true'}));
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(message.includes('options.detached'));
	t.false(message.includes('Command'));
	t.is(cause, undefined);
});

test('Error on "error" event before spawn', async t => {
	const {stderr, cause} = await t.throwsAsync(nanoSpawn('non-existent-command'));

	if (isWindows) {
		t.true(stderr.includes('not recognized as an internal or external command'));
	} else {
		t.is(cause.code, 'ENOENT');
	}
});

test('Error on "error" event after spawn', async t => {
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

test('Returns a promise', async t => {
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

test('result.durationMs is set', async t => {
	const {durationMs} = await nanoSpawn('node', ['--version']);
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
		const {stdout} = await nanoSpawn('node', ['-p', 'process.argv0'], {argv0: testString});
		t.is(stdout, testString);
	});

	test('.exe can use shell', async t => {
		const {stdout} = await nanoSpawn('node', ['-p', 'process.argv0'], {argv0: testString, shell: true});
		t.is(stdout, 'node');
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
		const {stdout} = await nanoSpawn('node', ['-p', 'process.argv0'], {argv0: testString, env: {[pathKey()]: path.dirname(process.execPath)}});
		t.is(stdout, testString);
	});

	test('.exe detection with custom Path and leading ;', async t => {
		const {stdout} = await nanoSpawn('node', ['-p', 'process.argv0'], {argv0: testString, env: {[pathKey()]: `;${path.dirname(process.execPath)}`}});
		t.is(stdout, testString);
	});

	test('.exe detection with custom Path and double quoting', async t => {
		const {stdout} = await nanoSpawn('node', ['-p', 'process.argv0'], {argv0: testString, env: {[pathKey()]: `"${path.dirname(process.execPath)}"`}});
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
	const {message, exitCode, signalName, stderr, cause} = await t.throwsAsync(nanoSpawn('non-existent-command'));

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
		t.true(cause.message.includes('non-existent-command'));
		t.is(cause.code, 'ENOENT');
		t.is(cause.syscall, 'spawn non-existent-command');
	}
});

test('Handles non-existing command, shell', async t => {
	const {message, exitCode, signalName, stderr, cause} = await t.throwsAsync(nanoSpawn('non-existent-command', {shell: true}));

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
	t.regex(stdout, /^\d+\.\d+\.\d+$/);
});

test('Can run local npm binaries', async t => {
	const localDirectory = fileURLToPath(new URL('node_modules/.bin', import.meta.url));
	const pathValue = `${process.env[pathKey()]}${path.delimiter}${localDirectory}`;
	const {stdout} = await nanoSpawn('ava', ['--version'], {[pathKey()]: pathValue});
	t.regex(stdout, /^\d+\.\d+\.\d+$/);
});

const testLocalBinary = async (t, input) => {
	const localDirectory = fileURLToPath(new URL('node_modules/.bin', import.meta.url));
	const pathValue = `${process.env[pathKey()]}${path.delimiter}${localDirectory}`;
	const testFile = fileURLToPath(new URL('fixtures/test.js', import.meta.url));
	const {stderr} = await nanoSpawn('ava', [testFile, '--', input], {[pathKey()]: pathValue});
	t.is(stderr, input);
};

test('Can pass arguments to local npm binaries, "', testLocalBinary, '"');
test('Can pass arguments to local npm binaries, \\', testLocalBinary, '\\');
test('Can pass arguments to local npm binaries, \\.', testLocalBinary, '\\.');
test('Can pass arguments to local npm binaries, \\"', testLocalBinary, '\\"');
test('Can pass arguments to local npm binaries, \\\\"', testLocalBinary, '\\\\"');
test('Can pass arguments to local npm binaries, a b', testLocalBinary, 'a b');
test('Can pass arguments to local npm binaries, \'.\'', testLocalBinary, '\'.\'');
test('Can pass arguments to local npm binaries, "."', testLocalBinary, '"."');
test('Can pass arguments to local npm binaries, (', testLocalBinary, '(');
test('Can pass arguments to local npm binaries, )', testLocalBinary, ')');
test('Can pass arguments to local npm binaries, ]', testLocalBinary, ']');
test('Can pass arguments to local npm binaries, [', testLocalBinary, '[');
test('Can pass arguments to local npm binaries, %', testLocalBinary, '%');
test('Can pass arguments to local npm binaries, %1', testLocalBinary, '%1');
test('Can pass arguments to local npm binaries, !', testLocalBinary, '!');
test('Can pass arguments to local npm binaries, ^', testLocalBinary, '^');
test('Can pass arguments to local npm binaries, `', testLocalBinary, '`');
test('Can pass arguments to local npm binaries, <', testLocalBinary, '<');
test('Can pass arguments to local npm binaries, >', testLocalBinary, '>');
test('Can pass arguments to local npm binaries, &', testLocalBinary, '&');
test('Can pass arguments to local npm binaries, |', testLocalBinary, '|');
test('Can pass arguments to local npm binaries, ;', testLocalBinary, ';');
test('Can pass arguments to local npm binaries, ,', testLocalBinary, ',');
test('Can pass arguments to local npm binaries, space', testLocalBinary, ' ');
test('Can pass arguments to local npm binaries, *', testLocalBinary, '*');
test('Can pass arguments to local npm binaries, ?', testLocalBinary, '?');

test('Can run OS binaries', async t => {
	const {stdout} = await nanoSpawn('git', ['--version']);
	t.regex(stdout, /^git version \d+\.\d+\.\d+/);
});
