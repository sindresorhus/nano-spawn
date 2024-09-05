import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import pathKey from 'path-key';
import nanoSpawn from '../source/index.js';
import {
	isWindows,
	FIXTURES_URL,
	fixturesPath,
	nodeDirectory,
} from './helpers/main.js';
import {testString} from './helpers/arguments.js';
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
	const {stdout} = await nanoSpawn(...nodePrint('process.env.ONE + process.env.TWO'), {env: {TWO: testString}});
	t.is(stdout, `${process.env.ONE}${testString}`);
	delete process.env.ONE;
	delete process.env.TWO;
});

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

test('Can run global npm binaries', async t => {
	const {stdout} = await nanoSpawn('npm', ['--version']);
	t.regex(stdout, VERSION_REGEXP);
});

test('Can run OS binaries', async t => {
	const {stdout} = await nanoSpawn('git', ['--version']);
	t.regex(stdout, /^git version \d+\.\d+\.\d+/);
});
