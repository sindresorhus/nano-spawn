import {pipeline} from 'node:stream/promises';

export const handlePipe = (previous, subprocess) => Object.assign(runProcesses([previous.subprocess, subprocess]), subprocess);

const runProcesses = async subprocesses => {
	// Ensure both subprocesses have exited before resolving, and that we handle errors from both
	const returns = await Promise.allSettled([pipeStreams(subprocesses), ...subprocesses]);

	// If both subprocesses fail, throw source error to use a predictable order and avoid race conditions
	const error = returns.map(({reason}) => reason).find(Boolean);
	if (error) {
		throw error;
	}

	return returns[2].value;
};

const pipeStreams = async subprocesses => {
	try {
		const [{stdout}, {stdin}] = await Promise.all(subprocesses.map(({nodeChildProcess}) => nodeChildProcess));
		if (stdin === null) {
			throw new Error('The "stdin" option must be set on the first "nanoSpawn()" call in the pipeline.');
		}

		if (stdout === null) {
			throw new Error('The "stdout" option must be set on the last "nanoSpawn()" call in the pipeline.');
		}

		// Do not `await` nor handle stream errors since this is already done by each subprocess
		// eslint-disable-next-line promise/prefer-await-to-then
		pipeline(stdout, stdin).catch(() => {});
	} catch (error) {
		await Promise.allSettled(subprocesses.map(({nodeChildProcess}) => closeStdin(nodeChildProcess)));
		throw error;
	}
};

const closeStdin = async nodeChildProcess => {
	const {stdin} = await nodeChildProcess;
	stdin.end();
};
