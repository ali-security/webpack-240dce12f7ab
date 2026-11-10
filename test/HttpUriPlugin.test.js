"use strict";

require("./helpers/warmup-webpack");

const fs = require("fs");
const http = require("http");
const path = require("path");
const rimraf = require("rimraf");
const { createFsFromVolume, Volume } = require("memfs");
const webpack = require("..");

const {
	experiments: {
		schemes: { HttpUriPlugin }
	}
} = webpack;

const outputBase = path.join(__dirname, "js", "HttpUriPlugin");

/**
 * @param {import("http").RequestListener} handler request handler
 * @returns {Promise<import("http").Server>} listening server
 */
const startServer = handler =>
	new Promise((resolve, reject) => {
		const server = http.createServer(handler);
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => resolve(server));
	});

/**
 * @param {import("http").Server} server server
 * @returns {Promise<void>} resolves when the server is closed
 */
const stopServer = server =>
	new Promise(resolve => {
		server.close(() => resolve());
		if (typeof server.closeAllConnections === "function") {
			server.closeAllConnections();
		}
	});

/**
 * @param {import("http").Server} server server
 * @returns {string} origin of the server
 */
const getOrigin = server => `http://127.0.0.1:${server.address().port}`;

/**
 * @param {string} name name of the test
 * @param {string} request http url to import
 * @param {(string | RegExp)[]} allowedUris allowed uris
 * @returns {Promise<{ errors: string, lockfile: string | undefined }>} errors and written lockfile
 */
const compile = (name, request, allowedUris) => {
	const context = path.join(outputBase, name);
	rimraf.sync(context);
	fs.mkdirSync(context, { recursive: true });
	fs.writeFileSync(
		path.join(context, "index.js"),
		`import value from ${JSON.stringify(request)};\nexport default value;\n`
	);
	const lockfileLocation = path.join(context, "webpack.lock");
	const compiler = webpack({
		mode: "development",
		target: "node",
		context,
		entry: "./index.js",
		cache: false,
		devtool: false,
		output: {
			path: path.join(context, "dist")
		},
		plugins: [
			new HttpUriPlugin({
				allowedUris,
				lockfileLocation,
				cacheLocation: false
			})
		]
	});
	compiler.outputFileSystem = createFsFromVolume(new Volume());
	return new Promise((resolve, reject) => {
		compiler.run((err, stats) => {
			if (err) return reject(err);
			compiler.close(closeErr => {
				if (closeErr) return reject(closeErr);
				resolve({
					errors: stats.compilation.errors.map(e => e.message).join("\n"),
					lockfile: fs.existsSync(lockfileLocation)
						? fs.readFileSync(lockfileLocation, "utf-8")
						: undefined
				});
			});
		});
	});
};

describe("HttpUriPlugin", () => {
	jest.setTimeout(20000);

	let allowedServer;
	let internalServer;
	let allowedOrigin;
	let internalOrigin;
	let internalRequests = 0;
	let privateRequests = 0;
	let loopRequests = 0;

	beforeAll(async () => {
		internalServer = await startServer((req, res) => {
			internalRequests++;
			res.setHeader("Content-Type", "text/javascript");
			res.end('export default "internal-secret";');
		});
		internalOrigin = getOrigin(internalServer);

		allowedServer = await startServer((req, res) => {
			const redirect = location => {
				res.statusCode = 302;
				res.setHeader("Location", location);
				res.end();
			};
			const loop = /^\/public\/loop\/(\d+)$/.exec(req.url);
			if (req.url === "/public/module.js") {
				res.setHeader("Content-Type", "text/javascript");
				res.end('export default "public";');
			} else if (req.url === "/public/same-origin-redirect") {
				redirect("/public/module.js");
			} else if (req.url === "/public/cross-origin-redirect") {
				redirect(`${internalOrigin}/secret.js`);
			} else if (req.url === "/public/private-path-redirect") {
				redirect("/private/secret.js");
			} else if (req.url === "/public/protocol-redirect") {
				redirect("file:///etc/hosts");
			} else if (req.url === "/private/secret.js") {
				privateRequests++;
				res.setHeader("Content-Type", "text/javascript");
				res.end('export default "private-secret";');
			} else if (loop) {
				loopRequests++;
				const n = Number(loop[1]);
				if (n < 20) {
					redirect(`/public/loop/${n + 1}`);
				} else {
					res.setHeader("Content-Type", "text/javascript");
					res.end('export default "loop-end";');
				}
			} else {
				res.statusCode = 404;
				res.end();
			}
		});
		allowedOrigin = getOrigin(allowedServer);
	});

	afterAll(async () => {
		if (allowedServer) await stopServer(allowedServer);
		if (internalServer) await stopServer(internalServer);
	});

	beforeEach(() => {
		internalRequests = 0;
		privateRequests = 0;
		loopRequests = 0;
	});

	it("should follow redirects that stay within allowedUris", async () => {
		const { errors, lockfile } = await compile(
			"same-origin-redirect",
			`${allowedOrigin}/public/same-origin-redirect`,
			[`${allowedOrigin}/public/`]
		);
		expect(errors).toBe("");
		expect(lockfile).toContain(
			`"resolved": ${JSON.stringify(`${allowedOrigin}/public/module.js`)}`
		);
	});

	it("should not follow a redirect to an origin outside of allowedUris", async () => {
		const { errors, lockfile } = await compile(
			"cross-origin-redirect",
			`${allowedOrigin}/public/cross-origin-redirect`,
			[`${allowedOrigin}/public/`]
		);
		expect(errors).toMatch(
			/doesn't match the allowedUris policy after redirect/
		);
		expect(errors).toContain(`${internalOrigin}/secret.js`);
		expect(internalRequests).toBe(0);
		expect(lockfile).toBeUndefined();
	});

	it("should not follow a redirect to a path outside of allowedUris", async () => {
		const { errors, lockfile } = await compile(
			"private-path-redirect",
			`${allowedOrigin}/public/private-path-redirect`,
			[`${allowedOrigin}/public/`]
		);
		expect(errors).toMatch(
			/doesn't match the allowedUris policy after redirect/
		);
		expect(errors).toContain(`${allowedOrigin}/private/secret.js`);
		expect(privateRequests).toBe(0);
		expect(lockfile).toBeUndefined();
	});

	it("should not follow a redirect to a non-http(s) protocol", async () => {
		const { errors, lockfile } = await compile(
			"protocol-redirect",
			`${allowedOrigin}/public/protocol-redirect`,
			[`${allowedOrigin}/public/`]
		);
		expect(errors).toMatch(/Redirected URL uses disallowed protocol: file:/);
		expect(errors).not.toContain("/etc/hosts");
		expect(lockfile).toBeUndefined();
	});

	it("should stop following redirects after the redirect limit", async () => {
		const { errors, lockfile } = await compile(
			"redirect-loop",
			`${allowedOrigin}/public/loop/0`,
			[`${allowedOrigin}/public/`]
		);
		expect(errors).toMatch(/Too many redirects/);
		// the initial request plus 5 followed redirects
		expect(loopRequests).toBe(6);
		expect(lockfile).toBeUndefined();
	});
});
