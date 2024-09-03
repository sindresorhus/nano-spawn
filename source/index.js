import {spawn} from 'node:child_process';
import {once, on} from 'node:events';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {lineIterator, combineAsyncIterators} from './iterable.js';
import {getForcedShell, escapeArguments} from './windows.js';
import {handlePipe} from './pipe.js';

export default function nanoSpawn(first, second = [], third = {}) {
	let [file, previous] = Array.isArray(first) ? first : [first, {}];
	let [commandArguments, options] = Array.isArray(second) ? [second, third] : [[], second];

	const start = previous.start ?? process.hrtime.bigint();
	const spawnOptions = getOptions(options);
	const command = [previous.command, getCommand(file, commandArguments)].filter(Boolean).join(' | ');
	const context = {start, command, state: initState()};
	[file, commandArguments] = handleNode(file, commandArguments);
	const input = getInput(spawnOptions);

	const nodeChildProcess = getInstance(file, commandArguments, spawnOptions, context);
	const resultPromise = Object.assign(getResult(nodeChildProcess, input, context), {nodeChildProcess});
	const finalPromise = previous.resultPromise === undefined ? resultPromise : handlePipe(previous, resultPromise);

	const stdoutLines = lineIterator(finalPromise, context, 'stdout');
	const stderrLines = lineIterator(finalPromise, context, 'stderr');
	return Object.assign(finalPromise, {
		stdout: stdoutLines,
		stderr: stderrLines,
		[Symbol.asyncIterator]: () => combineAsyncIterators(stdoutLines, stderrLines),
		pipe: (file, second, third) => nanoSpawn([file, {...context, resultPromise: finalPromise}], second, third),
	});
}

const getOptions = ({
	stdin,
	stdout,
	stderr,
	stdio = [stdin, stdout, stderr],
	env: envOption,
	preferLocal,
	cwd: cwdOption = '.',
	...options
}) => {
	const cwd = cwdOption instanceof URL ? fileURLToPath(cwdOption) : path.resolve(cwdOption);
	const env = envOption === undefined ? undefined : {...process.env, ...envOption};
	return {
		...options,
		stdio,
		env: preferLocal ? addLocalPath(env ?? process.env, cwd) : env,
		cwd,
	};
};

const addLocalPath = ({Path = '', PATH = Path, ...env}, cwd) => {
	const pathParts = PATH.split(path.delimiter);
	const localPaths = getLocalPaths([], path.resolve(cwd))
		.map(localPath => path.join(localPath, 'node_modules/.bin'))
		.filter(localPath => !pathParts.includes(localPath));
	return {...env, PATH: [...localPaths, PATH].filter(Boolean).join(path.delimiter)};
};

const getLocalPaths = (localPaths, localPath) => localPaths.at(-1) === localPath
	? localPaths
	: getLocalPaths([...localPaths, localPath], path.resolve(localPath, '..'));

// When running `node`, keep the current Node version and CLI flags.
// Not applied with file paths to `.../node` since those indicate a clear intent to use a specific Node version.
// Does not work with shebangs, but those don't work cross-platform anyway.
const handleNode = (file, commandArguments) => file.toLowerCase().replace(/\.exe$/, '') === 'node'
	? [process.execPath, [...process.execArgv.filter(flag => !flag.startsWith('--inspect')), ...commandArguments]]
	: [file, commandArguments];

const getCommand = (file, commandArguments) => [file, ...commandArguments]
	.map(part => getCommandPart(part))
	.join(' ');

const getCommandPart = part => {
	part = stripVTControlCharacters(part);
	return /[^\w./-]/.test(part)
		? `'${part.replaceAll('\'', '\'\\\'\'')}'`
		: part;
};

const getInput = ({stdio}) => {
	if (stdio[0]?.string === undefined) {
		return;
	}

	const input = stdio[0].string;
	stdio[0] = 'pipe';
	return input;
};

const getInstance = async (file, commandArguments, spawnOptions, context) => {
	try {
		const forcedShell = await getForcedShell(file, spawnOptions);
		spawnOptions.shell ||= forcedShell;
		const instance = spawn(...escapeArguments(file, commandArguments, forcedShell), spawnOptions);
		bufferOutput(instance.stdout, context, 'stdout');
		bufferOutput(instance.stderr, context, 'stderr');

		// The `error` event is caught by `once(instance, 'spawn')` and `once(instance, 'close')`.
		// But it creates an uncaught exception if it happens exactly one tick after 'spawn'.
		// This prevents that.
		instance.once('error', () => {});

		await once(instance, 'spawn');
		return instance;
	} catch (error) {
		throw getResultError(error, initState(), context);
	}
};

const getResult = async (nodeChildProcess, input, context) => {
	const instance = await nodeChildProcess;
	useInput(instance, input);
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

const useInput = (instance, input) => {
	if (input !== undefined) {
		instance.stdin.end(input);
	}
};

const initState = () => ({stdout: '', stderr: '', output: ''});

const bufferOutput = (stream, {state}, streamName) => {
	if (!stream) {
		return;
	}

	stream.setEncoding('utf8');
	if (state.isIterating) {
		return;
	}

	state.isIterating = false;
	stream.on('data', chunk => {
		for (const outputName of [streamName, 'output']) {
			state[outputName] += chunk;
		}
	});
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

const getResultError = (error, instance, context) => Object.assign(
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

const checkFailure = ({command}, {exitCode, signalName}) => {
	if (signalName !== undefined) {
		throw new Error(`Command was terminated with ${signalName}: ${command}`);
	}

	if (exitCode !== undefined) {
		throw new Error(`Command failed with exit code ${exitCode}: ${command}`);
	}
};
