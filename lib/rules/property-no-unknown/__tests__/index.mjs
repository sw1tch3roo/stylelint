import naiveCssInJs from '../../../__tests__/fixtures/postcss-naive-css-in-js.cjs';

import rule from '../index.mjs';
const { messages, ruleName } = rule;

testRule({
	ruleName,
	config: [true],

	accept: [
		{
			code: '.foo { color: green; }',
		},
		{
			code: '.foo { COLoR: green; }',
		},
		{
			code: '.foo { fill: black; }',
		},
		{
			code: '.foo { -webkit-align-self: center; }',
		},
		{
			code: '.foo { align-self: center; }',
		},
		{
			code: '.foo { --bg-color: white; }',
			description: 'ignore standard CSS variables',
		},
		{
			code: '.foo { -moz-align-self: center; }',
			description: 'ignore vendor prefixes',
		},
		{
			code: '.foo { *width: 100px; }',
			description: 'ignore CSS hacks',
		},
		{
			code: '.foo { --custom-property-set: { colr: blue; } }',
			description: 'ignore custom property sets',
		},
		{
			code: '@font-face { foo: 0; }',
			description: 'ignore descriptors',
		},
		{
			code: '@position-try --foo { @supports (bar: 0) { bar: 0 } }',
			description: 'ignore descriptors within nested at-rules',
		},
		{
			code: '@foo { bar: 0; }',
			description: 'ignore all declarations within custom at-rules as may be descriptors',
		},
	],

	reject: [
		{
			code: '.foo { colr: blue; }',
			message: messages.rejected('colr'),
			line: 1,
			column: 8,
			endLine: 1,
			endColumn: 12,
		},
		{
			code: '.foo { COLR: blue; }',
			message: messages.rejected('COLR'),
			line: 1,
			column: 8,
			endLine: 1,
			endColumn: 12,
		},
		{
			code: '.foo {\n  colr: blue;\n}',
			message: messages.rejected('colr'),
			line: 2,
			column: 3,
			endLine: 2,
			endColumn: 7,
		},
		{
			code: '.foo { wdth: 100px; }',
			message: messages.rejected('wdth'),
			line: 1,
			column: 8,
			endLine: 1,
			endColumn: 12,
		},
		{
			code: '.foo { *wdth: 100px; }',
			message: messages.rejected('wdth'),
			line: 1,
			column: 9,
			endLine: 1,
			endColumn: 13,
		},
		{
			code: ':export { my-property: red; }',
			message: messages.rejected('my-property'),
			line: 1,
			column: 11,
			endLine: 1,
			endColumn: 22,
		},
	],
});

testRule({
	ruleName,
	customSyntax: 'postcss-scss',
	config: [true],

	accept: [
		{
			code: '.foo { $bgColor: white; }',
			description: 'ignore SCSS variables',
		},
		{
			code: '.foo { namespace.$bgColor: white; }',
			description: 'ignore SCSS variables within namespace',
		},
		{
			code: '.foo { #{$prop}: black; }',
			description: 'ignore property interpolation',
		},
		{
			code: '.foo { border: { style: solid; } }',
			description: 'ignore nested properties',
		},
	],
});

testRule({
	ruleName,
	customSyntax: 'postcss-less',
	config: [true],

	accept: [
		{
			code: '.foo { @bgColor: white; }',
			description: 'ignore LESS variables',
		},
		{
			code: '.foo { @{prop}: black; }',
			description: 'ignore property interpolation',
		},
		{
			code: '.foo { transform+: rotate(15deg); }',
			description: 'Append property value with space using +',
		},
		{
			code: '.foo { transform+_: rotate(15deg); }',
			description: 'Append property value with space using +_',
		},
		{
			code: '@foo: { prop: red; }',
			description: 'ignore LESS map props',
		},
	],
});

testRule({
	ruleName,
	config: [
		true,
		{
			ignoreProperties: ['-moz-overflow-scrolling', '/^my-/'],
			checkPrefixed: true,
		},
	],

	accept: [
		{
			code: '.foo { -webkit-overflow-scrolling: auto; }',
		},
		{
			code: '.foo { -moz-overflow-scrolling: auto; }',
		},
		{
			code: '.foo { my-property: 1; }',
		},
		{
			code: '.foo { my-other-property: 1; }',
		},
	],

	reject: [
		{
			code: '.foo { overflow-scrolling: auto; }',
			message: messages.rejected('overflow-scrolling'),
			line: 1,
			column: 8,
		},
		{
			code: '.foo { not-my-property: 1; }',
			message: messages.rejected('not-my-property'),
			line: 1,
			column: 8,
		},
	],
});

