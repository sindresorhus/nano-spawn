import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// When setting `shell: true` under-the-hood, we must manually escape the file and arguments.
// This ensures arguments are properly split, and prevents command injection.
export const applyForceShell = async (file, commandArguments, options) => await shouldForceShell(file, options)
	? [escapeFile(file), commandArguments.map(argument => escapeArgument(argument)), {...options, shell: true}]
	: [file, commandArguments, options];

// On Windows, running most executable files (except *.exe and *.com) requires using a shell.
// This includes *.cmd and *.bat, which itself includes Node modules binaries.
// We detect this situation and automatically:
//  - Set the `shell: true` option
//  - Escape shell-specific characters
const shouldForceShell = async (file, {shell, cwd, env = process.env}) => process.platform === 'win32'
	&& !shell
	&& !(await isExe(file, cwd, env));

// Detect whether the executable file is a *.exe or *.com file.
// Windows allows omitting file extensions (present in the `PATHEXT` environment variable).
// Therefore we must use the `PATH` environment variable and make `access` calls to check this.
// Environment variables are case-insensitive on Windows, so we check both `PATH` and `Path`.
const isExe = (file, cwd, {Path = '', PATH = Path}) =>
	// If the *.exe or *.com file extension was not omitted.
	// Windows common file systems are case-insensitive.
	exeExtensions.some(extension => file.toLowerCase().endsWith(extension))
	|| mIsExe(file, cwd, PATH);

// Memoize the `mIsExe` and `fs.access`, for performance
const EXE_MEMO = {};
// eslint-disable-next-line no-return-assign
const memoize = function_ => (...arguments_) =>
	// Use returned assignment to keep code small
	EXE_MEMO[arguments_.join('\0')] ??= function_(...arguments_);

const access = memoize(fs.access);
const mIsExe = memoize(async (file, cwd, PATH) => {
	const parts = PATH
		// `PATH` is ;-separated on Windows
		.split(path.delimiter)
		// `PATH` allows leading/trailing ; on Windows
		.filter(Boolean)
		// `PATH` parts can be double quoted on Windows
		.map(part => part.replace(/^"(.*)"$/, '$1'));

	// For performance, parallelize and stop iteration as soon as an *.exe or *.com file is found
	try {
		await Promise.any(
			[cwd, ...parts].flatMap(part => exeExtensions
				.map(extension => access(`${path.resolve(part, file)}${extension}`)),
			),
		);
	} catch {
		return false;
	}

	return true;
});

// Other file extensions require using a shell
const exeExtensions = ['.exe', '.com'];

// `cmd.exe` escaping for arguments.
// This is the same as Rust's `std::process::Command` for batch files, which fixed the "BatBadBut" vulnerability (CVE-2024-24576): https://github.com/rust-lang/rust/blob/main/library/std/src/sys/args/windows.rs (`append_bat_arg()`). Execa does the same.
// Arguments are quoted instead of caret-escaped. `cmd.exe` interprets an argument once when a batch file reads it with `%~1`, like Maven's `mvn.cmd`, but twice when a batch file forwards it with `%*`, like Node modules binaries. Caret escaping depends on that count, but quoting does not.
// The backslashes preceding a double quote, and those at the end of the argument, are doubled. Each run of backslashes is matched once, so this takes linear time. A `(\\*)"` replacement would backtrack and take quadratic time on long runs of backslashes, blocking the event loop.
// Then, `"` becomes `""`, which keeps the quotes balanced for `cmd.exe`, and `%` becomes `%%cd:~,%`, which is a literal `%` followed by an empty substring of `%cd%`. This prevents `%VAR%` from being expanded.
const escapeArgument = argument => {
	if (!shouldQuoteArgument(argument)) {
		return argument;
	}

	const escapedArgument = argument
		.replaceAll(/\\+/gv, (backslashes, offset) => ['"', undefined].includes(argument[offset + backslashes.length]) ? backslashes.repeat(2) : backslashes)
		.replaceAll('"', '""')
		.replaceAll('%', '%%cd:~,%');
	return `"${escapedArgument}"`;
};

// An empty argument must be quoted, otherwise it would be dropped.
// An argument ending with a backslash must be quoted, otherwise a batch file wrapping it in double quotes, like `"%~1"`, would have that backslash escape its closing double quote.
// Otherwise, only arguments with characters that `cmd.exe` might interpret are quoted, so a batch file reading `%1` gets what the user passed, like when run from a terminal. Those are any characters except ASCII letters, digits, a few punctuation characters, and non-ASCII characters other than control characters.
const shouldQuoteArgument = argument => argument === ''
	|| argument.endsWith('\\')
	|| /[\p{Control}[^\w#$*+\-.\/:?@\\\u{80}-\u{10FFFF}]]/v.test(argument);

// `cmd.exe` escaping for the file.
const escapeFile = file => file.replaceAll(/([()\][%!^"`<>&|;, *?])/g, '^$1');
