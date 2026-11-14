import path from 'node:path';
import process from 'node:process';
import {setTimeout} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {multibyteFirstHalf, multibyteSecondHalf} from './arguments.js';

export const isWindows = process.platform === 'win32';

export const FIXTURES_URL = new URL('../fixtures/', import.meta.url);
export const fixturesPath = fileURLToPath(FIXTURES_URL);

export const nodeDirectory = path.dirname(process.execPath);

export const NODE_VERSION = Number(process.version.slice(1).split('.', 1)[0]);

export const earlyErrorOptions = {detached: 'true'};

export const destroySubprocessStream = async (subprocess, error, streamName) => {
	const nodeChildProcess = await subprocess.nodeChildProcess;
	nodeChildProcess[streamName].destroy(error);
};

export const writeMultibyte = async subprocess => {
	const {stdin} = await subprocess.nodeChildProcess;
	stdin.write(multibyteFirstHalf);
	await setTimeout(1e2);
	stdin.end(multibyteSecondHalf);
};
