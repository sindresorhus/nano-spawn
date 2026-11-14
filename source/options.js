import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

export const getOptions = ({
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

	const cwd = cwdOption instanceof URL ? fileURLToPath(cwdOption) : path.resolve(cwdOption);
	// Capture the environment before asynchronous startup can observe later changes to `process.env`.
	// Node.js includes inherited environment properties, so the snapshot must not inherit mutable prototype state.
	const env = {__proto__: null, ...process.env, ...envOption};
	// An explicit `stdio` takes priority over the individual options.
	// Copy a supplied array so later caller changes cannot affect the subprocess.
	const stdioOption = stdio?.slice() ?? [stdin, stdout, stderr];
	const input = stdioOption[0]?.string;
	return {
		__proto__: null,
		...options,
		input,
		stdio: input === undefined ? stdioOption : ['pipe', ...stdioOption.slice(1)],
		env: preferLocal ? addLocalPath(env, cwd) : env,
		cwd,
	};
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
