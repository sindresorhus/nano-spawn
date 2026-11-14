import path from 'node:path';
import {Stream} from 'node:stream';
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
import {
	testString,
	secondTestString,
	cmdArguments,
	getArgumentName,
} from './helpers/arguments.js';
import {
	assertNonExistent,
	assertUnixNotFound,
	assertWindowsNonExistent,
	throwsAsync,
} from './helpers/assert.js';
import {
	nodePrint,
	nodePrintStdout,
	nodePrintBoth,
	nodePrintArgv0,
	nodePassThrough,
	localBinary,
	localBinaryCommand,
	localOnlyBinary,
	localOnlyBinaryCommand,
	localOnlyBinaryCommandStart,
} from './helpers/commands.js';

const VERSION_REGEXP = /^\d+\.\d+\.\d+$/v;

test('options.env augments process.env', async () => {
	process.env.ONE = 'one';
	process.env.TWO = 'two';

	try {
		const {stdout} = await spawn(...nodePrint('process.env.ONE + process.env.TWO'), {env: {TWO: testString}});
		assert.equal(stdout, `${process.env.ONE}${testString}`);
	} finally {
		delete process.env.ONE;
		delete process.env.TWO;
	}
});

for (const [name, options] of [['default options', undefined], ['empty env', {env: {}}], ['preferLocal', {preferLocal: true}]]) {
	test(`The environment is captured when spawn is called with ${name}`, async () => {
		const previousValue = process.env.NANO_SPAWN_ENV_SNAPSHOT;
		process.env.NANO_SPAWN_ENV_SNAPSHOT = testString;

		try {
			const subprocess = spawn(process.execPath, ['-p', 'process.env.NANO_SPAWN_ENV_SNAPSHOT'], options);
			process.env.NANO_SPAWN_ENV_SNAPSHOT = secondTestString;
			const {stdout} = await subprocess;
			assert.equal(stdout, testString);
		} finally {
			if (previousValue === undefined) {
				delete process.env.NANO_SPAWN_ENV_SNAPSHOT;
			} else {
				process.env.NANO_SPAWN_ENV_SNAPSHOT = previousValue;
			}
		}
	});
}

for (const [name, options] of [['default options', undefined], ['empty env', {env: {}}], ['preferLocal', {preferLocal: true}]]) {
	test(`The captured environment ignores inherited properties with ${name}`, async () => {
		const variableName = 'NANO_SPAWN_INHERITED_ENV';
		const previousDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, variableName);
		assert.equal(Object.hasOwn(process.env, variableName), false);

		try {
			const subprocess = spawn(process.execPath, ['-p', `Object.hasOwn(process.env, ${JSON.stringify(variableName)})`], options);
			// eslint-disable-next-line no-extend-native -- Simulate prototype pollution after the environment snapshot.
			Object.defineProperty(Object.prototype, variableName, {value: testString, enumerable: true, configurable: true});
			const {stdout} = await subprocess;
			assert.equal(stdout, 'false');
		} finally {
			if (previousDescriptor === undefined) {
				Reflect.deleteProperty(Object.prototype, variableName);
			} else {
				// eslint-disable-next-line no-extend-native -- Restore the previous prototype descriptor.
				Object.defineProperty(Object.prototype, variableName, previousDescriptor);
			}
		}
	});
}

test('Normalized options ignore an inherited shell added during startup', async () => {
	const previousDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'shell');

	try {
		const subprocess = spawn(process.execPath, ['-p', '1']);
		// eslint-disable-next-line no-extend-native -- Simulate prototype pollution after option normalization.
		Object.defineProperty(Object.prototype, 'shell', {value: true, enumerable: true, configurable: true});
		const {stdout} = await subprocess;
		assert.equal(stdout, '1');
	} finally {
		if (previousDescriptor === undefined) {
			Reflect.deleteProperty(Object.prototype, 'shell');
		} else {
			// eslint-disable-next-line no-extend-native -- Restore the previous prototype descriptor.
			Object.defineProperty(Object.prototype, 'shell', previousDescriptor);
		}
	}
});

