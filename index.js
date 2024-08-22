import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {lineIterator, combineAsyncIterators} from './utilities.js';

export default function nanoSpawn(command, rawArguments = [], rawOptions = {}) {
	const [commandArguments, {signal, timeout, nativeOptions}] = Array.isArray(rawArguments)
		? [rawArguments, rawOptions]
		: [[], rawArguments];

	const subprocess = spawn(command, commandArguments, {...nativeOptions, signal, timeout});

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

const getResult = async subprocess => {
	const result = {};
	bufferOutput(subprocess.stdout, result, 'stdout');
	bufferOutput(subprocess.stderr, result, 'stderr');

	try {
		await once(subprocess, 'close');
		return getOutput(subprocess, result);
	} catch (error) {
		// The `error` event on subprocess is emitted either:
		//  - Before `spawn`, e.g. for a non-existing executable file.
		//    Then, `subprocess.pid` is `undefined` and `close` is never emitted.
		//  - After `spawn`, e.g. for the `signal` option.
		//    Then, `subprocess.pid` is set and `close` is always emitted.
		if (subprocess.pid !== undefined) {
			await Promise.allSettled([once(subprocess, 'close')]);
		}

		throw Object.assign(error, getOutput(subprocess, result));
	}
};

const bufferOutput = (stream, result, streamName) => {
	stream.setEncoding('utf8');
	result[streamName] = '';
	stream.on('data', chunk => {
		result[streamName] += chunk;
	});
};

const getOutput = ({exitCode, signalCode}, {stdout, stderr}) => ({
	// `exitCode` can be a negative number (`errno`) when the `error` event is emitted on the subprocess
	...(exitCode === null || exitCode < 0 ? {} : {exitCode}),
	...(signalCode === null ? {} : {signalName: signalCode}),
	stdout: stripNewline(stdout),
	stderr: stripNewline(stderr),
});

const stripNewline = input => input.at(-1) === '\n'
	? input.slice(0, input.at(-2) === '\r' ? -2 : -1)
	: input;
