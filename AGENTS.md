# dnf-astra 维护约定

- 本项目的唯一 Git 仓库为 `git@github.com:Transcendo/dnf-astra.git`，Multica project 为 `dnf-astra`（331b2b97-4e60-43d8-8b67-758fc51712eb）。相关 issue 应归属此 project。
- 开发结果必须 Git 提交并推送到此仓库；后续改动使用分支与 PR，交付包含提交或 PR 链接。下载附件可以补充交付，不能替代 Git 上传。
- 桌面键鼠单机副本，沿用原生 HTML/CSS/Canvas。保持离线直接打开能力，不擅自引入后端、账号或付费服务。
- 源码入口为 `index.html`、`style.css`、`game.js`；生成背景位于 `assets/`。修改后执行 `npm run build`，同步提交生成的 `锅盖雪人.html`。
- 使用 `npm ci` 安装开发依赖；规则或输入逻辑变动执行 `npm test`，必要时先 `npx playwright install chromium`。测试输出 `test-results/` 不入库。
- 美术与交互改动需检查实际浏览器截图；有意简化、测试范围和限制如实记录。新增素材记录到 `ASSETS.md`，不得提取原版受限素材。
- 游戏规则与操作变动同步更新 `README.md` 和 `DESIGN.md`。禁止提交密钥、node_modules、运行缓存或个人文件。
