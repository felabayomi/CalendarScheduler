import { build } from "esbuild";

// Resolve the development guard at build time so Vite and its config/plugins
// cannot become external runtime imports in the serverless function.
const result = await build({
  entryPoints: ["server/index.ts"],
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  outdir: "dist",
  define: { "process.env.NODE_ENV": '"production"' },
  metafile: true,
});

const developmentTooling = /(?:^|\/)(?:vite|rollup|@replit\/vite-plugin-[^/]+)(?:\/|$)|(?:^|\/)vite\.config\./;
for (const file of Object.keys(result.metafile.inputs)) {
  if (file === "server/vite.ts" || developmentTooling.test(file)) {
    throw new Error(`Development tooling included in production server: ${file}`);
  }
}
for (const output of Object.values(result.metafile.outputs)) {
  for (const dependency of output.imports) {
    if (developmentTooling.test(dependency.path)) {
      throw new Error(`Development runtime import in production server: ${dependency.path}`);
    }
  }
}
