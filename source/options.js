import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

const STDIN_MODES = new Set(['pipe', 'overlapped', 'ignore', 'inherit']);

export const getOptions = ({
	stdin,
	stdout,
	stderr,
	stdio: stdioOption,
	env: envOption,
	preferLocal,
	cwd: cwdOption = '.',
	...options
}) => {
	const stdio = stdioOption === undefined ? [stdin, stdout, stderr] : stdioOption;
	const cwd = cwdOption instanceof URL ? fileURLToPath(cwdOption) : path.resolve(cwdOption);
	const env = envOption ? {...process.env, ...envOption} : undefined;
	const input = stdioOption === undefined
		&& typeof stdin === 'string'
		&& !STDIN_MODES.has(stdin)
		? stdin
		: stdio[0]?.string;
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
