import {statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

// On Windows, running most executable files (except *.exe and *.com) requires using a shell.
// This includes *.cmd and *.bat, which itself includes Node modules binaries.
// We detect this situation and automatically:
//  - Set the `shell: true` option
//  - Escape shell-specific characters
export const getForcedShell = (file, {shell, cwd = '.', env = process.env}) => process.platform === 'win32'
	&& !shell
	&& !isExe(file, cwd, env);

// Detect whether the executable file is a *.exe or *.com file.
// Windows allows omitting file extensions (present in the `PATHEXT` environment variable).
// Therefore we must use the `PATH` environment variable and make `stat` calls to check this.
// Environment variables are case-insensitive on Windows, so we check both `PATH` and `Path`.
const isExe = (file, cwd, {Path = '', PATH = Path}) => {
	// If the *.exe or *.com file extension was not omitted.
	// Windows common file systems are case-insensitive.
	if (exeExtensions.some(extension => file.toLowerCase().endsWith(extension))) {
		return true;
	}

	const cwdPath = cwd instanceof URL ? fileURLToPath(cwd) : cwd;
	const parts = PATH
		// `PATH` is ;-separated on Windows
		.split(path.delimiter)
		// `PATH` allows leading/trailing ; on Windows
		.filter(Boolean)
		// `PATH` parts can be double quoted on Windows
		.map(part => part.replace(/^"(.*)"$/, '$1'));
	const possibleFiles = exeExtensions.flatMap(extension =>
		[cwdPath, ...parts].map(part => `${path.resolve(part, file)}${extension}`));
	return possibleFiles.some(possibleFile => {
		try {
			// This must unfortunately be synchronous because we return the spawned `subprocess` synchronously
			return statSync(possibleFile).isFile();
		} catch {
			return false;
		}
	});
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
