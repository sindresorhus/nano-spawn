import {once, on} from 'node:events';
import process from 'node:process';

export const getResult = async (nodeChildProcess, options, context) => {
	const instance = await nodeChildProcess;
	useInput(instance, options);
	const onClose = once(instance, 'close');

	try {
		await Promise.race([onClose, ...onStreamErrors(instance)]);
		checkFailure(context, getErrorOutput(instance));
		return getOutputs(context);
	} catch (error) {
		await Promise.allSettled([onClose]);
		throw getResultError(error, instance, context);
	}
};

const useInput = (instance, {input}) => {
	if (input !== undefined) {
		instance.stdin.end(input);
	}
};

const onStreamErrors = ({stdio}) => stdio.filter(Boolean).map(stream => onStreamError(stream));

const onStreamError = async stream => {
	for await (const [error] of on(stream, 'error')) {
		if (!IGNORED_CODES.has(error?.code)) {
			throw error;
		}
	}
};

// Ignore errors that are due to closing errors when the subprocesses exit normally, or due to piping
const IGNORED_CODES = new Set(['ERR_STREAM_PREMATURE_CLOSE', 'EPIPE']);

const checkFailure = ({command}, {exitCode, signalName}) => {
	if (signalName !== undefined) {
		throw new Error(`Command was terminated with ${signalName}: ${command}`);
	}

	if (exitCode !== undefined) {
		throw new Error(`Command failed with exit code ${exitCode}: ${command}`);
	}
};

export const getResultError = (error, instance, context) => Object.assign(
	getErrorInstance(error, context),
	getErrorOutput(instance),
	getOutputs(context),
);

const getErrorInstance = (error, {command}) => error?.message.startsWith('Command ')
	? error
	: new Error(`Command failed: ${command}`, {cause: error});

const getErrorOutput = ({exitCode, signalCode}) => ({
	// `exitCode` can be a negative number (`errno`) when the `error` event is emitted on the `instance`
	...(exitCode === null || exitCode < 1 ? {} : {exitCode}),
	...(signalCode === null ? {} : {signalName: signalCode}),
});

const getOutputs = ({state: {stdout, stderr, output}, command, start}) => ({
	stdout: getOutput(stdout),
	stderr: getOutput(stderr),
	output: getOutput(output),
	command,
	durationMs: Number(process.hrtime.bigint() - start) / 1e6,
});

const getOutput = input => input?.at(-1) === '\n'
	? input.slice(0, input.at(-2) === '\r' ? -2 : -1)
	: input;
