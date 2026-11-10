/** @type {import("../../../../").Configuration} */
module.exports = {
	target: "web",
	output: {
		chunkFilename: "[name].js",
		crossOriginLoading: "anonymous",
		// chunks are never served in this test; keep the runtime's script timeout
		// from rejecting 120s later inside an unrelated suite of the same worker
		chunkLoadTimeout: 86400000
	},
	experiments: {
		css: true
	},
	optimization: {
		minimize: false,
		splitChunks: {
			minSize: 1
		}
	}
};
