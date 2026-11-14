import test from 'node:test';
import assert from 'node:assert/strict';
import {red} from 'yoctocolors';
import spawn from '../source/index.js';
import {testString} from './helpers/arguments.js';
import {
	assertDurationMs,
	throwsAsync,
} from './helpers/assert.js';
import {
	nodePrint,
	nodePrintFail,
	nodePrintStdout,
	nodePrintSleep,
} from './helpers/commands.js';

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

// The command is built from the raw arguments, so any argument can be checked without having to embed it in the subprocess' own script.
const commandPrefix = 'node -e \'process.exit(2)\'';

const testCommandArgument = (argument, expectedCommandPart) => async () => {
	const error = await throwsAsync(spawn('node', ['-e', 'process.exit(2)', argument]));
	assert.equal(error.command, `${commandPrefix} ${expectedCommandPart}`);
};

test('result.command does not quote dashes', testCommandArgument('-a', '-a'));
test('result.command does not quote a double dash', testCommandArgument('--', '--'));
test('result.command does not quote dots', testCommandArgument('a.b', 'a.b'));
test('result.command does not quote double dots', testCommandArgument('..', '..'));
test('result.command does not quote slashes', testCommandArgument('a/b', 'a/b'));
test('result.command does not quote underscores', testCommandArgument('a_b', 'a_b'));
test('result.command does not quote digits', testCommandArgument('123', '123'));
test('result.command does not quote an empty argument', testCommandArgument('', ''));
test('result.command quotes double quotes', testCommandArgument('"', '\'"\''));
test('result.command quotes backslashes', testCommandArgument('\\', '\'\\\''));
test('result.command quotes semicolons', testCommandArgument('a;b', '\'a;b\''));
test('result.command quotes pipes', testCommandArgument('a|b', '\'a|b\''));
test('result.command quotes ampersands', testCommandArgument('a&b', '\'a&b\''));
test('result.command quotes subshells', testCommandArgument('$(a)', '\'$(a)\''));
test('result.command quotes backticks', testCommandArgument('`a`', '\'`a`\''));
test('result.command quotes non-ASCII letters', testCommandArgument('é', '\'é\''));
test('result.command quotes emoji', testCommandArgument('🦄', '\'🦄\''));
test('result.command strips ANSI sequences from arguments', testCommandArgument(red(testString), testString));
test('result.command keeps several arguments in order', async () => {
	const error = await throwsAsync(spawn('node', ['-e', 'process.exit(2)', 'a-b', 'c d', 'e']));
	assert.equal(error.command, `${commandPrefix} a-b 'c d' e`);
});

// `result.command` is meant to be logged, so control characters must be made visible. Emitted raw, a single argument could span several log lines, or truncate and rewrite them in a terminal.
const testCommandControlCharacter = (input, expectedCommandPart) => async () => {
	const error = await throwsAsync(spawn('node', ['-e', 'process.exit(2)', input]));
	assert.equal(error.command, `node -e 'process.exit(2)' ${expectedCommandPart}`);
	assert.equal(error.message.includes('\n'), false);
	assert.equal(error.message.includes('\r'), false);
	assert.equal(error.message.includes('\0'), false);
};

test('result.command escapes a newline in an argument', testCommandControlCharacter('a\nb', '\'a\\nb\''));
test('result.command escapes a carriage return in an argument', testCommandControlCharacter('a\rb', '\'a\\rb\''));
test('result.command escapes a tab in an argument', testCommandControlCharacter('a\tb', '\'a\\tb\''));
test('result.command escapes a NUL byte in an argument', testCommandControlCharacter('a\0b', '\'a\\x00b\''));
test('result.command escapes a backspace in an argument', testCommandControlCharacter('a\bb', '\'a\\x08b\''));
test('result.command escapes an escape character in an argument', testCommandControlCharacter('a\u{1B}b', '\'a\\x1bb\''));
test('result.command escapes a delete character in an argument', testCommandControlCharacter('a\u{7F}b', '\'a\\x7fb\''));
// The C1 range, from just above the delete character to its end, includes U+0085 "next line", which starts a new line just as a newline does
test('result.command escapes the first C1 control character in an argument', testCommandControlCharacter('a\u{80}b', '\'a\\x80b\''));
test('result.command escapes a next line character in an argument', testCommandControlCharacter('a\u{85}b', '\'a\\x85b\''));
test('result.command escapes the last C1 control character in an argument', testCommandControlCharacter('a\u{9F}b', '\'a\\x9fb\''));
test('result.command escapes an argument which is only a newline', testCommandControlCharacter('\n', '\'\\n\''));
// Just outside the escaped range, so these must be left alone
test('result.command does not escape a space in an argument', testCommandControlCharacter('a b', '\'a b\''));
test('result.command does not escape a non-ASCII letter in an argument', testCommandControlCharacter('a\u{E9}b', '\'a\u{E9}b\''));

test('result.durationMs is set', async () => {
	const {durationMs} = await spawn(...nodePrintStdout);
	assertDurationMs(durationMs);
});

test('result.durationMs is in milliseconds', async () => {
	// The subprocess sleeps for 100ms. Timers can fire slightly early on some platforms.
	const {durationMs} = await spawn(...nodePrintSleep);
	assert.ok(durationMs >= 90, `${durationMs} should be about 100`);
	assert.ok(durationMs < 1e4, `${durationMs} should be about 100`);
});

test('error.durationMs is set', async () => {
	const {durationMs} = await throwsAsync(spawn(...nodePrintFail));
	assertDurationMs(durationMs);
});
