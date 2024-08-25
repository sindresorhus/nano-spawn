import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {stripVTControlCharacters} from 'node:util';
import path from 'node:path';
import process from 'node:process';
import {finished} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {lineIterator, combineAsyncIterators} from './iterable.js';
import {getForcedShell, escapeArguments} from './windows.js';

export default function nanoSpawn(file, commandArguments = [], options = {}) {
	[commandArguments, options] = Array.isArray(commandArguments)
		? [commandArguments, options]
		: [[], commandArguments];
	const start = process.hrtime.bigint();
	const command = getCommand(file, commandArguments);
	const spawnOptions = getOptions(options);
	[file, commandArguments] = handleNode(file, commandArguments);
	const forcedShell = getForcedShell(file, spawnOptions);
	spawnOptions.shell ||= forcedShell;
	const input = getInput(spawnOptions);

	const subprocess = spawn(...escapeArguments(file, commandArguments, forcedShell), spawnOptions);

	useInput(subprocess, input);
	const resultPromise = getResult(subprocess, start, command);

	const stdoutLines = lineIterator(subprocess.stdout, resultPromise);
	const stderrLines = lineIterator(subprocess.stderr, resultPromise);
	return Object.assign(resultPromise, {
		subprocess,
		[Symbol.asyncIterator]: () => combineAsyncIterators(stdoutLines, stderrLines),
		stdout: stdoutLines,
		stderr: stderrLines,
	});
}

const getCommand = (file, commandArguments) => [file, ...commandArguments]
	.map(part => getCommandPart(part))
	.join(' ');

const getCommandPart = part => {
	part = stripVTControlCharacters(part);
	return /[^\w./-]/.test(part)
		? `'${part.replaceAll('\'', '\'\\\'\'')}'`
		: part;
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

const useInput = (subprocess, input) => {
	if (input !== undefined) {
		subprocess.stdin.end(input);
	}
};

const getResult = async (subprocess, start, command) => {
	const result = {};
	const onExit = waitForExit(subprocess);
	const onStdoutDone = bufferOutput(subprocess.stdout, result, 'stdout');
	const onStderrDone = bufferOutput(subprocess.stderr, result, 'stderr');

	try {
		await Promise.all([onExit, onStdoutDone, onStderrDone]);
		const output = getOutput(subprocess, result, command, start);
		checkFailure(command, output);
		return output;
	} catch (error) {
		await Promise.allSettled([onExit, onStdoutDone, onStderrDone]);
		throw Object.assign(getResultError(error, command), getOutput(subprocess, result, command, start));
	}
};

// The `error` event on subprocess is emitted either:
//  - Before `spawn`, e.g. for a non-existing executable file.
//    Then, `subprocess.pid` is `undefined` and `close` is never emitted.
//  - After `spawn`, e.g. for the `signal` option.
//    Then, `subprocess.pid` is set and `close` is always emitted.
const waitForExit = async subprocess => {
	try {
		await once(subprocess, 'close');
	} catch (error) {
		if (subprocess.pid !== undefined) {
			await Promise.allSettled([once(subprocess, 'close')]);
		}

		throw error;
	}
};

const bufferOutput = async (stream, result, streamName) => {
	if (!stream) {
		return;
	}

	stream.setEncoding('utf8');
	result[streamName] = '';
	stream.on('data', chunk => {
		result[streamName] += chunk;
	});
	await finished(stream, {cleanup: true});
};

const getOutput = ({exitCode, signalCode}, {stdout, stderr}, command, start) => ({
	// `exitCode` can be a negative number (`errno`) when the `error` event is emitted on the subprocess
	...(exitCode === null || exitCode < 0 ? {} : {exitCode}),
	...(signalCode === null ? {} : {signalName: signalCode}),
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

	if (exitCode !== 0) {
		throw new Error(`Command failed with exit code ${exitCode}: ${command}`);
	}
};

const getResultError = (error, command) => error?.message.startsWith('Command ')
	? error
	: new Error(`Command failed: ${command}`, {cause: error});
