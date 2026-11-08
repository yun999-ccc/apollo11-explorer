# 登月舱三维座舱与控件核验 · 2026-11-08

五个入口共用原生三维座舱、面板状态和 Luminary099 会话。左键或单指拖动改变眼位的朝向，滚轮改变视野。完整座舱可以转向侧面、后方和顶部。直接点按用三维射线判断最前方命中的表面，拖动越过 5 像素后只转头。

## 三维来源与转换

- 固定 NASSP 提交 `a4ed25511e626823f9c83b457cf9371375b82094`。从原始 `LM_VC.msh` 及其 34 张 DDS 材质开始，逐个与 GitHub 树中的 Git 对象哈希比对。 [原生座舱网格](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Meshes/ProjectApollo/LM_VC.msh)
- `modeling/convert-lm-vc.py` 转换米制坐标 `(x, y, -z)` 和面方向，按材质合批静态网格，保留全部 686 个原组编号、335,729 个三角面和 66 个独立控件网格。面板图集保持原 4096 像素和无损编码，其余大图集下采样至最长边 2048 像素。材质、网格、开关枢轴与来源清单可通过 [资源清单](nassp/vc/manifest.json) 复核。
- 完整座舱和左舷窗共用指令长眼位，着陆观察窗和 DSKY 采用上游眼位。转换时加下降级相机偏移 1.75 m，减上升级网格偏移 0.99 m。主面板近看使用居中检查眼位。左舷窗、DSKY 朝向与浏览器视野按网页构图调整。 [眼位和控件定义](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_lm/lemvc.cpp#L505) · [网格偏移](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_lm/lemmesh.cpp#L74)
- 43 个面板控件支持拨动或旋转，4 个未接系统的中止／主警报按钮可查看说明。19 个 DSKY 按键可将指令送给原程序，数字、告警灯和两只下降级氦气阀反馈窗画到原三维材质坐标。侧壁与后舱设备按原网格展示，超出已接通范围的设备仍是观察对象。

## 技能试配与验收

以本项目原地转向、画布局部坐标、最近交点和隐藏网格过滤为四项检查。按技能及关联参考是否给出可直接转用的机制计分。`threejs-interaction` 为 4/4，通用 `three-js` 为 3/4，`three-webgl-game` 为 0/4。该分数衡量文档对本项目输入细节的覆盖。左键拖动与点击分流为本项目实现。 [选用技能](https://github.com/CloudAI-X/threejs-skills/blob/0e181866f095b5f06d005133876e926515390d95/skills/threejs-interaction/SKILL.md) · [通用参考](https://github.com/Jbmanllr/agent-skills/tree/main/skills/three-js) · [WebGL 游戏技能](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/three-webgl-game/SKILL.md)

- `node validation/check-cabin-assets.mjs` 核验 GLB 校验值、686 个原组、三角面索引、34 张内嵌材质、47 个面板控件和 19 个 DSKY 按键。
- 浏览器逐一拖动五个预设，相机位置不变，朝向改变。完整座舱转到 −180° 看见后舱，抬头看见顶部。以 DSKY 按键为拖动起点没有输入，实际点按 VERB、3、5、ENTR 后得到 21 位灯测。
- 浏览器直接点按主阀 3D 拨杆，关闭后回中，阀位跨视角保留。原 AGC 输入和阀门台架测试仍可在下方复跑。

## 既有系统和操作范围

- 首页“进入登月舱操作”、三维舱门、部件详情和旧的 `/console/?craft=lm` 链接进入 `/landing/`。
- 指令舱仍进入原DSKY操作页。登月舱独立计算机保留在 `/console/?craft=lm&standalone=1`。
- 下降工程模型初始暂停；可先检查和操作面板。DSKY保持原程序运行，便于按键检查。
- 保留原面板英文；选中或悬停时，旁侧显示英文（中文）、开关位置、作用与源码位置。
- 正面近看范围按 `lempanel.cpp` 提取 47 个控件状态，三维位置按 `lemvc.cpp` 核对。
- 43个控件实现保持档位或松手回中。120个合法档位状态经自动检查；其中19个为弹簧回中开关。
- 4个中止／中止分级／左右主警报控件暂不执行系统指令，明确显示未建模。源文件的默认布尔值不解释为网页上已按下按钮。
- THR CONT（推力控制）依据原始AGCIOSwitch接线写入AGC通道030的AutoThrottle信号。真实WASM内存检查证明仅改变目标位，保留其他信号。这不等于计算机已控制发动机。
- 切换主面板、DSKY、舷窗时保留同一面板开关状态与计算机会话。

## 来源与可复核方式

NASSP固定版本：`a4ed25511e626823f9c83b457cf9371375b82094`。

- `nassp/lempanel.cpp`：区域坐标、单个开关坐标、注册默认值、回中类型、旋钮角度、AGC输入接线。
- `nassp/controls/toggleswitch.cpp`、`toggleswitch.h`：双位、三位和旋钮的操作与贴图选择。
- `nassp/controls/original-assets.zip`：原始BMP和开关源码。对应PNG只将源图的品红色键转换为透明，保留RGB。
- `nassp/controls/assets.json`：来源、固定版本、原始文件与转换文件SHA256。
- `nassp/controls/controls.json`：每个控件的原始定义行号、注册行号、坐标、默认值、类型和角度。
- `../modeling/extract-cockpit-controls.py`：从固定源码重新生成控件表。

浏览器操作适配：原生开关仍按上、下半部操作。旋钮为触屏兼容改为左、右半部切档，同时提供侧栏按钮与键盘操作。此输入方式不是原Orbiter鼠标左右键的逐字移植。

## 已执行验证

- `node validation/check-panel-controls.mjs`：47个独立控件、94处源码行号、120个档位状态、19个松手回中、4个未实现操作的阻止、端位与非法输入。
- `node validation/check-panel-agc-signal.mjs`：真实WASM执行AUTO/MAN输入，检查030通道第5位及其他输入位保留。
- `node validation/check-agc.mjs`：LM与CM原程序灯光测试、P00、不同数字回显、篡改映像拒绝。
- `node validation/check-p66-peripherals.mjs`：此前的ROD输入、原RODCOMP例程和DPS脉冲输出独立台架测试，不是整次下降验证。
- `node validation/check-landing.mjs`：现有工程下降模型的10项数值检查，不是历史轨迹验收。
- `python3 validation/check-control-assets.py`：8幅开关贴图逐像素对照原始BMP，检查原始文件、PNG、6份源文件与归档SHA256。只允许原始品红色键变为透明。
- `python3 validation/check-nassp-assets.py`：三幅面板原图RGB无差异。
- 浏览器：遍历47项中文说明；操作43项侧栏档位；19项回中；4项明确禁止；原面板推力开关直接命中；DSKY全部21位灯测；切换舷窗保留状态；首页登月舱入口和旧链接跳转。

## 尚未达到的要求

1. 两只下降级氦气调节阀已接到独立阀门模型，详见下方。整舱供电、其余阀门、继电器、环境控制、警报和监视仪表仍待接通。
2. 主面板多数仪表仍为固定读数。
3. 初始开关位置使用NASSP的InitSwitches默认值；不是阿波罗11号末段下降检查配置。
4. 原AGC、传感器、发动机与飞行动力学未形成已验证闭环；下降工程模型仍独立运行。没有可验证的P66完整任务初始快照。
5. 中止、分级、CWEA主警报、完整ACA/TTCA手柄与DSKY以外的硬件尚未完整移植。
6. 氦气监视旋钮已按源码角度绘制，但各档位的历史标签对应尚待核对，界面明确标记。
7. 窗外仍使用工程地形。尚未对真实着陆区地形做配准。

后续验收应逐项覆盖：控件输入 → 电源／联锁 → 系统状态 → 传感器／仪表反馈 → 同一任务状态下的飞行响应。不能将本页的机械档位通过数当作完整系统完成率。

## 供电与阀门的源码核对

已归档固定版本的 `lm_rcs.cpp`、`lm_aps.cpp`、`lm_scea.cpp`、`lm_dps.h`，供后续移植核对。`LEMRCSValve::SwitchToggled` 和 `APSValve::SwitchToggled` 要求电源存在且电压超过源码阈值，上拨打开、下拨关闭、中位不改变阀门。RCS交叉供给还检查该系统是否具有交叉供给阀。不能把开关松手回中误作关阀，也不能在尚未接通电源模型时宣称阀门已执行。其余阀门仍在核对供电和指示回路。

## 下降级氦气调节阀

DES He REG 1 / 2（下降级氦气调节器 1 / 2）的两只拨杆分别控制主、备用调节阀。指令回路高于 20 V 时，上拨打开、下拨关闭，回中不改变阀位。指示回路单独判定供电，掉电时反馈窗分别取上游定义的失电位置。反馈窗采用原 `Indicator.bmp` 的 23 × 23 像素帧与原始位置，按三维座舱源码的每秒 64 帧行程向目标移动，网页用界面时钟推进显示。

- 初始主阀打开、备用阀关闭，取自 [NASSP 下降前存档，第 15495 行附近](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Scenarios/Project%20Apollo%20-%20NASSP/Apollo%20-%20Mission%20Scenarios/Apollo%2011/Apollo%2011%20-%2010%20-%20PDI%20T-15m.scn#L15495)。网页检查采用两路 28 V 标称供电条件。母线实际电压及飞行压力尚未联动。
- 阀门动作、阈值和独立回路来自 [DPSValve::SwitchToggled](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_lm/lm_dps.cpp#L42)、[20 V 源码阈值](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_sys/PanelSDK/PanelSDK.h#L49) 与 [lemsystems.cpp 接线](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_lm/lemsystems.cpp#L781)。
- 反馈窗逻辑、位置与动画来自 [LEMDPSValveTalkback::GetState](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_lm/lemswitches.cpp#L1702)、[面板反馈窗定义](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_lm/lempanel.cpp#L2012) 与 [IndicatorSwitch::DrawSwitch](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_sys/toggleswitch.cpp#L3760)。
- `node validation/check-descent-helium.mjs` 检查双阀独立、松手保持、20 V 临界条件、指示掉电位置、动画帧及重置。
