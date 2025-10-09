import {spawnSync} from 'node:child_process';
import {nonExistentCommand, nodeHangingCommand, nodeEvalCommandStart} from './commands.js';

export const assertSubprocessErrorName = (t, name) => {
	t.is(name, 'SubprocessError');
};

export const assertDurationMs = (t, durationMs) => {
	t.true(Number.isFinite(durationMs));
	t.true(durationMs >= 0);
};

export const assertNonExistent = (t, {name, exitCode, signalName, command, message, stderr, cause, durationMs}, commandStart = nonExistentCommand, expectedCommand = commandStart) => {
	assertSubprocessErrorName(t, name);
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

// Support localized error messages on non-English Windows.
let nonExistentCommandOutput;
const toNonExistentCommandOutput = command => {
	if (typeof nonExistentCommandOutput !== 'string') {
		const {stderr} = spawnSync(nonExistentCommand, {shell: true, encoding: 'utf8'});
		nonExistentCommandOutput = stderr.replace(/\r?\n$/, '');
	}

	return nonExistentCommandOutput.replaceAll(nonExistentCommand, command.split(/[ /]/)[0]);
};

export const assertWindowsNonExistent = (t, {name, exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	assertSubprocessErrorName(t, name);
	t.is(exitCode, 1);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed with exit code 1: ${expectedCommand}`);
	t.is(stderr, toNonExistentCommandOutput(expectedCommand));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

export const assertUnixNonExistentShell = (t, {name, exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	assertSubprocessErrorName(t, name);
	t.is(exitCode, 127);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed with exit code 127: ${expectedCommand}`);
	t.true(stderr.includes('not found'));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

export const assertUnixNotFound = (t, {name, exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	assertSubprocessErrorName(t, name);
	t.is(exitCode, 127);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed with exit code 127: ${expectedCommand}`);
	t.true(stderr.includes('No such file or directory'));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

export const assertFail = (t, {name, exitCode, signalName, command, message, cause, durationMs}, commandStart = nodeEvalCommandStart) => {
	assertSubprocessErrorName(t, name);
	t.is(exitCode, 2);
	t.is(signalName, undefined);
	t.true(command.startsWith(commandStart));
	t.true(message.startsWith(`Command failed with exit code 2: ${commandStart}`));
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

export const assertSigterm = (t, {name, exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nodeHangingCommand) => {
	assertSubprocessErrorName(t, name);
	t.is(exitCode, undefined);
	t.is(signalName, 'SIGTERM');
	t.is(command, expectedCommand);
	t.is(message, `Command was terminated with SIGTERM: ${expectedCommand}`);
	t.is(stderr, '');
	t.is(cause, undefined);
	assertDurationMs(t, durationMs);
};

export const assertEarlyError = (t, {name, exitCode, signalName, command, message, stderr, cause, durationMs}, commandStart = nodeEvalCommandStart) => {
	assertSubprocessErrorName(t, name);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(command.startsWith(commandStart));
	t.true(message.startsWith(`Command failed: ${commandStart}`));
	t.is(stderr, '');
	t.true(cause.message.includes('options.detached'));
	t.false(cause.message.includes('Command'));
	assertDurationMs(t, durationMs);
};

export const assertAbortError = (t, {name, exitCode, signalName, command, stderr, message, cause, durationMs}, expectedCause, expectedCommand = nodeHangingCommand) => {
	assertSubprocessErrorName(t, name);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.is(command, expectedCommand);
	t.is(message, `Command failed: ${expectedCommand}`);
	t.is(stderr, '');
	t.is(cause.message, 'The operation was aborted');
	t.is(cause.cause, expectedCause);
	assertDurationMs(t, durationMs);
};

export const assertErrorEvent = (t, {name, exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCause, commandStart = nodeEvalCommandStart) => {
	assertSubprocessErrorName(t, name);
	t.is(exitCode, undefined);
	t.is(signalName, undefined);
	t.true(command.startsWith(commandStart));
	t.true(message.startsWith(`Command failed: ${commandStart}`));
	t.is(stderr, '');
	t.is(cause, expectedCause);
	assertDurationMs(t, durationMs);
};
