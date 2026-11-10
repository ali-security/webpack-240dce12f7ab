const webpack = require("../../../../");
/** @type {import("../../../../").Configuration} */
module.exports = {
	target: "web",
	output: {
		publicPath: "",
		filename: "bundle0.mjs",
		chunkFilename: "[name].js",
		// chunks are never served in this test; keep the runtime's script timeout
		// from rejecting 120s later inside an unrelated suite of the same worker
		chunkLoadTimeout: 86400000
	},
	experiments: {
		css: true
	},
	// plugin that intercepts __webpack_require__
	plugins: [new webpack.HotModuleReplacementPlugin()]
};
