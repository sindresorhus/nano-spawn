import test from 'node:test';
import assert from 'node:assert/strict';
import {red} from 'yoctocolors';
import spawn from '../source/index.js';
import {testString} from './helpers/arguments.js';
import {
	assertDurationMs,
	throwsAsync
} from './helpers/assert.js';
import {nodePrint, nodePrintFail, nodePrintStdout} from './helpers/commands.js';

test('result.command does not quote normal arguments', async () => {
	const {command} = await spawn('node', ['--version']);
	assert.equal(command, 'node --version');
});

const testCommandEscaping = (input, expectedCommand) => async () => {
	const {command, stdout} = await spawn(...nodePrint(`"${input}"`));
	assert.equal(command, `node -p '"${expectedCommand}"'`);
	assert.equal(stdout, input);
};

test('result.command quotes spaces', testCommandEscaping('. .', '. .'));
test('result.command quotes single quotes', testCommandEscaping('\'', '\'\\\'\''));
test('result.command quotes unusual characters', testCommandEscaping(',', ','));
test('result.command strips ANSI sequences', testCommandEscaping(red(testString), testString));

test('result.durationMs is set', async () => {
	const {durationMs} = await spawn(...nodePrintStdout);
	assertDurationMs(durationMs);
});

test('error.durationMs is set', async () => {
	const {durationMs} = await throwsAsync(spawn(...nodePrintFail));
	assertDurationMs(durationMs);
});
