import process from 'node:process';

export const getResult = async (nodeChildProcess, options, context) => {
	const instance = await nodeChildProcess;
	if (options.input !== undefined) {
		instance.stdin.end(options.input);
	}

	try {
		await waitForCompletion(instance);
		checkFailure(context, getErrorOutput(instance));
		return getOutputs(context);
	} catch (error) {
		// A stdio stream error is a failure in itself, so it is reported right away instead of waiting for the `close` event. Otherwise a broken stream on a long-running subprocess would swallow the error forever. The subprocess can still be terminated using `nodeChildProcess`. Cancellation is not reported right away: it waits for the subprocess to close, so its final output is included.
		throw getResultError(error, instance, context, options);
	}
};

const waitForCompletion = instance => new Promise((resolve, reject) => {
	let cancellationError;
	const onInstanceError = error => {
		if (error.code === 'ABORT_ERR') {
			// Cancellation sends a signal, but the subprocess may still need time to exit and flush its output.
			cancellationError = error;
		} else {
			reject(error);
		}
	};

	const streams = instance.stdio.filter(Boolean);
	const onStreamError = error => {
		// Ignore errors that are due to closing errors when the subprocesses exit normally, or due to piping
		if (!['ERR_STREAM_PREMATURE_CLOSE', 'EPIPE'].includes(error?.code)) {
			reject(error);
		}
	};

	for (const stream of streams) {
		stream.on('error', onStreamError);
	}

	instance.on('error', onInstanceError);
	instance.once('close', () => {
		// A stream failure rejects right away, but the child may still run. Keep handling errors until it closes, then release all observers.
		instance.off('error', onInstanceError);
		for (const stream of streams) {
			stream.off('error', onStreamError);
		}

		if (cancellationError === undefined) {
			resolve();
		} else {
			reject(cancellationError);
		}
	});
});

const checkFailure = ({command}, {exitCode, signalName}) => {
	if (signalName !== undefined) {
		throw new SubprocessError(`Command was terminated with ${signalName}: ${command}`);
	}

	if (exitCode !== undefined) {
		throw new SubprocessError(`Command failed with exit code ${exitCode}: ${command}`);
	}
};

export const getResultError = (error, instance, context, {signal}) => Object.assign(
	getErrorInstance(error, context),
	getErrorOutput(instance),
	{isCanceled: signal?.aborted === true},
	getOutputs(context),
);

const getErrorInstance = (error, {command}) => error instanceof SubprocessError
	? error
	: new SubprocessError(`Command failed: ${command}`, {cause: error});

export class SubprocessError extends Error {
	name = 'SubprocessError';
}

const getErrorOutput = ({exitCode, signalCode}) => ({
	// `exitCode` can be a negative number (`errno`) when the `error` event is emitted on the `instance`
	...(!(exitCode < 1) && {exitCode}),
	...(signalCode !== null && {signalName: signalCode}),
});

const getOutputs = ({state: {stdout, stderr, output}, command, start}) => ({
	stdout: getOutput(stdout),
	stderr: getOutput(stderr),
	output: getOutput(output),
	command,
	durationMs: Number(process.hrtime.bigint() - start) / 1e6,
});

const getOutput = output => output.at(-1) === '\n'
	? output.slice(0, output.at(-2) === '\r' ? -2 : -1)
	: output;
