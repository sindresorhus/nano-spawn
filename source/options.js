import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

export const getOptions = ({
	input,
	stdin,
	stdout,
	stderr,
	stdio,
	env: envOption,
	preferLocal,
	cwd: cwdOption = '.',
	...options
}) => {
	// Unlike `node:child_process`, `null` is not supported for those options. Without this check, it would fail with an unclear error.
	for (const [optionName, value] of [['cwd', cwdOption], ['stdio', stdio]]) {
		if (value === null) {
			throw new TypeError(`The \`${optionName}\` option must not be \`null\`. Use \`undefined\` instead.`);
		}
	}

	validateStdin('stdin', stdin);

	// The `input` option writes to the subprocess's stdin, which requires it to be piped. Both options would describe the same stream.
	if (input !== undefined && (stdin !== undefined || stdio !== undefined)) {
		throw new TypeError('The `input` option cannot be used with the `stdin` or `stdio` options.');
	}

	const cwd = cwdOption instanceof URL ? fileURLToPath(cwdOption) : path.resolve(cwdOption);
	// Capture the environment before asynchronous startup can observe later changes to `process.env`.
	// Node.js includes inherited environment properties, so the snapshot must not inherit mutable prototype state.
	const env = {__proto__: null, ...process.env, ...envOption};
	// An explicit `stdio` takes priority over the individual options.
	// Copy a supplied array so later caller changes cannot affect the subprocess.
	// A single string is passed through, since `node:child_process` applies it to all three streams itself.
	const stdioOption = Array.isArray(stdio) ? [...stdio] : stdio ?? [stdin, stdout, stderr];
	if (Array.isArray(stdio)) {
		validateStdin('stdio', stdioOption[0]);
	}

	return {
		__proto__: null,
		...options,
		input,
		stdio: stdioOption,
		env: preferLocal ? addLocalPath(env, cwd) : env,
		cwd,
	};
};

// Those are the only strings `node:child_process` accepts as `stdio` directives. Any other string likely means the caller tried to pass input text, which is what the `input` option is for. Without this check, `node:child_process` would fail with an error about `options.stdio[0]`, which does not mention the option the caller used.
const stdioDirectives = new Set(['pipe', 'inherit', 'ignore', 'ipc', 'overlapped']);

const validateStdin = (optionName, value) => {
	if (typeof value === 'string' && !stdioDirectives.has(value)) {
		throw new TypeError(`The \`${optionName}\` option must be "pipe", "inherit", "ignore", "ipc" or "overlapped", a \`Stream\`, or a file descriptor. To pass input as a string, use the \`input\` option instead.`);
	}

	// `{string: ...}` was the previous way to pass input as a string
	if (typeof value === 'object' && value !== null && 'string' in value) {
		throw new TypeError(`The \`${optionName}\` option does not accept \`{string: ...}\` anymore. Use the \`input\` option instead.`);
	}
};

const addLocalPath = ({Path = '', PATH = Path, ...env}, cwd) => {
	const pathParts = new Set(PATH.split(path.delimiter));
	const localPaths = getLocalPaths([], path.resolve(cwd))
		.map(localPath => path.join(localPath, 'node_modules/.bin'))
		.filter(localPath => !pathParts.has(localPath));
	return {__proto__: null, ...env, PATH: [...localPaths, PATH].filter(Boolean).join(path.delimiter)};
};

const getLocalPaths = (localPaths, localPath) => localPaths.at(-1) === localPath
	? localPaths
	: getLocalPaths([...localPaths, localPath], path.resolve(localPath, '..'));
