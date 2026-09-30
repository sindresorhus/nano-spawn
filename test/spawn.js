import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
import getNode from 'get-node';
import spawn from '../source/index.js';
import {isWindows, FIXTURES_URL, writeMultibyte} from './helpers/main.js';
import {
	assertNonExistent,
	assertUnixNonExistentShell,
	assertWindowsNonExistent,
	throwsAsync
} from './helpers/assert.js';
import {testString, secondTestString, multibyteString} from './helpers/arguments.js';
import {nonExistentCommand, nodePrintBoth, nodePassThrough} from './helpers/commands.js';

const nodeCliFlag = '--jitless';
const inspectCliFlag = '--inspect-port=8091';

const testNodeFlags = (binaryName, fixtureName, hasFlag) => async () => {
	const {stdout} = await spawn(binaryName, [nodeCliFlag, fixtureName], {cwd: FIXTURES_URL});
	assert.equal(stdout.includes(nodeCliFlag), hasFlag);
};

test('Keeps Node flags', testNodeFlags('node', 'node-flags.js', true));
test('Does not keep Node flags, full path', testNodeFlags('node', 'node-flags-path.js', false));

if (isWindows) {
	test('Keeps Node flags, node.exe', testNodeFlags('node.exe', 'node-flags.js', true));
	test('Keeps Node flags, case-insensitive', testNodeFlags('NODE', 'node-flags.js', true));
}

test('Does not keep --inspect* Node flags', async () => {
	const {stdout} = await spawn('node', [nodeCliFlag, inspectCliFlag, 'node-flags.js'], {cwd: FIXTURES_URL});
	assert.ok(stdout.includes(nodeCliFlag));
	assert.equal(stdout.includes(inspectCliFlag), false);
});

const TEST_NODE_VERSION = '20.17.0';

test('Keeps Node version', async () => {
	const {path: nodePath} = await getNode(TEST_NODE_VERSION);
	assert.notEqual(nodePath, process.execPath);
	const {stdout} = await spawn(nodePath, ['node-version.js'], {cwd: FIXTURES_URL});
	assert.equal(stdout, `v${TEST_NODE_VERSION}`);
});

test('Handles non-existing command', async () => {
	const error = await throwsAsync(spawn(nonExistentCommand));

	if (isWindows) {
		assertWindowsNonExistent(error);
	} else {
		assertNonExistent(error);
	}
});

test('Handles non-existing command, shell', async () => {
	const error = await throwsAsync(spawn(nonExistentCommand, {shell: true}));

	if (isWindows) {
		assertWindowsNonExistent(error);
	} else {
		assertUnixNonExistentShell(error);
	}
});

test('result.stdout is an empty string if options.stdout "ignore"', async () => {
	const {stdout, stderr, output} = await spawn(...nodePrintBoth, {stdout: 'ignore'});
	assert.equal(stdout, '');
	assert.equal(stderr, secondTestString);
	assert.equal(output, stderr);
});

test('result.stderr is an empty string if options.stderr "ignore"', async () => {
	const {stdout, stderr, output} = await spawn(...nodePrintBoth, {stderr: 'ignore'});
	assert.equal(stdout, testString);
	assert.equal(stderr, '');
	assert.equal(output, stdout);
});

test('result.output is an empty string if options.stdout and options.stderr "ignore"', async () => {
	const {stdout, stderr, output} = await spawn(...nodePrintBoth, {stdout: 'ignore', stderr: 'ignore'});
	assert.equal(stdout, '');
	assert.equal(stderr, '');
	assert.equal(output, '');
});

test('result.stdout works with multibyte sequences', async () => {
	const subprocess = spawn(...nodePassThrough);
	writeMultibyte(subprocess);
	const {stdout, output} = await subprocess;
	assert.equal(stdout, multibyteString);
	assert.equal(output, stdout);
});
