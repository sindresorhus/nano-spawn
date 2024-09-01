import test from 'ava';
import {red} from 'yoctocolors';
import nanoSpawn from '../source/index.js';
import {testString} from './helpers/arguments.js';
import {assertDurationMs} from './helpers/assert.js';
import {nodePrint, nodePrintFail, nodePrintStdout} from './helpers/commands.js';

test('result.command does not quote normal arguments', async t => {
	const {command} = await nanoSpawn('node', ['--version']);
	t.is(command, 'node --version');
});

const testCommandEscaping = async (t, input, expectedCommand) => {
	const {command, stdout} = await nanoSpawn(...nodePrint(`"${input}"`));
	t.is(command, `node -p '"${expectedCommand}"'`);
	t.is(stdout, input);
};

test('result.command quotes spaces', testCommandEscaping, '. .', '. .');
test('result.command quotes single quotes', testCommandEscaping, '\'', '\'\\\'\'');
test('result.command quotes unusual characters', testCommandEscaping, ',', ',');
test('result.command strips ANSI sequences', testCommandEscaping, red(testString), testString);

test('result.durationMs is set', async t => {
	const {durationMs} = await nanoSpawn(...nodePrintStdout);
	assertDurationMs(t, durationMs);
});

test('error.durationMs is set', async t => {
	const {durationMs} = await t.throwsAsync(nanoSpawn(...nodePrintFail));
	assertDurationMs(t, durationMs);
});