import {spawn} from 'node:child_process';
import {once} from 'node:events';
import process from 'node:process';
import {getForcedShell, escapeArguments} from './windows.js';
import {getResultError} from './result.js';

export const spawnSubprocess = async (rawFile, rawArguments, options, context) => {
	try {
		const [file, commandArguments] = handleNode(rawFile, rawArguments);
		const forcedShell = await getForcedShell(file, options);
		const instance = spawn(...escapeArguments(file, commandArguments, forcedShell), {
			...options,
			shell: options.shell || forcedShell,
		});
		bufferOutput(instance.stdout, context, 'stdout');
		bufferOutput(instance.stderr, context, 'stderr');

		// The `error` event is caught by `once(instance, 'spawn')` and `once(instance, 'close')`.
		// But it creates an uncaught exception if it happens exactly one tick after 'spawn'.
		// This prevents that.
		instance.once('error', () => {});

		await once(instance, 'spawn');
		return instance;
	} catch (error) {
		throw getResultError(error, {}, context);
	}
};

// When running `node`, keep the current Node version and CLI flags.
// Not applied with file paths to `.../node` since those indicate a clear intent to use a specific Node version.
// Does not work with shebangs, but those don't work cross-platform anyway.
const handleNode = (rawFile, rawArguments) => rawFile.toLowerCase().replace(/\.exe$/, '') === 'node'
	? [process.execPath, [...process.execArgv.filter(flag => !flag.startsWith('--inspect')), ...rawArguments]]
	: [rawFile, rawArguments];

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
