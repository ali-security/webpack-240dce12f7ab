"use strict";

// Prints every skipped/pending jest test of a run together with the reason it
// was skipped. Usage: node .github/print-skipped-tests.js <jest --json output>
// webpack's case-based suites skip a case via `describe.skip(<case>, () =>
// it("filtered"))` when the case's `test.filter.js` returns false for the
// current runtime/config (e.g. a Node.js feature the runtime lacks); the
// filter source is printed as the reason.

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const resultFile = process.argv[2] || "jest-results.json";
const results = JSON.parse(fs.readFileSync(resultFile, "utf-8"));

const filterIndex = new Map();
const walk = dir => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "js") continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full);
		} else if (entry.name === "test.filter.js") {
			const rel = path.relative(root, dir).split(path.sep);
			const name = rel[rel.length - 1];
			const pair = `${rel[rel.length - 2]}/${name}`;
			const value = path.relative(root, full).split(path.sep).join("/");
			if (!filterIndex.has(pair)) filterIndex.set(pair, value);
			if (!filterIndex.has(name)) filterIndex.set(name, value);
		}
	}
};
walk(path.join(root, "test"));
walk(path.join(root, "examples"));

const findFilter = ancestors => {
	for (let i = ancestors.length - 2; i >= 0; i--) {
		const pair = `${ancestors[i]}/${ancestors[i + 1]}`;
		if (filterIndex.has(pair)) return filterIndex.get(pair);
	}
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const last = ancestors[i].split("/").pop();
		if (filterIndex.has(ancestors[i])) return filterIndex.get(ancestors[i]);
		if (filterIndex.has(last)) return filterIndex.get(last);
	}
	return undefined;
};

const describeFilter = file => {
	const src = fs
		.readFileSync(path.join(root, file), "utf-8")
		.replace(/\s+/g, " ")
		.trim();
	return src.length > 300 ? `${src.slice(0, 300)}...` : src;
};

let count = 0;
for (const suite of results.testResults) {
	const suiteFile = path.relative(root, suite.name).split(path.sep).join("/");
	for (const test of suite.assertionResults) {
		if (!["pending", "skipped", "todo", "disabled"].includes(test.status))
			continue;
		count++;
		const name = [...test.ancestorTitles, test.title].join(" > ");
		let reason;
		if (test.title === "filtered") {
			const filter = findFilter(test.ancestorTitles);
			reason = filter
				? `test.filter.js returned false for this runtime/config (${filter}: ${describeFilter(
						filter
					)})`
				: "test.filter.js returned false for this runtime/config";
		} else if (/excluded/.test(test.title)) {
			reason = "suite guarded by NO_WATCH_TESTS env var";
		} else if (test.status === "todo") {
			reason = "it.todo placeholder in test source";
		} else {
			reason = `statically skipped (it.skip/describe.skip or runtime-conditional skip) in ${suiteFile}`;
		}
		console.log(`SKIPPED: ${name} [${suiteFile}] -- reason: ${reason}`);
	}
}
console.log(
	`Skipped tests listed above: ${count} (jest reported numPendingTests=${results.numPendingTests}, numTodoTests=${results.numTodoTests}, numPassedTests=${results.numPassedTests}, numFailedTests=${results.numFailedTests})`
);
