import {getContext} from './context.js';
import {getOptions} from './options.js';
import {handleArguments} from './spawn.js';
import picoSpawn from './pico-spawn.js';
import {getResult} from './result.js';
import {handlePipe} from './pipe.js';
import {lineIterator, combineAsyncIterators} from './iterable.js';

export default function spawn(file, second, third, previous) {
	const [commandArguments = [], options = {}] = Array.isArray(second) ? [second, third] : [[], second];
	const context = getContext([file, ...commandArguments]);
	const spawnOptions = getOptions(options);
	const picoPromise = getPicoSubprocess(file, commandArguments, spawnOptions, context);
	const nodeChildProcess = getNodeChildProcess(picoPromise);
	let subprocess = getResult(picoPromise, nodeChildProcess, context, spawnOptions);
	Object.assign(subprocess, {nodeChildProcess});
	subprocess = previous ? handlePipe([previous, subprocess]) : subprocess;

	const stdout = lineIterator(subprocess, context, 'stdout');
	const stderr = lineIterator(subprocess, context, 'stderr');
	return Object.assign(subprocess, {
		nodeChildProcess,
		stdout,
		stderr,
		[Symbol.asyncIterator]: () => combineAsyncIterators(stdout, stderr),
		pipe: (file, second, third) => spawn(file, second, third, subprocess),
	});
}

const getPicoSubprocess = async (file, commandArguments, spawnOptions, context) => {
	const spawnArguments = await handleArguments(file, commandArguments, spawnOptions, context);
	const picoSubprocess = picoSpawn(...spawnArguments);
	return {picoSubprocess};
};

const getNodeChildProcess = async picoPromise => {
	const {picoSubprocess} = await picoPromise;
	return picoSubprocess.nodeChildProcess;
};
