# 浏览器测试说明

- `browser-stage06.py`：V0.6/V0.6.1 当前的核心浏览器交互验收脚本，已经在本轮通过 14 项检查。
- `browser-stage03.py`：V0.4 **历史快照**，例如固定断言导航只有 8 个入口及使用 V0.4 备份按钮；不应直接用于验收 V0.6.1，当前运行会因历史版本差异失败。
- `browser-stage04.py`：V0.5 **历史快照**，包含长时间打印测试；本轮复跑时未完整结束（脚本运行超时），不计入 V0.6.1 通过数。
- `legacy-v03-compat.py`：历史格式迁移辅助检查。

这组 Python 测试在内存模拟 IndexedDB 中运行。`browser-stage06.py` 用的是合成图片，不含用户真实工作区。运行需要 Python、Playwright 和 Chromium，浏览器路径可通过 `CHROMIUM_BIN` 指定。

正式 GitHub Actions 以 Node 逻辑测试、发布产物一致性和 React18/Vite 构建作为硬性门槛；如果后续把浏览器测试加入 CI，需要先为 CI 提供 Chromium 安装步骤。
