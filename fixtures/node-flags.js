#!/usr/bin/env node
import nanoSpawn from '../index.js';

await nanoSpawn('node', ['-p', 'process.execArgv'], {stdout: 'inherit'});
