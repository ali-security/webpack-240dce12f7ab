it("should not use a DOM clobbered document.currentScript to determine the public path", () => {
	expect(__webpack_public_path__).not.toBe(
		"https://attacker.controlled.server/"
	);
	expect(__webpack_public_path__).toBe("https://test.cases/path/");
});
