import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {nonExistentCommand, nodeHangingCommand, nodeEvalCommandStart} from './commands.js';

export const assertSubprocessErrorName = name => {
	assert.equal(name, 'SubprocessError');
};

// `assert.rejects()` resolves with `undefined`, but these tests assert on the rejection itself, so this returns the error like AVA's `t.throwsAsync()` did.
export const throwsAsync = async (promise, expectation) => {
	let error;
	await assert.rejects(promise, rejection => {
		error = rejection;
		return true;
	});

	if (expectation) {
		assert.throws(() => {
			throw error;
		}, expectation);
	}

	return error;
};

export const assertDurationMs = durationMs => {
	assert.ok(Number.isFinite(durationMs));
	assert.ok(durationMs >= 0);
};

export const assertNonExistent = ({name, exitCode, signalName, isCanceled, command, message, stderr, cause, durationMs}, commandStart = nonExistentCommand, expectedCommand = commandStart) => {
	assertSubprocessErrorName(name);
	assert.equal(exitCode, undefined);
	assert.equal(signalName, undefined);
	assert.equal(isCanceled, false);
	assert.equal(command, expectedCommand);
	assert.equal(message, `Command failed: ${expectedCommand}`);
	assert.equal(stderr, '');
	assert.ok(cause.message.includes(commandStart));
	assert.equal(cause.code, 'ENOENT');
	assert.equal(cause.syscall, `spawn ${commandStart}`);
	assert.equal(cause.path, commandStart);
	assertDurationMs(durationMs);
};

// Support localized error messages on non-English Windows.
let nonExistentCommandOutput;
const toNonExistentCommandOutput = command => {
	if (typeof nonExistentCommandOutput !== 'string') {
		const {stderr} = spawnSync(nonExistentCommand, {shell: true, encoding: 'utf8'});
		nonExistentCommandOutput = stderr.replace(/\r?\n$/v, '');
	}

	// The replacement is a test command name, which never contains a `$` substitution pattern
	// eslint-disable-next-line unicorn/no-unsafe-string-replacement
	return nonExistentCommandOutput.replaceAll(nonExistentCommand, command.split(/[ \/]/v, 1)[0]);
};

export const assertWindowsNonExistent = ({name, exitCode, signalName, isCanceled, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	assertSubprocessErrorName(name);
	assert.equal(exitCode, 1);
	assert.equal(signalName, undefined);
	assert.equal(isCanceled, false);
	assert.equal(command, expectedCommand);
	assert.equal(message, `Command failed with exit code 1: ${expectedCommand}`);
	assert.equal(stderr, toNonExistentCommandOutput(expectedCommand));
	assert.equal(cause, undefined);
	assertDurationMs(durationMs);
};

export const assertUnixNonExistentShell = ({name, exitCode, signalName, isCanceled, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	assertSubprocessErrorName(name);
	assert.equal(exitCode, 127);
	assert.equal(signalName, undefined);
	assert.equal(isCanceled, false);
	assert.equal(command, expectedCommand);
	assert.equal(message, `Command failed with exit code 127: ${expectedCommand}`);
	assert.ok(stderr.includes('not found'));
	assert.equal(cause, undefined);
	assertDurationMs(durationMs);
};

export const assertUnixNotFound = ({name, exitCode, signalName, isCanceled, command, message, stderr, cause, durationMs}, expectedCommand = nonExistentCommand) => {
	assertSubprocessErrorName(name);
	assert.equal(exitCode, 127);
	assert.equal(signalName, undefined);
	assert.equal(isCanceled, false);
	assert.equal(command, expectedCommand);
	assert.equal(message, `Command failed with exit code 127: ${expectedCommand}`);
	assert.ok(stderr.includes('No such file or directory'));
	assert.equal(cause, undefined);
	assertDurationMs(durationMs);
};

export const assertFail = ({name, exitCode, signalName, isCanceled, command, message, cause, durationMs}, commandStart = nodeEvalCommandStart) => {
	assertSubprocessErrorName(name);
	assert.equal(exitCode, 2);
	assert.equal(signalName, undefined);
	assert.equal(isCanceled, false);
	assert.ok(command.startsWith(commandStart));
	assert.ok(message.startsWith(`Command failed with exit code 2: ${commandStart}`));
	assert.equal(cause, undefined);
	assertDurationMs(durationMs);
};

export const assertSigterm = ({name, exitCode, signalName, command, message, stderr, cause, durationMs}, expectedCommand = nodeHangingCommand) => {
	assertSubprocessErrorName(name);
	assert.equal(exitCode, undefined);
	assert.equal(signalName, 'SIGTERM');
	assert.equal(command, expectedCommand);
	assert.equal(message, `Command was terminated with SIGTERM: ${expectedCommand}`);
	assert.equal(stderr, '');
	assert.equal(cause, undefined);
	assertDurationMs(durationMs);
};

export const assertEarlyError = ({name, exitCode, signalName, isCanceled, command, message, stderr, cause, durationMs}, commandStart = nodeEvalCommandStart) => {
	assertSubprocessErrorName(name);
	assert.equal(exitCode, undefined);
	assert.equal(signalName, undefined);
	assert.equal(isCanceled, false);
	assert.ok(command.startsWith(commandStart));
	assert.ok(message.startsWith(`Command failed: ${commandStart}`));
	assert.equal(stderr, '');
	assert.ok(cause.message.includes('options.detached'));
	assert.equal(cause.message.includes('Command'), false);
	assertDurationMs(durationMs);
};

export const assertAbortError = ({name, exitCode, signalName, isCanceled, command, stderr, message, cause, durationMs}, expectedCause, expectedCommand = nodeHangingCommand) => {
	assertSubprocessErrorName(name);
	assert.equal(exitCode, undefined);
	assert.equal(signalName, 'SIGTERM');
	assert.equal(isCanceled, true);
	assert.equal(command, expectedCommand);
	assert.equal(message, `Command failed: ${expectedCommand}`);
	assert.equal(stderr, '');
	assert.equal(cause.message, 'The operation was aborted');
	assert.equal(cause.cause, expectedCause);
	assertDurationMs(durationMs);
};

export const assertErrorEvent = ({name, exitCode, signalName, isCanceled, command, message, stderr, cause, durationMs}, expectedCause, commandStart = nodeEvalCommandStart) => {
	assertSubprocessErrorName(name);
	assert.equal(exitCode, undefined);
	assert.equal(signalName, undefined);
	assert.equal(isCanceled, false);
	assert.ok(command.startsWith(commandStart));
	assert.ok(message.startsWith(`Command failed: ${commandStart}`));
	assert.equal(stderr, '');
	assert.equal(cause, expectedCause);
	assertDurationMs(durationMs);
};
