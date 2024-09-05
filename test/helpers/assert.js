import {nonExistentCommand, nodeHangingCommand, nodeEvalCommandStart} from './commands.js';

export const assertDurationMs = (t, durationMs) => {
	t.true(Number.isFinite(durationMs));
	t.true(durationMs > 0);
};

export const assertNonExistent = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, commandStart = nonExistentCommand, expectedCommand = commandStart) => {
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed: ${expectedCommand}`);
	t.is(stderr, '');
	t.true(cause.message.includes(commandStart));
	t.is(cause.code, 'ENOENT');
	t.is(cause.syscall, `spawn ${commandStart}`);
	t.is(cause.path, commandStart);
	assertDurationMs(t, durationMs);
};

export const assertWindowsNonExistent = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	t.is(exitCode, 1);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed with exit code 1: ${expectedCommand}`);
	t.true(stderr.includes('not recognized as an internal or external command'));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

export const assertUnixNonExistentShell = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	t.is(exitCode, 127);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed with exit code 127: ${expectedCommand}`);
	t.true(stderr.includes('not found'));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

export const assertUnixNotFound = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	t.is(exitCode, 127);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed with exit code 127: ${expectedCommand}`);
	t.true(stderr.includes('No such file or directory'));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

export const assertFail = (t, {exitCode, signalName, command, message, cause, durationMs}, commandStart = nodeEvalCommandStart) => {
	t.is(exitCode, 2);
	t.is(signalName, undefined);
	t.true(command.startsWith(commandStart));
	t.true(message.startsWith(`Command failed with exit code 2: ${commandStart}`));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

export const assertSigterm = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nodeHangingCommand) => {
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
	t.is(command, expectedCommand);
	t.is(message, `Command was terminated with SIGTERM: ${expectedCommand}`);
	t.is(stderr, '');
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

export const assertEarlyError = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, commandStart = nodeEvalCommandStart) => {
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(command.startsWith(commandStart));
	t.true(message.startsWith(`Command failed: ${commandStart}`));
	t.is(stderr, '');
	t.true(cause.message.includes('options.detached'));
	t.false(cause.message.includes('Command'));
	assertDurationMs(t, durationMs);
};

export const assertAbortError = (t, {exitCode, signalName, command, stderr, message, cause, durationMs}, expectedCause, expectedCommand = nodeHangingCommand) => {
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed: ${expectedCommand}`);
	t.is(stderr, '');
	t.is(cause.message, 'The operation was aborted');
	t.is(cause.cause, expectedCause);
	assertDurationMs(t, durationMs);
};

export const assertErrorEvent = (t, {exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCause, commandStart = nodeEvalCommandStart) => {
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(command.startsWith(commandStart));
	t.true(message.startsWith(`Command failed: ${commandStart}`));
	t.is(stderr, '');
	t.is(cause, expectedCause);
	assertDurationMs(t, durationMs);
};
