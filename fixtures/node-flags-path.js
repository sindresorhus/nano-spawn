#!/usr/bin/env node
import process from 'node:process';
import nanoSpawn from '../index.js';

await nanoSpawn(process.execPath, ['-p', 'process.execArgv'], {stdout: 'inherit'});
