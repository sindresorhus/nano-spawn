#!/usr/bin/env node
import spawn from '../../source/index.js';

await spawn('node', ['-p', 'process.execArgv'], {stdout: 'inherit'});
