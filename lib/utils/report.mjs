import {
	isFunction as isFn,
	isNumber,
	isPlainObject,
	isRange,
	isString,
} from '../utils/validateTypes.mjs';

import {
	DEFAULT_SEVERITY,
	RULE_NAME_ALL,
	SEVERITY_ERROR,
	SEVERITY_WARNING,
} from '../constants.mjs';
import addSemicolonForEditInfo from './addSemicolonForEditInfo.mjs';
import { emitDeprecationWarning } from './emitWarning.mjs';
import narrowFixRange from './narrowFixRange.mjs';
import rangesOverlap from './rangesOverlap.mjs';

/** @import { Config, DisabledRangeObject, FixCallback, FixObject, Problem, Range, RuleMessage, StylelintPostcssResult, Utils, WarningOptions } from 'stylelint' */
/** @import { Position as PostcssPosition, Node as PostcssNode } from 'postcss' */

/**
 * Report a problem.
 *
 * This function accounts for `disabledRanges` attached to the result.
 * That is, if the reported problem is within a disabledRange,
 * it is ignored. Otherwise, it is attached to the result as a
 * postcss warning.
 *
 * It also accounts for the rule's severity.
 *
 * You *must* pass *either* a node or a line number.
 *
 * @type {Utils['report']}
 */
export default function report(problem) {
	const { node, index, endIndex, line, start, end, result, ruleName, word, fix, ...rest } = problem;

	checkProblemRangeDeprecations(problem);

	const {
		disabledRanges,
		quiet,
		ruleSeverities,
		config: { defaultSeverity, ignoreDisables } = {},
		customMessages: { [ruleName]: message = rest.message },
		customUrls: { [ruleName]: customUrl },
		ruleMetadata: { [ruleName]: metadata },
	} = result.stylelint;
	const { messageArgs = [], severity = ruleSeverities[ruleName] } = rest;
	const ruleSeverity =
		(isFn(severity) ? severity(...messageArgs) : severity) ?? defaultSeverity ?? DEFAULT_SEVERITY;

	// In quiet mode, mere warnings are ignored
	if (quiet && ruleSeverity === SEVERITY_WARNING) return;

	if ((isFn(fix) || isFixObject(fix)) && metadata && !metadata.fixable) {
		throw new Error(
			`The "${ruleName}" rule requires "meta.fixable" to be truthy if the "fix" callback is being passed`,
		);
	}

	// If a line is not passed, use the node.rangeBy method to get the
	// line number that the complaint pertains to
	const startLine = line ?? node?.rangeBy({ index, endIndex }).start.line;

	if (!startLine) {
		throw new Error(
			`The "${ruleName}" rule failed to pass either a node or a line number to the \`report()\` function.`,
		);
	}

	if (isFixApplied({ ...problem, line: startLine })) return;

	if (isDisabledOnLine(ruleName, startLine, disabledRanges)) {
		// Collect disabled warnings
		// Used to report `needlessDisables` in subsequent processing.
		const disabledWarnings = (result.stylelint.disabledWarnings ||= []);

		disabledWarnings.push({
			rule: ruleName,
			line: startLine,
		});

		if (!ignoreDisables) return;
	}

	if (!result.stylelint.stylelintError && ruleSeverity === SEVERITY_ERROR) {
		result.stylelint.stylelintError = true;
	}

	if (!result.stylelint.stylelintWarning && ruleSeverity === SEVERITY_WARNING) {
		result.stylelint.stylelintWarning = true;
	}

	/** @type {WarningOptions} */
	const warningProperties = {
		severity: ruleSeverity,
		rule: ruleName,
	};

	if (node) {
		warningProperties.node = node;
	}

	if (start) {
		warningProperties.start = start;
	} else if (isNumber(index)) {
		warningProperties.index = index;
	}

	if (end) {
		warningProperties.end = end;
	} else if (isNumber(endIndex)) {
		warningProperties.endIndex = endIndex;
	}

	if (word) {
		warningProperties.word = word;
	}

	if (customUrl) {
		warningProperties.url = customUrl;
	}

	warningProperties.fix = computeEditInfo({ ...problem, line: startLine });

	const warningMessage = buildWarningMessage(message, messageArgs);

	result.warn(warningMessage, warningProperties);
}

/**
 * @param {Problem} problem
 */
function checkProblemRangeDeprecations(problem) {
	if (problem.result.stylelint.quietDeprecationWarnings) return;

	if (!problem.node) {
		emitDeprecationWarning(
			`Omitting the \`node\` argument in the \`utils.report()\` function is deprecated ("${problem.ruleName}").`,
			'REPORT_AMBIGUOUS_POSITION',
			`Please pass a \`node\` argument in the \`utils.report()\` function of "${problem.ruleName}".`,
		);
	}

	if (!isRange(problem) && ('start' in problem || 'end' in problem)) {
		emitDeprecationWarning(
			`Partial position information in the \`utils.report()\` function is deprecated ("${problem.ruleName}").`,
			'REPORT_AMBIGUOUS_POSITION',
			`Please pass both a valid \`start\` and \`end\` argument in the \`utils.report()\` function of "${problem.ruleName}".`,
		);
	}

	if (!hasIndices(problem) && ('index' in problem || 'endIndex' in problem)) {
		emitDeprecationWarning(
			`Partial position information in the \`utils.report()\` function is deprecated ("${problem.ruleName}").`,
			'REPORT_AMBIGUOUS_POSITION',
			`Please pass both \`index\` and \`endIndex\` as arguments in the \`utils.report()\` function of "${problem.ruleName}".`,
		);
	}

	if ('line' in problem) {
		emitDeprecationWarning(
			`Providing the \`line\` argument in the \`utils.report()\` function is deprecated ("${problem.ruleName}").`,
			'REPORT_AMBIGUOUS_POSITION',
			`Please pass both \`index\` and \`endIndex\` as arguments in the \`utils.report()\` function of "${problem.ruleName}" instead.`,
		);
	}
}

