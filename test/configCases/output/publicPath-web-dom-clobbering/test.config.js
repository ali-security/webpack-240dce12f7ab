const clobberedDocuments = new WeakSet();

module.exports = {
	moduleScope(scope) {
		const document = scope.document;
		if (clobberedDocuments.has(document)) return;
		clobberedDocuments.add(document);

		// the real <script> element which loaded the bundle
		const script = document.createElement("script");
		script.src = "https://test.cases/path/bundle0.js";
		document.head.appendChild(script);

		// an attacker injected `<img name="currentScript" src="https://attacker.controlled.server/">`
		// so `document.currentScript` resolves to the <img> element (DOM clobbering)
		Object.defineProperty(document, "currentScript", {
			configurable: true,
			get() {
				return {
					tagName: "IMG",
					src: "https://attacker.controlled.server/"
				};
			},
			set() {
				// the named property shadows any value assigned by the test runner
			}
		});
	}
};
