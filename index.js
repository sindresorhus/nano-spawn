import {spawn} from 'node:child_process';
import {once} from 'node:events';
import process from 'node:process';
import {finished} from 'node:stream/promises';
import {lineIterator, combineAsyncIterators} from './utilities.js';

export default function nanoSpawn(command, commandArguments = [], options = {}) {
	[commandArguments, options] = Array.isArray(commandArguments)
		? [commandArguments, options]
		: [[], commandArguments];

	const subprocess = spawn(command, commandArguments, getOptions(options));

	const promise = getResult(subprocess);

	const stdoutLines = lineIterator(subprocess.stdout);
	const stderrLines = lineIterator(subprocess.stderr);
	return Object.assign(promise, {
		subprocess,
		[Symbol.asyncIterator]: () => combineAsyncIterators(stdoutLines, stderrLines),
		stdout: stdoutLines,
		stderr: stderrLines,
	});
}

const getOptions = ({
	stdin,
	stdout,
	stderr,
	stdio = [stdin, stdout, stderr],
	env,
	...options
}) => ({
	...options,
	stdio,
	env: env === undefined ? env : {...process.env, ...env},
});

const getResult = async subprocess => {
	const result = {};
	const onExit = waitForExit(subprocess);
	const onStdoutDone = bufferOutput(subprocess.stdout, result, 'stdout');
	const onStderrDone = bufferOutput(subprocess.stderr, result, 'stderr');

	try {
		await Promise.all([onExit, onStdoutDone, onStderrDone]);
		const output = getOutput(subprocess, result);
		checkFailure(output);
		return output;
	} catch (error) {
		await Promise.allSettled([onExit, onStdoutDone, onStderrDone]);
		throw Object.assign(error, getOutput(subprocess, result));
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

const getOutput = ({exitCode, signalCode}, {stdout, stderr}) => ({
	// `exitCode` can be a negative number (`errno`) when the `error` event is emitted on the subprocess
	...(exitCode === null || exitCode < 0 ? {} : {exitCode}),
	...(signalCode === null ? {} : {signalName: signalCode}),
	stdout: stripNewline(stdout),
	stderr: stripNewline(stderr),
});

const stripNewline = input => input?.at(-1) === '\n'
	? input.slice(0, input.at(-2) === '\r' ? -2 : -1)
	: input;

const checkFailure = ({exitCode, signalName}) => {
	if (signalName !== undefined) {
		throw new Error(`Command was terminated with ${signalName}.`);
	}

	if (exitCode !== 0) {
		throw new Error(`Command failed with exit code ${exitCode}.`);
	}
};
