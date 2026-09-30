import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
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
	assertUnixNotFound,
	assertWindowsNonExistent,
	throwsAsync
} from './helpers/assert.js';
import {
	nodePrint,
	nodePrintStdout,
	nodePrintArgv0,
	nodePassThrough,
	localBinary,
	localBinaryCommand,
	localBinaryCommandStart,
	localOnlyBinary,
	localOnlyBinaryCommand,
	localOnlyBinaryCommandStart,
} from './helpers/commands.js';

const VERSION_REGEXP = /^\d+\.\d+\.\d+$/;

test('options.env augments process.env', async () => {
	process.env.ONE = 'one';
	process.env.TWO = 'two';
	const {stdout} = await spawn(...nodePrint('process.env.ONE + process.env.TWO'), {env: {TWO: testString}});
	assert.equal(stdout, `${process.env.ONE}${testString}`);
	delete process.env.ONE;
	delete process.env.TWO;
});

const testArgv0 = (shell) => async () => {
	const {stdout} = await spawn(...nodePrintArgv0, {argv0: testString, shell});
	assert.equal(stdout, shell ? process.execPath : testString);
};

test('Can pass options.argv0', testArgv0(false));
test('Can pass options.argv0, shell', testArgv0(true));

const testCwd = (cwd) => async () => {
	const {stdout} = await spawn(...nodePrint('process.cwd()'), {cwd});
	assert.equal(stdout, fixturesPath.replace(/[\\/]$/, ''));
};

test('Can pass options.cwd string', testCwd(fixturesPath));
test('Can pass options.cwd URL', testCwd(FIXTURES_URL));

const testStdOption = (optionName) => async () => {
	const subprocess = spawn(...nodePrintStdout, {[optionName]: 'ignore'});
	const nodeChildProcess = await subprocess.nodeChildProcess;
	assert.equal(nodeChildProcess[optionName], null);
	await subprocess;
};

test('Can pass options.stdin', testStdOption('stdin'));
test('Can pass options.stdout', testStdOption('stdout'));
test('Can pass options.stderr', testStdOption('stderr'));

const testStdOptionDefault = (optionName) => async () => {
	const subprocess = spawn(...nodePrintStdout);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	assert.notEqual(nodeChildProcess[optionName], null);
	await subprocess;
};

test('options.stdin defaults to "pipe"', testStdOptionDefault('stdin'));
test('options.stdout defaults to "pipe"', testStdOptionDefault('stdout'));
test('options.stderr defaults to "pipe"', testStdOptionDefault('stderr'));

test('Can pass options.stdio array', async () => {
	const subprocess = spawn(...nodePrintStdout, {stdio: ['ignore', 'pipe', 'pipe', 'pipe']});
	const {stdin, stdout, stderr, stdio} = await subprocess.nodeChildProcess;
	assert.equal(stdin, null);
	assert.notEqual(stdout, null);
	assert.notEqual(stderr, null);
	assert.equal(stdio.length, 4);
	await subprocess;
});

test('Can pass options.stdio string', async () => {
	const subprocess = spawn(...nodePrintStdout, {stdio: 'ignore'});
	const {stdin, stdout, stderr, stdio} = await subprocess.nodeChildProcess;
	assert.equal(stdin, null);
	assert.equal(stdout, null);
	assert.equal(stderr, null);
	assert.equal(stdio.length, 3);
	await subprocess;
});

const testStdioPriority = (stdio) => async () => {
	const subprocess = spawn(...nodePrintStdout, {stdio, stdout: 'ignore'});
	const {stdout} = await subprocess.nodeChildProcess;
	assert.notEqual(stdout, null);
	await subprocess;
};

test('options.stdio array has priority over options.stdout', testStdioPriority(['pipe', 'pipe', 'pipe']));
test('options.stdio string has priority over options.stdout', testStdioPriority('pipe'));

const testInput = (options, expectedStdout) => async () => {
	const {stdout} = await spawn(...nodePassThrough, options);
	assert.equal(stdout, expectedStdout);
};

test('options.stdin can be {string: string}', testInput({stdin: {string: testString}}, testString));
test('options.stdio[0] can be {string: string}', testInput({stdio: [{string: testString}, 'pipe', 'pipe']}, testString));
test('options.stdin can be {string: ""}', testInput({stdin: {string: ''}}, ''));
test('options.stdio[0] can be {string: ""}', testInput({stdio: [{string: ''}, 'pipe', 'pipe']}, ''));

const testLocalBinaryExec = (cwd) => async () => {
	const {stdout} = await spawn(...localBinary, {preferLocal: true, cwd});
	assert.match(stdout, VERSION_REGEXP);
};

test('options.preferLocal true runs local npm binaries', testLocalBinaryExec(undefined));
test('options.preferLocal true runs local npm binaries with options.cwd string', testLocalBinaryExec(fixturesPath));
test('options.preferLocal true runs local npm binaries with options.cwd URL', testLocalBinaryExec(FIXTURES_URL));

const testPathVariable = (pathName) => async () => {
	const {stdout} = await spawn(...localBinary, {preferLocal: true, env: {PATH: undefined, Path: undefined, [pathName]: isWindows ? process.env[pathKey()] : nodeDirectory}});
	assert.match(stdout, VERSION_REGEXP);
};

test('options.preferLocal true uses options.env.PATH when set', testPathVariable('PATH'));
test('options.preferLocal true uses options.env.Path when set', testPathVariable('Path'));