/**
 * @param {RuleMessage} message
 * @param {NonNullable<Problem['messageArgs']>} messageArgs
 * @returns {string}
 */
function buildWarningMessage(message, messageArgs) {
	if (isString(message)) {
		return printfLike(message, ...messageArgs);
	}

	return message(...messageArgs);
}

/**
 * @param {string} format
 * @param {Array<unknown>} args
 * @returns {string}
 */
function printfLike(format, ...args) {
	return args.reduce((/** @type {string} */ result, arg) => {
		return result.replace(/%[ds]/, String(arg));
	}, format);
}

/**
 * Check whether a rule is disabled for a given line
 * @param {string} ruleName
 * @param {number} startLine
 * @param {DisabledRangeObject} disabledRanges
 */
function isDisabledOnLine(ruleName, startLine, disabledRanges) {
	const ranges = disabledRanges[ruleName] ?? disabledRanges[RULE_NAME_ALL] ?? [];

	for (const range of ranges) {
		if (
			// If the problem is within a disabledRange,
			// and that disabledRange's rules include this one
			range.start <= startLine &&
			(range.end === undefined || range.end >= startLine) &&
			/** @todo populate rules in assignDisabledRanges util */
			(!range.rules || range.rules.includes(ruleName))
		) {
			return true;
		}
	}

	return false;
}

/**
 * @param {Problem & { line: number }} problem
 * @returns {boolean}
 */
function isFixApplied({ fix, line, result: { stylelint }, ruleName }) {
	if (!fix) return false;

	const { disabledRanges, config = {}, fixersData } = stylelint;

	if (!config.fix) return false;

	if (isFixDisabled(line, ruleName, config, disabledRanges)) return false;

	const apply = isFixObject(fix) ? fix.apply : fix;

	if (!isFn(apply)) return false;

	apply();

	incrementFixCounter({ fixersData, ruleName });

	return true;
}

/**
 * @param {Problem & { line: number }} problem
 * @returns {{range: [number, number], text: string} | undefined}
 */
function computeEditInfo({ fix, line, result, ruleName }) {
	if (!fix) return;

	const { disabledRanges, config = {}, rangesOfComputedEditInfos } = result.stylelint;

	if (!config.computeEditInfo || config.fix) return;

	if (isFixDisabled(line, ruleName, config, disabledRanges)) return;

	if (!isFixObject(fix) || !fix.apply || !fix.node) return;

	const { apply, node } = fix;

	if (!isNumber(node.source?.start?.offset) || !isNumber(node.source?.end?.offset)) return;

	/** @type [number, number] */
	const fixedNodeRange = [node.source.start.offset, node.source.end.offset];

	// When recording edit info we want to ensure that there is no overlap with any other fix.
	// We only record the first fix for each node.
	if (rangesOfComputedEditInfos.some((range) => rangesOverlap(range, fixedNodeRange))) {
		return;
	}

	// Apply the fix
	apply();

	let fixData = { range: fixedNodeRange, text: node.toString(result.opts?.syntax) };

	fixData = addSemicolonForEditInfo(node, fixData);

	// Compute the smallest range and text of the fix
	fixData = narrowFixRange(node, fixData);

	// Mark the fixed range as mutated
	rangesOfComputedEditInfos.push(fixData.range);

	return fixData;
}

/**
 * @param {number} line
 * @param {string} ruleName
 * @param {Config} config
 * @param {DisabledRangeObject} disabledRanges
 * @returns {boolean}
 */
function isFixDisabled(line, ruleName, config, disabledRanges) {
	if (config.rules?.[ruleName][1]?.disableFix) return true;

	if (!config.ignoreDisables && isDisabledOnLine(ruleName, line, disabledRanges)) return true;

	return false;
}

/**
 * @param {object} o
 * @param {StylelintPostcssResult['fixersData']} o.fixersData
 * @param {string} o.ruleName
 */
function incrementFixCounter({ fixersData, ruleName }) {
	fixersData[ruleName] ??= 0;
	fixersData[ruleName]++;
}

/**
 * @param {unknown} value
 * @returns {value is { index: number, endIndex: number }}
 */
function hasIndices(value) {
	if (!isPlainObject(value)) return false;

	if (!isNumber(value.index)) return false;

	if (!isNumber(value.endIndex)) return false;

	return true;
}

/**
 * @param {unknown} value
 * @returns {value is FixObject}
 */
function isFixObject(value) {
	if (!isPlainObject(value)) return false;

	if (!value.node) return false;

	if (!isFn(value.apply)) return false;

	return true;
}
