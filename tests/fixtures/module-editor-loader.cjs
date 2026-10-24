// eslint-disable-next-line @typescript-eslint/no-require-imports -- Webpack loaders use CommonJS.
const ts = require("typescript");
module.exports = function(source) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
};
