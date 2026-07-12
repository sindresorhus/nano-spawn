import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

// Valid string values for stdio entries in node:child_process.
// Any other string (e.g. a user trying to pass input content directly)
// triggers a confusing Node.js error. We catch it early with a helpful message.
const VALID_STDIO_STRINGS = new Set(['pipe', 'inherit', 'ignore', 'overlap']);

const validateStdioEntry = (value, optionName) => {
	if (typeof value === 'string' && !VALID_STDIO_STRINGS.has(value)) {
		throw new TypeError(
			`The \`${optionName}\` option must be one of: ${[...VALID_STDIO_STRINGS].map(string => `'${string}'`).join(', ')}, or an object like \`{string: '...'}\` to pass a string as input. Got: '${value}'.`,
		);
	}
};

export const getOptions = ({
	stdin,
	stdout,
	stderr,
	stdio = [stdin, stdout, stderr],
	env: envOption,
	preferLocal,
	cwd: cwdOption = '.',
	...options
}) => {
	// When stdio is a string (e.g. 'pipe'), it applies to all three streams.
	// Validate it directly instead of indexing into it (which would give a
	// single character).
	if (typeof stdio === 'string') {
		validateStdioEntry(stdio, 'stdio');
	} else {
		validateStdioEntry(stdio[0], 'stdin');
		validateStdioEntry(stdio[1], 'stdout');
		validateStdioEntry(stdio[2], 'stderr');
	}

	const cwd = cwdOption instanceof URL ? fileURLToPath(cwdOption) : path.resolve(cwdOption);
	const env = envOption ? {...process.env, ...envOption} : undefined;
	const input = stdio[0]?.string;
	return {
		...options,
		input,
		stdio: input === undefined ? stdio : ['pipe', ...stdio.slice(1)],
		env: preferLocal ? addLocalPath(env ?? process.env, cwd) : env,
		cwd,
	};
};

const addLocalPath = ({Path = '', PATH = Path, ...env}, cwd) => {
	const pathParts = PATH.split(path.delimiter);
	const localPaths = getLocalPaths([], path.resolve(cwd))
		.map(localPath => path.join(localPath, 'node_modules/.bin'))
		.filter(localPath => !pathParts.includes(localPath));
	return {...env, PATH: [...localPaths, PATH].filter(Boolean).join(path.delimiter)};
};

const getLocalPaths = (localPaths, localPath) => localPaths.at(-1) === localPath
	? localPaths
	: getLocalPaths([...localPaths, localPath], path.resolve(localPath, '..'));
