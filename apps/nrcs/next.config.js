/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/graphics/schools": ["./public/graphics/legacy/**/*"],
  },
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
