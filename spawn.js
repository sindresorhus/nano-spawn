import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import process from 'node:process';
import {finished} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {lineIterator, combineAsyncIterators} from './iterable.js';
import {getForcedShell, escapeArguments} from './windows.js';

export const normalizeArguments = (commandArguments = [], options = {}) => Array.isArray(commandArguments)
	? [commandArguments, options]
	: [[], commandArguments];

export const getCommand = (file, commandArguments) => [file, ...commandArguments]
	.map(part => getCommandPart(part))
	.join(' ');

const getCommandPart = part => {
	part = stripVTControlCharacters(part);
	return /[^\w./-]/.test(part)
		? `'${part.replaceAll('\'', '\'\\\'\'')}'`
		: part;
};

export const spawnProcess = ({file, commandArguments, options, start, command}) => {
	const spawnOptions = getOptions(options);
	[file, commandArguments] = handleNode(file, commandArguments);
	const input = getInput(spawnOptions);

	const instancePromise = getInstance({
		file,
		commandArguments,
		spawnOptions,
		start,
		command,
	});
	const resultPromise = getResult(instancePromise, input, start, command);
	const stdoutLines = lineIterator(instancePromise, 'stdout', resultPromise);
	const stderrLines = lineIterator(instancePromise, 'stderr', resultPromise);

	return Object.assign(resultPromise, {
		nodeChildProcess: instancePromise,
		[Symbol.asyncIterator]: () => combineAsyncIterators(stdoutLines, stderrLines),
		stdout: stdoutLines,
		stderr: stderrLines,
	});
};

const getInstance = async ({file, commandArguments, spawnOptions, start, command}) => {
	try {
		const forcedShell = await getForcedShell(file, spawnOptions);
		spawnOptions.shell ||= forcedShell;
		const instance = spawn(...escapeArguments(file, commandArguments, forcedShell), spawnOptions);

		// The `error` event is caught by `once(instance, 'spawn')` and `once(instance, 'close')`.
		// But it creates an uncaught exception if it happens exactly one tick after 'spawn'.
		// This prevents that.
		instance.once('error', () => {});

		await once(instance, 'spawn');
		return instance;
	} catch (error) {
		throw getResultError({
			error,
			result: initResult(),
			instance: {},
			start,
			command,
		});
	}
};

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

const getInput = ({stdio}) => {
	if (stdio[0]?.string === undefined) {
		return;
	}

	const input = stdio[0].string;
	stdio[0] = 'pipe';
	return input;
};

const getResult = async (instancePromise, input, start, command) => {
	const instance = await instancePromise;
	useInput(instance, input);
	const result = initResult();
	const onExit = once(instance, 'close');
	const onStdoutDone = bufferOutput(instance.stdout, result, 'stdout');
	const onStderrDone = bufferOutput(instance.stderr, result, 'stderr');

	try {
		await Promise.all([onExit, onStdoutDone, onStderrDone]);
		checkFailure(command, getErrorOutput(instance));
		return getOutput(result, command, start);
	} catch (error) {
		await Promise.allSettled([onExit, onStdoutDone, onStderrDone]);
		throw getResultError({
			error,
			result,
			instance,
			start,
			command,
		});
	}
};

const useInput = (instance, input) => {
	if (input !== undefined) {
		instance.stdin.end(input);
	}
};

const initResult = () => ({stdout: '', stderr: ''});

const bufferOutput = async (stream, result, streamName) => {
	if (!stream) {
		return;
	}

	stream.setEncoding('utf8');
	stream.on('data', chunk => {
		result[streamName] += chunk;
	});
	await finished(stream, {cleanup: true});
};

const getResultError = ({error, result, instance, start, command}) => Object.assign(
	getErrorInstance(error, command),
	getErrorOutput(instance),
	getOutput(result, command, start),
);

const getErrorInstance = (error, command) => error?.message.startsWith('Command ')
	? error
	: new Error(`Command failed: ${command}`, {cause: error});

const getErrorOutput = ({exitCode, signalCode}) => ({
	// `exitCode` can be a negative number (`errno`) when the `error` event is emitted on the `instance`
	...(exitCode === null || exitCode < 1 ? {} : {exitCode}),
	...(signalCode === null ? {} : {signalName: signalCode}),
});

const getOutput = ({stdout, stderr}, command, start) => ({
	stdout: stripNewline(stdout),
	stderr: stripNewline(stderr),
	command,
	durationMs: Number(process.hrtime.bigint() - start) / 1e6,
});

const stripNewline = input => input?.at(-1) === '\n'
	? input.slice(0, input.at(-2) === '\r' ? -2 : -1)
	: input;

const checkFailure = (command, {exitCode, signalName}) => {
	if (signalName !== undefined) {
		throw new Error(`Command was terminated with ${signalName}: ${command}`);
	}

	if (exitCode !== undefined) {
		throw new Error(`Command failed with exit code ${exitCode}: ${command}`);
	}
};
