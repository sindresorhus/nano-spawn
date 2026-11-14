import {spawn} from 'node:child_process';
import {once} from 'node:events';
import process from 'node:process';
import {applyForceShell} from './windows.js';
import {getResultError} from './result.js';

// Node accepts `--inspect-port 9229` with the value as a separate argument, and dropping only the flag left the value in the arguments, where the child read it as the path of a script to run. Only these two take a separate value; `--inspect` and `--inspect-brk` do not, `--inspect-port=8091` is one token to begin with, and `http` is a value of `--inspect-publish-uid` rather than a flag of its own.
const inspectFlagsWithValue = new Set(['--inspect-port', '--inspect-publish-uid']);

const withoutInspectFlags = arguments_ => {
	const result = [];

	for (let index = 0; index < arguments_.length; index++) {
		const argument = arguments_[index];

		if (inspectFlagsWithValue.has(argument)) {
			index++;
		} else if (!argument.startsWith('--inspect')) {
			result.push(argument);
		}
	}

	return result;
};

// `node.exe` is only the name of the `node` binary on Windows, where binary names are also matched case-insensitively. Elsewhere it is an ordinary file, which must not be replaced, since `result.command` would then report a command that never ran.
const NODE_BINARIES = process.platform === 'win32' ? ['node', 'node.exe'] : ['node'];

export const spawnSubprocess = async (file, commandArguments, options, context) => {
	try {
		// When running `node`, keep the current Node version and CLI flags.
		// Not applied with file paths to `.../node` since those indicate a clear intent to use a specific Node version.
		// This also provides a way to opting out, e.g. using `process.execPath` instead of `node` to discard current CLI flags.
		// Does not work with shebangs, but those don't work cross-platform anyway.
		if (NODE_BINARIES.includes(process.platform === 'win32' ? file.toLowerCase() : file)) {
			file = process.execPath;
			commandArguments = [...withoutInspectFlags(process.execArgv), ...commandArguments];
		}

		[file, commandArguments, options] = await applyForceShell(file, commandArguments, options);
		[file, commandArguments, options] = concatenateShell(file, commandArguments, options);
		const instance = spawn(file, commandArguments, options);
		bufferOutput(instance.stdout, context, 'stdout');
		bufferOutput(instance.stderr, context, 'stderr');

		// The `error` event is caught while waiting for `spawn` and subprocess completion.
		// But it creates an uncaught exception if it happens exactly one tick after 'spawn'.
		// This prevents that.
		instance.once('error', () => {});

		await once(instance, 'spawn');
		return instance;
	} catch (error) {
		throw getResultError(error, {}, context, options);
	}
};

// When the `shell` option is set, any command argument is concatenated as a single string by Node.js:
// https://github.com/nodejs/node/blob/e38ce27f3ca0a65f68a31cedd984cddb927d4002/lib/child_process.js#L614-L624
// However, since Node 24, it also prints a deprecation warning.
// To avoid this warning, we perform that same operation before calling `node:child_process`.
// Shells only understand strings, which is why Node.js performs that concatenation.
// However, we rely on users splitting command arguments as an array.
// For example, this allows us to easily detect whether the binary file is `node` or `node.exe`.
// So we do want users to pass array of arguments even with `shell: true`, but we also want to avoid any warning.
const concatenateShell = (file, commandArguments, options) => options.shell && commandArguments.length > 0
	? [[file, ...commandArguments].join(' '), [], options]
	: [file, commandArguments, options];

const bufferOutput = (stream, {state}, streamName) => {
	if (!stream) {
		return;
	}

	stream.setEncoding('utf8');
	// `true` means the stream is being iterated, so buffering it would defeat the point of iterating
	if (state.isIterating[streamName] === true) {
		return;
	}

	state.isIterating[streamName] = false;
	stream.on('data', chunk => {
		state[streamName] += chunk;
		state.output += chunk;
	});
};
