/// <reference types="vite/client" />

import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { markable } from '@f12o/markable/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(dirname, '..');

// Alias every sibling @solid-admin/* package to its source so the demo builds
// straight from TypeScript without pre-building the workspace packages.
const packages = fs.readdirSync(packagesDir);
const aliases = packages.reduce<Record<string, string>>((acc, dirName) => {
	const packageJsonPath = path.resolve(packagesDir, dirName, 'package.json');
	if (!fs.existsSync(packageJsonPath)) return acc;
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	if (typeof packageJson.name === 'string' && packageJson.name.startsWith('@solid-admin/')) {
		acc[packageJson.name] = path.resolve(packagesDir, dirName, 'src');
	}
	return acc;
}, {});

export default defineConfig({
	// GitHub Pages hosts the demos side by side under /markable/<example-id>/.
	base: process.env.GITHUB_ACTIONS ? '/markable/solid-admin/' : '/',
	plugins: [
		solidPlugin(),
		markable({
			mode: 'auto',
			commentsFile: '.markable/comments.json',
			endpoint: '/__markable/comments',
			issueRepo: 'f4ah6o/markable',
		}),
	],
	server: {
		port: 3000,
	},
	build: {
		target: 'esnext',
	},
	resolve: {
		conditions: ['development', 'browser'],
		alias: Object.keys(aliases).map((packageName) => ({
			find: packageName,
			replacement: aliases[packageName],
		})),
	},
});
