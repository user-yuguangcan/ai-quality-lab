/** Resolve the project TypeScript dependency first, with global `tsc` as a
 *  developer-machine fallback for the isolated/offline test environment. */
const path = require('node:path');
const {execFileSync} = require('node:child_process');
module.exports = function loadTypeScript() {
  try { return require('typescript'); }
  catch (err) {
    try {
      const root = execFileSync('npm', ['root', '-g'], {encoding:'utf8'}).trim();
      return require(path.join(root, 'typescript'));
    } catch {
      throw new Error('TypeScript 未安装。请先运行 npm install。', {cause: err});
    }
  }
};
