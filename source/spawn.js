import process from 'node:process';
import {applyForceShell} from './windows.js';

export const handleArguments = async (file, commandArguments, options, context) => {
	// When running `node`, keep the current Node version and CLI flags.
	// Not applied with file paths to `.../node` since those indicate a clear intent to use a specific Node version.
	// This also provides a way to opting out, e.g. using `process.execPath` instead of `node` to discard current CLI flags.
	// Does not work with shebangs, but those don't work cross-platform anyway.
	[file, commandArguments] = ['node', 'node.exe'].includes(file.toLowerCase())
		? [process.execPath, [...process.execArgv.filter(flag => !flag.startsWith('--inspect')), ...commandArguments]]
		: [file, commandArguments];

	[file, commandArguments, options] = await applyForceShell(file, commandArguments, options);
	context.isIterating ??= false;
	return [file, commandArguments, {...options, buffer: !context.isIterating}];
};
