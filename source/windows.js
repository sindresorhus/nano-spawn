import {stat} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// On Windows, running most executable files (except *.exe and *.com) requires using a shell.
// This includes *.cmd and *.bat, which itself includes Node modules binaries.
// We detect this situation and automatically:
//  - Set the `shell: true` option
//  - Escape shell-specific characters
export const getForcedShell = async (file, {shell, cwd, env = process.env}) => process.platform === 'win32'
	&& !shell
	&& !(await isExe(file, cwd, env));

// Detect whether the executable file is a *.exe or *.com file.
// Windows allows omitting file extensions (present in the `PATHEXT` environment variable).
// Therefore we must use the `PATH` environment variable and make `stat` calls to check this.
// Environment variables are case-insensitive on Windows, so we check both `PATH` and `Path`.
// eslint-disable-next-line no-return-assign
const isExe = async (file, cwd, {Path = '', PATH = Path}) =>
	// If the *.exe or *.com file extension was not omitted.
	// Windows common file systems are case-insensitive.
	exeExtensions.some(extension => file.toLowerCase().endsWith(extension))
	// Use returned assignment to keep code small
	|| (EXE_MEMO[`${file}\0${cwd}\0${PATH}`] ??= await mIsExe(file, cwd, PATH));

// Memoize the following function, for performance
const EXE_MEMO = {};

const mIsExe = async (file, cwd, PATH) => {
	const parts = PATH
		// `PATH` is ;-separated on Windows
		.split(path.delimiter)
		// `PATH` allows leading/trailing ; on Windows
		.filter(Boolean)
		// `PATH` parts can be double quoted on Windows
		.map(part => part.replace(/^"(.*)"$/, '$1'));

	// For performance, parallelize and stop iteration as soon as an *.exe of *.com file is found
	try {
		await Promise.all(exeExtensions
			.flatMap(extension =>
				[cwd, ...parts].map(part => `${path.resolve(part, file)}${extension}`))
			.map(async possibleFile => {
				let fileStat;
				try {
					fileStat = await stat(possibleFile);
				} catch {}

				if (fileStat?.isFile()) {
					// eslint-disable-next-line no-throw-literal
					throw 0;
				}
			}));
	} catch {
		return true;
	}

	return false;
};

// Other file extensions require using a shell
const exeExtensions = ['.exe', '.com'];

// When setting `shell: true` under-the-hood, we must manually escape the file and arguments.
// This ensures arguments are properly split, and prevents command injection.
export const escapeArguments = (file, commandArguments, forcedShell) => forcedShell
	? [escapeFile(file), commandArguments.map(argument => escapeArgument(argument))]
	: [file, commandArguments];

// `cmd.exe` escaping for arguments.
// Taken from https://github.com/moxystudio/node-cross-spawn
const escapeArgument = argument => {
	const escapedArgument = argument
		.replaceAll(/(\\*)"/g, '$1$1\\"')
		.replace(/(\\*)$/, '$1$1');
	return escapeFile(escapeFile(`"${escapedArgument}"`));
};

// `cmd.exe` escaping for file and arguments.
const escapeFile = file => file.replaceAll(/([()\][%!^"`<>&|;, *?])/g, '^$1');
