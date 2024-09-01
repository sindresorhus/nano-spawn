#!/usr/bin/env node
import nanoSpawn from '../../source/index.js';

await nanoSpawn('node', ['-p', 'process.execArgv'], {stdout: 'inherit'});
