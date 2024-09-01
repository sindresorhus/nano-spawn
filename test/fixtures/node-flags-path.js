#!/usr/bin/env node
import process from 'node:process';
import spawn from '../../source/index.js';

await spawn(process.execPath, ['-p', 'process.execArgv'], {stdout: 'inherit'});
