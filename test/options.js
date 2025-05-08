import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import pathKey from 'path-key';
import spawn from '../source/index.js';
import {
	isWindows,
	FIXTURES_URL,
	fixturesPath,
	nodeDirectory,
} from './helpers/main.js';
import {testString, secondTestString} from './helpers/arguments.js';
import {
	assertNonExistent,
	assertWindowsNonExistent,
	assertUnixNotFound,
} from './helpers/assert.js';
import {
	nodePrint,
	nodePrintStdout,
	nodePrintArgv0,
	nodePassThrough,
	localBinary,
	localBinaryCommand,
	localBinaryCommandStart,
} from './helpers/commands.js';

const VERSION_REGEXP = /^\d+\.\d+\.\d+$/;

test.serial('options.env augments process.env', async t => {
	process.env.ONE = 'one';
	process.env.TWO = 'two';
	const {stdout} = await spawn(...nodePrint('process.env.ONE + process.env.TWO'), {env: {TWO: testString}});
	t.is(stdout, `${process.env.ONE}${testString}`);
	delete process.env.ONE;
	delete process.env.TWO;
});

const testArgv0 = async (t, shell) => {
	const {stdout} = await spawn(...nodePrintArgv0, {argv0: testString, shell});
	t.is(stdout, shell ? process.execPath : testString);
};

test('Can pass options.argv0', testArgv0, false);
test('Can pass options.argv0, shell', testArgv0, true);

const testCwd = async (t, cwd) => {
	const {stdout} = await spawn(...nodePrint('process.cwd()'), {cwd});
	t.is(stdout, fixturesPath.replace(/[\\/]$/, ''));
};

test('Can pass options.cwd string', testCwd, fixturesPath);
test('Can pass options.cwd URL', testCwd, FIXTURES_URL);

const testStdOption = async (t, optionName) => {
	const subprocess = spawn(...nodePrintStdout, {[optionName]: 'ignore'});
	const nodeChildProcess = await subprocess.nodeChildProcess;
	t.is(nodeChildProcess[optionName], null);
	await subprocess;
};

test('Can pass options.stdin', testStdOption, 'stdin');
test('Can pass options.stdout', testStdOption, 'stdout');
test('Can pass options.stderr', testStdOption, 'stderr');

const testStdOptionDefault = async (t, optionName) => {
	const subprocess = spawn(...nodePrintStdout);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	t.not(nodeChildProcess[optionName], null);
	await subprocess;
};

test('options.stdin defaults to "pipe"', testStdOptionDefault, 'stdin');
test('options.stdout defaults to "pipe"', testStdOptionDefault, 'stdout');
test('options.stderr defaults to "pipe"', testStdOptionDefault, 'stderr');

test('Can pass options.stdio array', async t => {
	const subprocess = spawn(...nodePrintStdout, {stdio: ['ignore', 'pipe', 'pipe', 'pipe']});
	const {stdin, stdout, stderr, stdio} = await subprocess.nodeChildProcess;
	t.is(stdin, null);
	t.not(stdout, null);
	t.not(stderr, null);
	t.is(stdio.length, 4);
	await subprocess;
});

test('Can pass options.stdio string', async t => {
	const subprocess = spawn(...nodePrintStdout, {stdio: 'ignore'});
	const {stdin, stdout, stderr, stdio} = await subprocess.nodeChildProcess;
	t.is(stdin, null);
	t.is(stdout, null);
	t.is(stderr, null);
	t.is(stdio.length, 3);
	await subprocess;
});

const testStdioPriority = async (t, stdio) => {
	const subprocess = spawn(...nodePrintStdout, {stdio, stdout: 'ignore'});
	const {stdout} = await subprocess.nodeChildProcess;
	t.not(stdout, null);
	await subprocess;
};

test('options.stdio array has priority over options.stdout', testStdioPriority, ['pipe', 'pipe', 'pipe']);
test('options.stdio string has priority over options.stdout', testStdioPriority, 'pipe');

const testInput = async (t, options, expectedStdout) => {
	const {stdout} = await spawn(...nodePassThrough, options);
	t.is(stdout, expectedStdout);
};

