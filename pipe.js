import {pipeline} from 'node:stream/promises';
import {normalizeArguments, getCommand, spawnProcess} from './spawn.js';
import {addPromiseMethods} from './iterable.js';

export const pipe = (previous, file, commandArguments, options) => {
	[commandArguments, options] = normalizeArguments(commandArguments, options);
	const command = `${previous.context.command} | ${getCommand(file, commandArguments)}`;
	const context = {...previous.context, command};
	const resultPromise = spawnProcess(file, commandArguments, {...options, stdin: 'pipe'}, context);
	const mergedPromise = Object.assign(runProcesses([previous.resultPromise, resultPromise]), resultPromise);
	return addPromiseMethods(mergedPromise, context);
};

const runProcesses = async resultPromises => {
	// Ensure both subprocesses have exited before resolving, and that we handle errors from both
	const returns = await Promise.allSettled([pipeStreams(resultPromises), ...resultPromises]);

	// If both subprocesses fail, throw source error to use a predictable order and avoid race conditions
	const error = returns.map(({reason}) => reason).find(Boolean);
	if (error) {
		throw error;
	}

	return returns[2].value;
};

const pipeStreams = async resultPromises => {
	const {stdin} = await resultPromises[1].nodeChildProcess;

	try {
		const {stdout} = await resultPromises[0].nodeChildProcess;
		if (stdout === null) {
			throw new Error('The "stdout" option cannot be combined with ".pipe()".');
		}

		// Do not `await` nor handle stream errors since this is already done by each subprocess
		// eslint-disable-next-line promise/prefer-await-to-then
		pipeline(stdout, stdin).catch(() => {});
	} catch (error) {
		stdin.end();
		throw error;
	}
};
