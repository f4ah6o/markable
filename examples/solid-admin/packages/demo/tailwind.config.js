import daisyui from 'daisyui';

/** @type {import('tailwindcss').Config} */
export default {
	content: [
		'./index.html',
		'./src/**/*.{js,ts,jsx,tsx}',
		// Scan the vendored ui-daisy package source so its component classes are kept.
		'../ui-daisy/src/**/*.{js,ts,jsx,tsx}',
	],
	darkMode: 'class',
	theme: {
		extend: {},
	},
	plugins: [daisyui],
};
