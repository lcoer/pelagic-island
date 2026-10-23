# PELAGIC · 潮汐之外

## GitHub Pages 发布

`main` 保存源代码，`gh-pages` 保存 `npm run build` 生成的 `dist/` 内容。仓库 Settings → Pages 的发布来源为 **Deploy from a branch → gh-pages → / (root)**。更新源码后重新构建并发布产物分支，GitHub Pages 会自动部署该分支。`vite.config.js` 使用相对资源路径，适配 `https://用户名.github.io/仓库名/`。

公开仓库包含源码、测试和必要许可；node_modules、下载缓存、测试临时文件与本地 ZIP 不上传。网页访问者无需安装 Node.js，直接通过部署后的网址操作。

纯代码生成、可实时交互的 Three.js 热带海岛。默认日落，支持晴天、暴雨和夜晚。所有项目依赖、技能参考、npm 下载缓存和测试结果都位于此 D 盘目录内。

## 运行

**直接双击运行：打开根目录的 `海岛-双击打开.html`。** 该文件已内嵌全部脚本与样式，不需要启动服务。直接打开根目录或 dist/ 中的 index.html 也会自动转到旁边的离线版本。

需要修改源码、使用开发模式时，再按下方步骤启动本地服务。

需要 Node.js 20.19+ 或 22.12+；在此目录执行：

```powershell
npm install
npm run dev
```

打开终端打印的本地地址，通常为 `http://127.0.0.1:5173/`。也可以双击 **启动海岛.cmd**。当前交付已安装依赖，直接运行 `npm run dev` 即可。

```powershell
npm run build     # 输出 dist/，可部署到任意静态文件服务器
npm run preview   # 在本地查看生产构建
npm test          # 地形、随机种子、天气过渡测试
```

开发源码通过 HTTP 服务运行；离线 HTML 可通过 file:// 直接打开。运行时不需要外部网络，不请求 CDN、图片、字体、模型、音频或视频。每次 `npm run build` 都会重新生成离线 HTML。

## 操作

| 操作 | 功能 |
| --- | --- |
| 鼠标左键拖动 / 单指拖动 | 自由环绕镜头 |
| 滚轮 / 双指捏合 | 缩放 |
| 右键拖动 / 双指平移 | 平移观察中心 |
| 晴天 / 暴雨 / 夜晚，或键盘 1 / 2 / 3 | 天气平滑切换，应用相应时间与风浪 |
| 日光时刻 | 自由选择 0–24 小时，手动调整会关闭昼夜流转 |
| 昼夜流转 | 时间自动推进，一昼夜约 16 分钟 |
| 海浪强度 / 海风 | 调节海面振幅及植被风动 |
| 环岛漫游 | 自动旋转；开始手动拖动时停止漫游 |
| 空格 / 暂停按钮 | 暂停时间，镜头仍可操作 |
| ↺ | 恢复默认构图 |
| 相机按钮 | 保存不含界面的 PNG 截图 |
| H / 眼睛按钮 | 隐藏或恢复界面 |
| 右上角按钮 | 浏览器全屏 |
| 面板右上角 − | 折叠面板，便于移动端观赏 |
| 按住小船船体或船帆拖动 / 手指拖船 | 在海面移动小船，松开后继续随浪航行 |

天气按钮关闭自动昼夜流转，便于停留在所选氛围。可随时重新开启。风浪和光照在几秒内渐变，暂停时过渡也暂停。

## 可交互小船

海岛前方有一艘程序化生成的木甲板帆船，带“拖动小船”提示。未按住时缓慢沿岛外航行，船首、船尾和两侧从海面同一组 Gerstner 波采样，随浪升沉、俯仰和横摇。按住船体或帆可拖动位置，拖船时镜头锁定，松开后恢复缓慢巡航；空白海面仍可拖动镜头。支持鼠标、触摸、指针取消、失焦和 Escape 释放。

小船限制在距岛中心 36–73 米的外海区域，连续路径检查阻止拖动穿过海岛。船体、桅杆、布帆、船舱、绳索、甲板和护舷均为代码几何体，无外部模型。

航行和拖动都会沿实际轨迹向一个 160×160 阻尼波动网格注入船尾及两侧船首扰动。网格解离散波动方程，生成传播与衰减的涟漪；同一张浮点纹理改变海面顶点高度、逐像素法线、反射和持续泡沫。尾流保留在走过的位置，随后逐渐消散。这是轻量的局部二维波动近似，并非完整船舶流体求解。

`src/boat.js` 实现模型与指针交互；`src/ocean-physics.js` 提供共享波谱、CPU 水面采样、航行边界与尾流波场。运行 `npm run test:boat` 可验证自动航行、拖动、镜头互斥、尾流、释放、取消和离线运行。

