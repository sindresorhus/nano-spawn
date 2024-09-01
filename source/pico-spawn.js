import {spawn} from 'node:child_process';
import {once, on} from 'node:events';

export default function picoSpawn(file, second, third) {
	const [commandArguments = [], options = {}] = Array.isArray(second) ? [second, third] : [[], second];
	const state = {
		stdout: '',
		stderr: '',
		output: '',
		command: [file, ...commandArguments].join(' '),
	};
	const nodeChildProcess = spawnSubprocess(file, commandArguments, options, state);
	return Object.assign(getResult(nodeChildProcess, state), {nodeChildProcess});
}

const spawnSubprocess = async (file, commandArguments, options, state) => {
	try {
		const instance = spawn(file, commandArguments, options);
		bufferOutput(instance.stdout, 'stdout', options, state);
		bufferOutput(instance.stderr, 'stderr', options, state);

		// The `error` event is caught by `once(instance, 'spawn')` and `once(instance, 'close')`.
		// But it creates an uncaught exception if it happens exactly one tick after 'spawn'.
		// This prevents that.
		instance.once('error', () => {});

		await once(instance, 'spawn');
		return instance;
	} catch (error) {
		throw getSubprocessError(error, {}, state);
	}
};

const bufferOutput = (stream, streamName, {buffer = true}, state) => {
	if (stream) {
		stream.setEncoding('utf8');
		if (buffer) {
			stream.on('data', chunk => {
				state[streamName] += chunk;
				state.output += chunk;
			});
		}
	}
};

const getResult = async (nodeChildProcess, state) => {
	const instance = await nodeChildProcess;
	const onClose = once(instance, 'close');

	try {
		await Promise.race([
			onClose,
			...instance.stdio.filter(Boolean).map(stream => onStreamError(stream)),
		]);
		checkFailure(instance, state);
		return state;
	} catch (error) {
		await Promise.allSettled([onClose]);
		throw getSubprocessError(error, instance, state);
	}
};

const onStreamError = async stream => {
	for await (const [error] of on(stream, 'error')) {
		// Ignore errors that are due to closing errors when the subprocesses exit normally, or due to piping
		if (!['ERR_STREAM_PREMATURE_CLOSE', 'EPIPE'].includes(error?.code)) {
			throw error;
		}
	}
};

const checkFailure = ({exitCode, signalCode}, {command}) => {
	if (signalCode) {
		throw new Error(`Command was terminated with ${signalCode}: ${command}`);
	}

	if (exitCode >= 1) {
		throw new Error(`Command failed with exit code ${exitCode}: ${command}`);
	}
};

const getSubprocessError = (error, {exitCode, signalCode}, state) => Object.assign(
	error?.message.startsWith('Command ')
		? error
		: new Error(`Command failed: ${state.command}`, {cause: error}),
	// `exitCode` can be a negative number (`errno`) when the `error` event is emitted on the `instance`
	exitCode >= 1 ? {exitCode} : {},
	signalCode ? {signalName: signalCode} : {},
	state,
);
