import {pipeline} from 'node:stream/promises';
import {getResultError, SubprocessError} from './result.js';

export const handlePipe = async (subprocesses, context, options) => {
	// Ensure both subprocesses have exited before resolving, and that we handle errors from both.
	// If the piping cannot be set up, this rejects right away instead.
	const [[from, to]] = await Promise.all([Promise.allSettled(subprocesses), pipeStreams(subprocesses, context, options)]);
	const pipedFrom = from.reason ?? from.value;

	// If both subprocesses fail, throw destination error to use a predictable order and avoid race conditions
	if (to.reason) {
		to.reason.pipedFrom = pipedFrom;
		throw to.reason;
	}

	// The destination stopping to read ends the source with `SIGPIPE`. The pipeline itself caused that, so the pipeline takes the destination's outcome, as a shell does, and the source's error stays reachable through `pipedFrom`.
	if (from.reason && from.reason.signalName !== 'SIGPIPE') {
		throw from.reason;
	}

	return {...to.value, pipedFrom};
};

const pipeStreams = async (subprocesses, context, options) => {
	try {
		const [{stdout}, {stdin}] = await Promise.all(subprocesses.map(({nodeChildProcess}) => nodeChildProcess));
		if (stdin === null) {
			throw invalidOptionsError('The "stdin" option must be "pipe" on the destination of ".pipe()".', context, options);
		}

		if (stdout === null) {
			throw invalidOptionsError('The "stdout" option must be "pipe" on the source of ".pipe()".', context, options);
		}

		// Piping the same source to several destinations is supported, and `pipeline()` adds several listeners to its `stdout` for each of them. Node warns about that past 10 listeners, so the limit is lifted: this stream belongs to the subprocess and is destroyed when it ends.
		stdout.setMaxListeners(0);

		// Do not `await` nor handle stream errors since this is already done by each subprocess
		pipeline(stdout, stdin).catch(() => {});
	} catch (error) {
		await Promise.allSettled(subprocesses.map(({nodeChildProcess}) => closeStdin(nodeChildProcess)));
		throw error;
	}
};

// Invalid `stdio` options are `spawn()` misuse, so they must reject with the same `SubprocessError` shape as any other failure. They reject right away, since nothing is piped and either subprocess may never exit.
// No command is appended to the message: it names which of the two subprocesses is at fault, and appending the destination's command would contradict it for the `stdout` case, whose option belongs to the source.
const invalidOptionsError = (message, context, options) => getResultError(
	new SubprocessError(message),
	{},
	context,
	options,
);

const closeStdin = async nodeChildProcess => {
	const {stdin} = await nodeChildProcess;
	stdin.end();
};
