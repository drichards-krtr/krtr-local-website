/** @type {import("next").NextConfig} */
module.exports = { turbopack: { root: __dirname }, experimental: { serverActions: { bodySizeLimit: "11mb" } } };
