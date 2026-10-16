export async function resolve(specifier, context, nextResolve) {
  if (/^(?:vite|rollup|@rollup\/|@vitejs\/|@replit\/vite-plugin-)/.test(specifier)) {
    throw new Error(`Production loaded development tooling: ${specifier}`);
  }
  return nextResolve(specifier, context);
}