test('options.stdin can be {string: string}', testInput, {stdin: {string: testString}}, testString);
test('options.stdio[0] can be {string: string}', testInput, {stdio: [{string: testString}, 'pipe', 'pipe']}, testString);
test('options.stdin can be {string: ""}', testInput, {stdin: {string: ''}}, '');
test('options.stdio[0] can be {string: ""}', testInput, {stdio: [{string: ''}, 'pipe', 'pipe']}, '');

const testLocalBinaryExec = async (t, cwd) => {
	const {stdout} = await spawn(...localBinary, {preferLocal: true, cwd});
	t.regex(stdout, VERSION_REGEXP);
};

test('options.preferLocal true runs local npm binaries', testLocalBinaryExec, undefined);
test('options.preferLocal true runs local npm binaries with options.cwd string', testLocalBinaryExec, fixturesPath);
test('options.preferLocal true runs local npm binaries with options.cwd URL', testLocalBinaryExec, FIXTURES_URL);

const testPathVariable = async (t, pathName) => {
	const {stdout} = await spawn(...localBinary, {preferLocal: true, env: {PATH: undefined, Path: undefined, [pathName]: isWindows ? process.env[pathKey()] : nodeDirectory}});
	t.regex(stdout, VERSION_REGEXP);
};

test('options.preferLocal true uses options.env.PATH when set', testPathVariable, 'PATH');
test('options.preferLocal true uses options.env.Path when set', testPathVariable, 'Path');

const testNoLocal = async (t, preferLocal) => {
	const PATH = process.env[pathKey()]
		.split(path.delimiter)
		.filter(pathPart => !pathPart.includes(path.join('node_modules', '.bin')))
		.join(path.delimiter);
	const error = await t.throwsAsync(spawn(...localBinary, {preferLocal, env: {Path: undefined, PATH}}));
	if (isWindows) {
		assertWindowsNonExistent(t, error, localBinaryCommand);
	} else {
		assertNonExistent(t, error, localBinaryCommandStart, localBinaryCommand);
	}
};

test('options.preferLocal undefined does not run local npm binaries', testNoLocal, undefined);
test('options.preferLocal false does not run local npm binaries', testNoLocal, false);

test('options.preferLocal true uses options.env when empty', async t => {
	const error = await t.throwsAsync(spawn(...localBinary, {preferLocal: true, env: {PATH: undefined, Path: undefined}}));
	if (isWindows) {
		assertNonExistent(t, error, 'cmd.exe', localBinaryCommand);
	} else {
		assertUnixNotFound(t, error, localBinaryCommand);
	}
});

test('options.preferLocal true can use an empty PATH', async t => {
	const {stdout} = await spawn(process.execPath, ['--version'], {preferLocal: true, env: {PATH: undefined, Path: undefined}});
	t.is(stdout, process.version);
});

test('options.preferLocal true does not add node_modules/.bin if already present', async t => {
	const localDirectory = fileURLToPath(new URL('node_modules/.bin', import.meta.url));
	const currentPath = process.env[pathKey()];
	const pathValue = `${localDirectory}${path.delimiter}${currentPath}`;
	const {stdout} = await spawn(...nodePrint(`process.env.${pathKey()}`), {preferLocal: true, env: {[pathKey()]: pathValue}});
	t.is(
		stdout.split(path.delimiter).filter(pathPart => pathPart === localDirectory).length
		- currentPath.split(path.delimiter).filter(pathPart => pathPart === localDirectory).length,
		1,
	);
});

const testLocalBinary = async (t, input) => {
	const {stderr} = await spawn('ava', ['test.js', '--', input], {preferLocal: true, cwd: FIXTURES_URL});
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

if (!isWindows) {
	test('options.preferLocal true prefer local binaries over global ones', async t => {
		const {stdout} = await spawn('git', {preferLocal: true, cwd: FIXTURES_URL});
		t.is(stdout, testString);
	});

	test('options.preferLocal true prefer subdirectories over parent directories', async t => {
		const {stdout} = await spawn('git', {preferLocal: true, cwd: new URL('subdir', FIXTURES_URL)});
		t.is(stdout, secondTestString);
	});
}

test('Can run global npm binaries', async t => {
	const {stdout} = await spawn('npm', ['--version']);
	t.regex(stdout, VERSION_REGEXP);
});

test('Can run OS binaries', async t => {
	const {stdout} = await spawn('git', ['--version']);
	t.regex(stdout, /^git version \d+\.\d+\.\d+/);
});
