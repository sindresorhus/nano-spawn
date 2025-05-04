import process from 'node:process';
import test from 'ava';
import getNode from 'get-node';
import spawn from '../source/index.js';
import {isWindows, FIXTURES_URL, writeMultibyte} from './helpers/main.js';
import {
	assertWindowsNonExistent,
	assertNonExistent,
	assertUnixNonExistentShell,
} from './helpers/assert.js';
import {testString, secondTestString, multibyteString} from './helpers/arguments.js';
import {nonExistentCommand, nodePrintBoth, nodePassThrough} from './helpers/commands.js';

const nodeCliFlag = '--jitless';
const inspectCliFlag = '--inspect-port=8091';

const testNodeFlags = async (t, binaryName, fixtureName, hasFlag) => {
	const {stdout} = await spawn(binaryName, [nodeCliFlag, fixtureName], {cwd: FIXTURES_URL});
	t.is(stdout.includes(nodeCliFlag), hasFlag);
};

test('Keeps Node flags', testNodeFlags, 'node', 'node-flags.js', true);
test('Does not keep Node flags, full path', testNodeFlags, 'node', 'node-flags-path.js', false);

if (isWindows) {
	test('Keeps Node flags, node.exe', testNodeFlags, 'node.exe', 'node-flags.js', true);
	test('Keeps Node flags, case-insensitive', testNodeFlags, 'NODE', 'node-flags.js', true);
}

test('Does not keep --inspect* Node flags', async t => {
	const {stdout} = await spawn('node', [nodeCliFlag, inspectCliFlag, 'node-flags.js'], {cwd: FIXTURES_URL});
	t.true(stdout.includes(nodeCliFlag));
	t.false(stdout.includes(inspectCliFlag));
});

const TEST_NODE_VERSION = '20.18.0';

test.serial('Keeps Node version', async t => {
	const {path: nodePath} = await getNode(TEST_NODE_VERSION);
	t.not(nodePath, process.execPath);
	const {stdout} = await spawn(nodePath, ['node-version.js'], {cwd: FIXTURES_URL});
	t.is(stdout, `v${TEST_NODE_VERSION}`);
});

test('Handles non-existing command', async t => {
	const error = await t.throwsAsync(spawn(nonExistentCommand));

	if (isWindows) {
		assertWindowsNonExistent(t, error);
	} else {
		assertNonExistent(t, error);
	}
});

test('Handles non-existing command, shell', async t => {
	const error = await t.throwsAsync(spawn(nonExistentCommand, {shell: true}));

	if (isWindows) {
		assertWindowsNonExistent(t, error);
	} else {
		assertUnixNonExistentShell(t, error);
	}
});

test('result.stdout is an empty string if options.stdout "ignore"', async t => {
	const {stdout, stderr, output} = await spawn(...nodePrintBoth, {stdout: 'ignore'});
	t.is(stdout, '');
	t.is(stderr, secondTestString);
	t.is(output, stderr);
});

test('result.stderr is an empty string if options.stderr "ignore"', async t => {
	const {stdout, stderr, output} = await spawn(...nodePrintBoth, {stderr: 'ignore'});
	t.is(stdout, testString);
	t.is(stderr, '');
	t.is(output, stdout);
});

test('result.output is an empty string if options.stdout and options.stderr "ignore"', async t => {
	const {stdout, stderr, output} = await spawn(...nodePrintBoth, {stdout: 'ignore', stderr: 'ignore'});
	t.is(stdout, '');
	t.is(stderr, '');
	t.is(output, '');
});

test.serial('result.stdout works with multibyte sequences', async t => {
	const subprocess = spawn(...nodePassThrough);
	writeMultibyte(subprocess);
	const {stdout, output} = await subprocess;
	t.is(stdout, multibyteString);
	t.is(output, stdout);
});