for (const streamName of ['stdout', 'stderr']) {
	test(`Unclaimed ${streamName} ignores an inherited iteration flag during startup`, async () => {
		const previousDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, streamName);

		try {
			const subprocess = spawn(process.execPath, ['-e', `process.${streamName}.write(${JSON.stringify(testString)})`]);
			// eslint-disable-next-line no-extend-native -- Simulate prototype pollution before output ownership is claimed.
			Object.defineProperty(Object.prototype, streamName, {
				value: true,
				writable: true,
				enumerable: true,
				configurable: true,
			});
			const result = await subprocess;
			assert.equal(result[streamName], testString);
			assert.equal(result.output, testString);
		} finally {
			if (previousDescriptor === undefined) {
				Reflect.deleteProperty(Object.prototype, streamName);
			} else {
				// eslint-disable-next-line no-extend-native -- Restore the previous prototype descriptor.
				Object.defineProperty(Object.prototype, streamName, previousDescriptor);
			}
		}
	});
}

const testArgv0 = shell => async () => {
	const {stdout} = await spawn(...nodePrintArgv0, {argv0: testString, shell});
	assert.equal(stdout, shell ? process.execPath : testString);
};

test('Can pass options.argv0', testArgv0(false));
test('Can pass options.argv0, shell', testArgv0(true));

const testCwd = cwd => async () => {
	const {stdout} = await spawn(...nodePrint('process.cwd()'), {cwd});
	assert.equal(stdout, fixturesPath.replace(/[\/\\]$/v, ''));
};

test('Can pass options.cwd string', testCwd(fixturesPath));
test('Can pass options.cwd URL', testCwd(FIXTURES_URL));

const testStdOption = optionName => async () => {
	const subprocess = spawn(...nodePrintStdout, {[optionName]: 'ignore'});
	const nodeChildProcess = await subprocess.nodeChildProcess;
	assert.equal(nodeChildProcess[optionName], null);
	await subprocess;
};

test('Can pass options.stdin', testStdOption('stdin'));
test('Can pass options.stdout', testStdOption('stdout'));
test('Can pass options.stderr', testStdOption('stderr'));

