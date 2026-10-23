# 最终检查

完成日期：2026-10-23（Asia/Shanghai）。

## 基线海岛检查结果（加入小船前）

- `npm test`：3 项测试通过，覆盖地形连续性、外海高度、海岸形状、随机种子、天气参数及帧率无关过渡。
- `npm run build`：Vite 生产构建成功；JS 约 587 KB、gzip 约 151 KB。Three.js 与应用一次性加载，存在 Vite 默认 500 KB 大文件提示，不影响运行。
- `npm run test:browser`：最终完整回归通过；Chrome / Playwright Core / SwiftShader。
- 浏览器零 pageerror、零 console error，运行期零外部素材请求。
- 验证晴天、暴雨、夜晚，鼠标旋转、缩放、镜头重置、自动漫游、风浪与时间调节、暂停与继续、截图下载、隐藏与恢复 UI、折叠面板、移动端无横向溢出。
- 截图人工检查：桌面日落、暴雨、夜晚及手机构图。修正了重置后的惯性、暴雨海面亮度、细波远处闪烁、手机视场与位置。

## 代码检查

岛屿与水深共用等价 JS / GLSL 地形函数，保持近岸泡沫与海岸对齐。叶片和阴影使用同一风动函数。雨滴在 GPU 更新；静态景物合并、灌木实例化。三档画质调整像素比、反射分辨率和 Bloom。

没有发现阻断问题。没有外部图片、模型、视频或字体；favicon 与界面图标为内联代码生成 SVG。Three.js MIT 许可证包含在 public/ 与生产构建中，技能来源 MIT 许可证在 references/skills/。

## 验证边界

SwiftShader 软件渲染用于功能和 GLSL 编译验证，截图上的 FPS 是软件渲染结果，不能推断用户真实 GPU 帧率。尚未在独立显卡上做硬件基准。视觉采用实时近似，未实现完整体积云多次散射、流体求解或离线光追。

详细机器可读结果：test-results/browser-report.json。

## 本地文件打开修复

用户通过 file:// 直接打开源码入口时，开发模块与样式未被 Vite 转换。新增 scripts/standalone.mjs，将生产 JS / CSS 内嵌为“海岛-双击打开.html”，根目录与 dist/ 均提供离线文件。源码入口在 file:// 下停止加载开发模块并跳转到离线版，HTTP 开发模式保持正常。

`node tests/offline.mjs` 重现直接打开根目录 index.html：跳转、WebGL 渲染、天气按钮均通过，零控制台错误、零 HTTP 请求。

## 交互小船检查结果

- `npm test`：共 6 项通过。新增共享海浪查询、海岸与连续路径限制、尾流传播与衰减、暂停与长期数值稳定性检查。
- `npm run build`：生产与离线 HTML 构建成功，JS 约 612 KB / gzip 160 KB。
- `npm run test:boat`：Chrome / SwiftShader 通过自动巡航、随浪升沉、鼠标抓取和拖动、拖动时镜头固定、尾流能量与实际轨迹、松手恢复、指针取消恢复、空白海面重新控制镜头、离线版运行，以及真实触摸事件的抓取 / 移动 / 释放检查。
- 最终浏览器错误数：0。详情在 test-results/boat-report.json。
- 人工检查 test-results/boat-drag-wake.png 与 boat-mobile.png，确认船体、布帆、船尾泡沫与拖动提示可见，手机面板不遮挡默认小船。

代码检查：CPU 浮力与 GLSL 从同一份波谱生成；浮点尾流纹理接入顶点、法线与泡沫，固定网格保持内存有界；指针捕获与取消路径恢复 OrbitControls。船只与海岛之间使用连续海面边界检查。没有新增外部图片或模型。

## 公开发布

GitHub 账户 lcoer 的公开仓库 pelagic-island 已创建并上传。源码分支 main，网站分支 gh-pages；GitHub Pages 返回 built，source=gh-pages:/，公开地址为 https://lcoer.github.io/pelagic-island/。

发布前 `npm test` 六项通过，生产构建通过；Vite base 改为相对路径以支持仓库子路径，npm 缓存路径改为项目相对目录以支持其他系统。本地依赖、缓存、临时文件及 CLI 工具未上传。

## 程序化环境音检查

新增 src/ambience.js：五层海浪 / 水声 / 海涌 / 风声，右上角开关和音量。首次用户点击才创建 AudioContext，增益与滤波平滑过渡；暂停或隐藏时淡出并 suspend，音量保存在 localStorage。兼容缺少 cancelAndHoldAtTime 的实现。

- 单元测试共 8 项通过，新增天气混音连续性、噪声幅值、直流与循环接缝测试。
- `npm run test:sound` 通过：实际输出非静音，音量零时停止，调节后恢复，暂停 / 继续，重复开关只使用同一组 5 个声源，移动端控件与离线文件可用；控制台错误数为 0。
- 同一生产声源图离线合成 14 秒：RMS 约 0.089，峰值约 0.466（低于数字满幅 1），左右通道有差异。该检查验证信号输出和余量，不代替真实扬声器或耳机的主观听感。
- 生产构建与独立 HTML 生成成功。未使用外部音频文件。