// `localOnlyBinary` only exists in `test/fixtures/node_modules/.bin`, so it cannot be found
// through a globally installed binary with the same name
const testNoLocal = (preferLocal) => async () => {
	const PATH = process.env[pathKey()]
		.split(path.delimiter)
		.filter(pathPart => !pathPart.includes(path.join('node_modules', '.bin')))
		.join(path.delimiter);
	const error = await throwsAsync(spawn(...localOnlyBinary, {preferLocal, env: {Path: undefined, PATH}, cwd: FIXTURES_URL}));
	if (isWindows) {
		assertWindowsNonExistent(error, localOnlyBinaryCommand);
	} else {
		assertNonExistent(error, localOnlyBinaryCommandStart, localOnlyBinaryCommand);
	}
};

test('options.preferLocal undefined does not run local npm binaries', testNoLocal(undefined));
test('options.preferLocal false does not run local npm binaries', testNoLocal(false));

test('options.preferLocal true runs a binary which only exists locally', async () => {
	const {stdout} = await spawn(...localOnlyBinary, {preferLocal: true, cwd: FIXTURES_URL});
	assert.equal(stdout, '1.2.3');
});

test('options.preferLocal true uses options.env when empty', async () => {
	const error = await throwsAsync(spawn(...localBinary, {preferLocal: true, env: {PATH: undefined, Path: undefined}}));
	if (isWindows) {
		assertNonExistent(error, 'cmd.exe', localBinaryCommand);
	} else {
		assertUnixNotFound(error, localBinaryCommand);
	}
});

test('options.preferLocal true can use an empty PATH', async () => {
	const {stdout} = await spawn(process.execPath, ['--version'], {preferLocal: true, env: {PATH: undefined, Path: undefined}});
	assert.equal(stdout, process.version);
});

test('options.preferLocal true does not add node_modules/.bin if already present', async () => {
	const localDirectory = fileURLToPath(new URL('node_modules/.bin', import.meta.url));
	const currentPath = process.env[pathKey()];
	const pathValue = `${localDirectory}${path.delimiter}${currentPath}`;
	const {stdout} = await spawn(...nodePrint(`process.env.${pathKey()}`), {preferLocal: true, env: {[pathKey()]: pathValue}});
	assert.equal(
		stdout.split(path.delimiter).filter(pathPart => pathPart === localDirectory).length
		- currentPath.split(path.delimiter).filter(pathPart => pathPart === localDirectory).length,
		1,
	);
});

const testLocalBinary = (input) => async () => {
	const {stderr} = await spawn('ava', ['test.js', '--', input], {preferLocal: true, cwd: FIXTURES_URL});
	assert.equal(stderr, input);
};

test('options.preferLocal true can pass arguments to local npm binaries, "', testLocalBinary('"'));
test('options.preferLocal true can pass arguments to local npm binaries, \\', testLocalBinary('\\'));
test('options.preferLocal true can pass arguments to local npm binaries, \\.', testLocalBinary('\\.'));
test('options.preferLocal true can pass arguments to local npm binaries, \\"', testLocalBinary('\\"'));
test('options.preferLocal true can pass arguments to local npm binaries, \\\\"', testLocalBinary('\\\\"'));
test('options.preferLocal true can pass arguments to local npm binaries, a b', testLocalBinary('a b'));
test('options.preferLocal true can pass arguments to local npm binaries, \'.\'', testLocalBinary('\'.\''));
test('options.preferLocal true can pass arguments to local npm binaries, "."', testLocalBinary('"."'));
test('options.preferLocal true can pass arguments to local npm binaries, (', testLocalBinary('('));
test('options.preferLocal true can pass arguments to local npm binaries, )', testLocalBinary(')'));
test('options.preferLocal true can pass arguments to local npm binaries, ]', testLocalBinary(']'));
test('options.preferLocal true can pass arguments to local npm binaries, [', testLocalBinary('['));
test('options.preferLocal true can pass arguments to local npm binaries, %', testLocalBinary('%'));
test('options.preferLocal true can pass arguments to local npm binaries, %1', testLocalBinary('%1'));
test('options.preferLocal true can pass arguments to local npm binaries, !', testLocalBinary('!'));
test('options.preferLocal true can pass arguments to local npm binaries, ^', testLocalBinary('^'));
test('options.preferLocal true can pass arguments to local npm binaries, `', testLocalBinary('`'));
test('options.preferLocal true can pass arguments to local npm binaries, <', testLocalBinary('<'));
test('options.preferLocal true can pass arguments to local npm binaries, >', testLocalBinary('>'));
test('options.preferLocal true can pass arguments to local npm binaries, &', testLocalBinary('&'));
test('options.preferLocal true can pass arguments to local npm binaries, |', testLocalBinary('|'));
test('options.preferLocal true can pass arguments to local npm binaries, ;', testLocalBinary(';'));
test('options.preferLocal true can pass arguments to local npm binaries, ,', testLocalBinary(','));
test('options.preferLocal true can pass arguments to local npm binaries, space', testLocalBinary(' '));
test('options.preferLocal true can pass arguments to local npm binaries, *', testLocalBinary('*'));
test('options.preferLocal true can pass arguments to local npm binaries, ?', testLocalBinary('?'));

if (!isWindows) {
	test('options.preferLocal true prefer local binaries over global ones', async () => {
		const {stdout} = await spawn('git', {preferLocal: true, cwd: FIXTURES_URL});
		assert.equal(stdout, testString);
	});

	test('options.preferLocal true prefer subdirectories over parent directories', async () => {
		const {stdout} = await spawn('git', {preferLocal: true, cwd: new URL('subdir', FIXTURES_URL)});
		assert.equal(stdout, secondTestString);
	});
}

test('Can run global npm binaries', async () => {
	const {stdout} = await spawn('npm', ['--version']);
	assert.match(stdout, VERSION_REGEXP);
});

test('Can run OS binaries', async () => {
	const {stdout} = await spawn('git', ['--version']);
	assert.match(stdout, /^git version \d+\.\d+\.\d+/);
});