// The default is a pipe, so the stream must be a real one, not merely present
const testStdOptionDefault = optionName => async () => {
	const subprocess = spawn(...nodePrintStdout);
	const nodeChildProcess = await subprocess.nodeChildProcess;
	assert.ok(nodeChildProcess[optionName] instanceof Stream);
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

test('The stdio array is captured when spawn is called', async () => {
	const stdio = ['ignore', 'pipe', 'pipe'];
	const subprocess = spawn(...nodePrintStdout, {stdio});
	stdio[1] = 'ignore';
	const {stdout} = await subprocess;
	assert.equal(stdout, testString);
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

const testStdioPriority = stdio => async () => {
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

const testLocalBinaryExec = cwd => async () => {
	const {stdout} = await spawn(...localBinary, {preferLocal: true, cwd});
	assert.match(stdout, VERSION_REGEXP);
};

test('options.preferLocal true runs local npm binaries', testLocalBinaryExec(undefined));
test('options.preferLocal true runs local npm binaries with options.cwd string', testLocalBinaryExec(fixturesPath));
test('options.preferLocal true runs local npm binaries with options.cwd URL', testLocalBinaryExec(FIXTURES_URL));

const testPathVariable = pathName => async () => {
	const {stdout} = await spawn(...localBinary, {preferLocal: true, env: {PATH: undefined, Path: undefined, [pathName]: isWindows ? process.env[pathKey()] : nodeDirectory}});
	assert.match(stdout, VERSION_REGEXP);
};

test('options.preferLocal true uses options.env.PATH when set', testPathVariable('PATH'));
test('options.preferLocal true uses options.env.Path when set', testPathVariable('Path'));

// `localOnlyBinary` only exists in `test/fixtures/node_modules/.bin`, so it cannot be found through a globally installed binary with the same name
const testNoLocal = preferLocal => async () => {
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

// `preferLocal` walks up from the `cwd`, which is the repository root here, so the only local directory it can add is the repository's own `node_modules/.bin`. That is the one to put in `PATH` first: any other directory would not be looked up at all, so the test would pass whether or not the deduplication works.
test('options.preferLocal true does not add node_modules/.bin if already present', async () => {
	const localDirectory = fileURLToPath(new URL('../node_modules/.bin', import.meta.url));
	const currentPath = process.env[pathKey()];
	const pathValue = `${localDirectory}${path.delimiter}${currentPath}`;
	const {stdout} = await spawn(...nodePrint(`process.env.${pathKey()}`), {preferLocal: true, env: {[pathKey()]: pathValue}});
	const occurrences = value => value.split(path.delimiter).filter(pathPart => pathPart === localDirectory).length;
	assert.equal(occurrences(stdout), occurrences(pathValue));
});

const testLocalBinary = input => async () => {
	const {stderr} = await spawn('ava', ['test.js', '--', input], {preferLocal: true, cwd: FIXTURES_URL});
	assert.equal(stderr, input);
};

// Local npm binaries are `cmd.exe` shims on Windows, which forward their arguments with `%*`. Elsewhere, no shell is involved, so a single argument is enough.
for (const argument of isWindows ? cmdArguments : ['a b']) {
	test(`options.preferLocal true can pass arguments to local npm binaries, ${getArgumentName(argument)}`, testLocalBinary(argument));
}

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
	assert.match(stdout, /^git version \d+\.\d+\.\d+/v);
});

// `options.stdio` accepts a single string applying to all three streams
const testStdioString = (stdio, expected) => async () => {
	const subprocess = spawn(...nodePrintBoth, {stdio});
	const {stdin, stdout, stderr} = await subprocess.nodeChildProcess;
	assert.equal(stdin !== null, expected);
	assert.equal(stdout !== null, expected);
	assert.equal(stderr !== null, expected);
	const {stdout: output, stderr: errorOutput} = await subprocess;
	assert.equal(output, expected ? testString : '');
	assert.equal(errorOutput, expected ? secondTestString : '');
};

test('options.stdio "pipe"', testStdioString('pipe', true));
test('options.stdio "ignore"', testStdioString('ignore', false));
test('options.stdio "inherit"', testStdioString('inherit', false));
test('options.stdio "overlapped"', testStdioString('overlapped', true));

test('options.preferLocal puts the local binaries first and keeps the current PATH last', async () => {
	const pathKeyName = pathKey();
	const {stdout} = await spawn(...nodePrint(`JSON.stringify(process.env.${pathKeyName}.split(${JSON.stringify(path.delimiter)}))`), {
		preferLocal: true,
		env: {PATH: '/only-this', Path: undefined},
	});
	const pathParts = JSON.parse(stdout);
	assert.equal(pathParts.at(0), path.join(process.cwd(), 'node_modules/.bin'));
	assert.equal(pathParts.at(-1), '/only-this');
});

test('options.preferLocal keeps an unrelated environment variable', async () => {
	const {stdout} = await spawn(...nodePrint('process.env.NANO_SPAWN_TEST'), {
		preferLocal: true,
		env: {NANO_SPAWN_TEST: testString},
	});
	assert.equal(stdout, testString);
});

test('options.preferLocal keeps an unrelated environment variable, without options.env', async () => {
	process.env.NANO_SPAWN_TEST = testString;

	try {
		const {stdout} = await spawn(...nodePrint('process.env.NANO_SPAWN_TEST'), {preferLocal: true});
		assert.equal(stdout, testString);
	} finally {
		delete process.env.NANO_SPAWN_TEST;
	}
});

// `node:child_process` treats `null` like `undefined`, but `spawn()` does not support it for those options
for (const optionName of ['cwd', 'stdio']) {
	test(`options.${optionName} cannot be null`, () => {
		assert.throws(() => spawn(...nodePrintStdout, {[optionName]: null}), {
			name: 'TypeError',
			message: `The \`${optionName}\` option must not be \`null\`. Use \`undefined\` instead.`,
		});
	});
}

test('options.stdio can be undefined, with options.stdin {string: string}', async () => {
	const {stdout} = await spawn(...nodePassThrough, {stdio: undefined, stdin: {string: testString}});
	assert.equal(stdout, testString);
});

test('options.stdin can be null', async () => {
	const {stdout} = await spawn(...nodePrintStdout, {stdin: null});
	assert.equal(stdout, testString);
});
