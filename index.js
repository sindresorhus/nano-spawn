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
		const [exitCode] = await once(subprocess, 'close');
		return {...getOutput(result), exitCode};
	} catch (error) {
		throw Object.assign(error, getOutput(result));
	}
};

const bufferOutput = (stream, result, streamName) => {
	stream.setEncoding('utf8');
	result[streamName] = '';
	stream.on('data', chunk => {
		result[streamName] += chunk;
	});
};

const getOutput = ({stdout, stderr}) => ({
	stdout: stripNewline(stdout),
	stderr: stripNewline(stderr),
});

const stripNewline = input => input.at(-1) === '\n'
	? input.slice(0, input.at(-2) === '\r' ? -2 : -1)
	: input;