本次先检索 GitHub 的 [DRIFT](https://github.com/christianpasinrey/drift)（共享波场与船体浮力）、[WaterThreeJS](https://github.com/achrefelouafi/WaterThreeJS)（海面对象拖动与地形限制）和 [SeedOcean](https://github.com/expertping/SeedOcean-threejs)（尾流高度 / 泡沫场），再用 `npx skills find threejs interaction` 找到并阅读 [CloudAI-X / threejs-interaction](https://skills.sh/cloudai-x/threejs-skills/threejs-interaction)（检索时约 13.5K 安装，仓库约 3.7K stars）。技能文档保存在 references/skills/threejs-interaction.md；采用射线拾取、水平面拖动和 OrbitControls 互斥处理建议，本次功能源码自行实现。

## 渲染实现

- **海水**：七组不同波长与方向的 Gerstner 波，深水色散关系 `ω = √(gk)`；GPU 位移、逐像素斜率法线、随距离衰减的细波、近岸振幅抑制。
- **反射**：Three.js Reflector 渲染镜像场景，反射真实岛屿和天空；微法线扰动反射坐标；远处混合共享程序化天空。Fresnel 近似控制反射比例。
- **泡沫与浅海**：共享海岛高度函数生成水深，浅海吸收色、沙底色、近似焦散、运动岸浪、噪声破碎泡沫和波峰白沫。
- **海岛**：确定性高度场生成不规则沙滩和高地，逐顶点沙/草颜色，程序化沙粒；变形岩石；实例化灌木。
- **棕榈**：弯曲管状树干、环纹、椰子、曲线羽状叶与成对叶片，叶片在顶点着色器中随风摆动，阴影使用相同位移。
- **灯塔**：几何生成塔身、色带、窗户、栏杆、玻璃、塔顶；夜间发光灯芯、旋转光束和扫地聚光灯。
- **天空**：随太阳高度变化的天顶/地平线色、日落辉光、日/月圆盘、随时间漂移的分形噪声云、程序化星空，与海面共享天空函数。
- **暴雨**：6,500 条 GPU 雨线、海面雨环、冷色雾、增强风浪和随机闪电。
- **摄影效果**：HDR 中间缓冲、Bloom、ACES 色调映射、FXAA 和轻微暗角。
- **性能**：合并树叶/树干/岩石和栈桥，实例化灌木，非线性海面网格，三档分辨率与反射质量。流畅档关闭 Bloom。

这些是兼顾浏览器实时性能的物理启发近似：海浪不是完整 Navier–Stokes 流体或 FFT 频谱，云不是完整体积多次散射，水底可见色是地形解析近似而非真实场景折射。没有离线光追和预渲染资源。

## 文件

```text
index.html            中文控制面板与入口
src/main.js           场景组装、渲染、灯光、天气、镜头与交互
src/shaders.js        天空、海水、噪声、风动 GLSL
src/island.js         地形、植被、岩石、灯塔、栈桥、海鸟
src/world.js          确定性地形与天气数学函数
src/style.css         桌面 / 移动端界面
tests/world.test.js   Node 单元测试
tests/browser.mjs     Chrome 浏览器功能与着色器测试
references/skills/    find-skills 找到并下载的技能文档
design.md / plan.md   设计与实现计划
review.md             最终验证记录
dist/                 可部署生产构建
```

## GitHub 参考与技能检索

按要求先在 GitHub 检索类似项目，再运行 `npx skills find threejs`。参考了以下技术方向，应用源码为本项目实现，没有下载其图片、模型或视频：

1. [Three.js 官方海洋示例](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_shaders_ocean.html)：镜面海水、天空与色调映射的组织方式。使用的 Three.js 库及 addons 采用 MIT 许可证，其许可证随 node_modules/three 提供。
2. [Nugget8 / Three.js-Ocean-Scene](https://github.com/Nugget8/Three.js-Ocean-Scene)：程序化海天、昼夜变化与性能取舍。
3. [expertping / tideline-threejs](https://github.com/expertping/tideline-threejs)：Gerstner 海浪、海天一致性、天气与纯程序化场景的参考方向。

技能搜索选用 [CloudAI-X / threejs-skills](https://github.com/CloudAI-X/threejs-skills) 的 [threejs-shaders](https://skills.sh/cloudai-x/threejs-skills/threejs-shaders) 和 [threejs-animation](https://skills.sh/cloudai-x/threejs-skills/threejs-animation)。检索时分别显示约 14.8K / 19.4K 安装，源仓库约 3.7K stars；第三方技能内容已人工检查，只采用相关着色器、色彩管理、Timer、帧率无关动画建议。技能内容面向 r186，本项目固定为已验证的 Three.js r180，实际 API 以安装版本为准。文档及源仓库 MIT 许可保存在 references/skills/。

## 验证与性能

浏览器测试使用已安装的 Chrome，通过 Playwright Core 运行，不自动下载浏览器。默认测试地址为 `http://127.0.0.1:5174`；可用环境变量 `TEST_URL` 覆盖：

```powershell
$env:TEST_URL='http://127.0.0.1:5173'
npm run test:browser
```

测试截图和报告保存在 `test-results/`。测试使用 SwiftShader 软件 WebGL，验证着色器编译、天气、镜头、暂停、截图、移动端和无外部网络素材请求。其帧率不代表真实 GPU；真实设备没有固定的帧率承诺。建议开启硬件加速，性能不足时选“流畅”，高 DPI 屏幕可选“平衡”。
