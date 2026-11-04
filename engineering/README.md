# AI Quality Lab V0.6.1 — 工程源码

> **两个不同的运行方式，避免混淆**
>
> - **线上单文件演示**：GitHub 仓库根目录的 `index.html`，当前使用内嵌的 React 16 兼容运行时；已在浏览器验收。
> - **正式工程源码**：本目录的 React 18 + TypeScript + Vite 配置。**目前已通过离线 TS/逻辑及单文件产物等价性校验；npm 依赖下载被当前执行环境 DNS 限制阻断，因此正式 React18/Vite 构建仍须 GitHub Actions 验证。**

在线演示：https://user-yuguangcan.github.io/ai-quality-lab/

## 工程结构

- `src/`：领域数据模型、存储、报告、应用 UI 和 CSS
- `tests/`：浏览器交互脚本、模拟 IndexedDB、TypeScript 测试替身
- `scripts/`：离线打包、逻辑测试、发布前检查与 SHA-256 产物一致性校验
- `offline/vendor/`：单文件演示使用的 MIT 授权 React 16 兼容运行时（**不是** React18 发行版）
- `deploy/index.html`：经用户确认上线的 V0.6.1 公开单文件发行版；不包含私人工作区数据
- `index.html`：供 Vite 读取的开发构建入口，**不能直接覆盖 GitHub Pages 根目录单文件**

## 本机执行（Node.js 22 / npm）

```bash
npm install --no-audit --no-fund
npm run build              # TypeScript 类型检查 + React 18 / Vite 生产构建，输出 dist/
npm run test:logic         # 领域规则、人工评分、版本比较、报告和备份测试
npm run test:release       # 重新打包兼容单文件并核对 deploy/index.html
npm run dev                # 开发服务
```

脚本已经修改为：**首次运行自动编译测试依赖**，使用本工程的 TypeScript；没有装本地依赖时可回退到机器全局 TypeScript。`test:release` 的 `prepare:offline` 使用工程内的 MIT 授权兼容运行时，不再依赖 `/opt/...` 路径。

构建时 `--base=./` 配置适用于非域名根路径静态站点，详情参见 Vite 官方文档。

**CI 构建**：源代码放在公共仓库 `engineering/` 文件夹，根目录 `.github/workflows/quality.yml` 会运行 Node 22 + npm 安装 + React18/Vite 类型构建 + 逻辑测试 + 单文件发布一致性检查。只有 GitHub Actions 实际执行成功后，才可以对外声称「正式 React18 + Vite 生产构建验证通过」。

## 当前线上数据边界

用户的测试用例、图片、评分、复测记录主要存储在当前浏览器 IndexedDB；不是云端多人协作产品。首次进入会加载 3 个**演示案例**，不能把演示或临时评分写作真实模型基准评测。恢复需要用户自己导出的本地 JSON。请不要将备份、私人照片、报告中的个人数据提交到公开仓库。

## 当前验证状态（2026-11-04）

- 已通过：离线 TypeScript 类型替身检查、63 个逻辑断言、11 个发行校验、14 项 Chromium 交互操作。
- 已通过：根据现有源码生成的兼容单文件与已上线静态发行版**逐字节相同**（SHA-256：`c6f11a847aa994be064c952d90a3cac2c80bada3d88d403b8b0def57f35ce56a`）。
- 尚待：实际 npm 安装、**React18 类型声明**检查、Vite 生产构建与 GitHub Actions 运行、真实双版本 AI 输出的用户评测闭环。
- 主要原因：本轮当前执行环境无法解析 `registry.npmjs.org`，并非已确认源码构建失败。

## 已知工程限制

1. 尚无 `package-lock.json`；当前是直接依赖固定版本，传递依赖仍可能变化。能够联网生成并提交 lockfile 后，CI 应由 `npm install` 改为 `npm ci`。
2. 兼容单文件在 React16 运行时下生成；React18 构建与其可能有细节差异，必须经独立浏览器验收，才能替换现有网站。
3. 未提供服务端持久化或用户权限；公开在线网址只是前端演示。