testRule({
	ruleName,
	config: [
		true,
		{
			ignoreProperties: [/^my-/],
			checkPrefixed: true,
		},
	],

	accept: [
		{
			code: '.foo { my-property: 1; }',
		},
	],

	reject: [
		{
			code: '.foo { not-my-property: 1; }',
			message: messages.rejected('not-my-property'),
			line: 1,
			column: 8,
		},
	],
});

testRule({
	ruleName,
	config: [true, { checkPrefixed: true }],

	accept: [
		{
			code: 'a { -webkit-overflow-scrolling: auto; }',
		},
		{
			code: 'a { -moz-box-flex: 0; }',
		},
		{
			code: 'a { -khtml-opacity: 0.5; }',
		},
		{
			code: '@view-transition { navigation: auto }',
		},
	],

	reject: [
		{
			code: '.foo { -moz-overflow-scrolling: auto; }',
			message: messages.rejected('-moz-overflow-scrolling'),
			line: 1,
			column: 8,
		},
		{
			code: '.foo { -moz-align-self: center; }',
			message: messages.rejected('-moz-align-self'),
			line: 1,
			column: 8,
		},
	],
});

testRule({
	ruleName,
	config: [true, { ignoreSelectors: [':export', ':import'] }],

	accept: [
		{
			code: ':export { my-property: 1; }',
		},
	],

	reject: [
		{
			code: ':not-export { my-property: 1; }',
			message: messages.rejected('my-property'),
			line: 1,
			column: 15,
		},
		{
			// Non-regex strings must exactly match the parent selector.
			code: ':import("path/to/file.css") { my-property: 1; }',
			message: messages.rejected('my-property'),
			line: 1,
			column: 31,
		},
	],
});

testRule({
	ruleName,
	config: [true, { ignoreSelectors: ['/:export/', /^:import/] }],

	accept: [
		{
			code: ':export { my-property: 1; }',
		},
		{
			code: ':import("path/to/file.css") { my-property: 1; }',
		},
	],

	reject: [
		{
			code: ':exprat { my-property: 1; }',
			message: messages.rejected('my-property'),
			line: 1,
			column: 11,
		},
	],
});

testRule({
	ruleName,
	config: [true],
	customSyntax: naiveCssInJs,

	accept: [
		{
			code: 'css` color: blue; `;',
		},
	],

	reject: [
		{
			code: 'css` colr: blue; `;',
			message: messages.rejected('colr'),
		},
		{
			code: 'css`\n\tunknown: 1;\n`;',
			message: messages.rejected('unknown'),
		},
	],
});

testRule({
	ruleName,
	config: [true],
	customSyntax: 'postcss-html',

	accept: [
		{
			code: '<a style="{{unknown}}: 1">',
		},
	],

	reject: [
		{
			code: '<a style="unknown: 1">',
			message: messages.rejected('unknown'),
			line: 1,
			column: 11,
		},
		{
			code: '<a style="unknown: {{1}}">',
			message: messages.rejected('unknown'),
			line: 1,
			column: 11,
		},
	],
});

testRule({
	ruleName,
	config: [true, { ignoreAtRules: ['supports', /^lay/] }],

	accept: [
		{
			code: '@supports (display: grid) { my-property: 1; }',
		},
		{
			code: '@layer { foo: 1; }',
		},
		{
			code: '@supports (display:grid) { @media (min-width: 10px) { foo: 1; } }',
		},
		{
			code: '@supports (display:grid) { @media (min-width: 10px) { a { foo: 1; } } }',
		},
		{
			code: '@layer { a { foo: 1; } }',
		},
	],

	reject: [
		{
			code: '@media screen { a { foo: 1; } }',
			message: messages.rejected('foo'),
			line: 1,
			column: 21,
		},
		{
			code: 'a { foo: 1; }',
			message: messages.rejected('foo'),
			line: 1,
			column: 5,
		},
	],
});
