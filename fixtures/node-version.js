#!/usr/bin/env node
import nanoSpawn from '../index.js';

await nanoSpawn('node', ['--version'], {stdout: 'inherit'});
