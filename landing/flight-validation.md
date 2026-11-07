# 鹰号末段着陆验证

## 装机程序和原始资料

- 网页使用阿波罗11号登月舱装机程序 LMY99 修订 001，也称 Luminary 99/1。已逐一核对 ROM 的 36 个存储体，共 36,864 个 15 位机器字，与原始八进制清单转录一致。二进制 SHA-256 为 `1f5326e038de5b741b2f27b01ec949dbd688cf1906994e997402587c8628f40e`。[程序扫描与修订说明](https://www.ibiblio.org/apollo/Luminary.html)
- 座舱继续使用 NASSP 提交 `a4ed25511e626823f9c83b457cf9371375b82094` 的资源。三张底图的非透明颜色均通过逐像素检查。LM-5 的硬件适用性需按控件核实。下表中的坐标和接口对应固定版本模拟器。[NASSP 面板坐标源文件](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Orbitersdk/samples/ProjectApollo/src_lm/lempanel.cpp) · [NASA 登月舱显示与控制报告](https://www.nasa.gov/wp-content/uploads/static/history/alsj/tnD6722LMDisplayControl.pdf)
- LROC 提供阿波罗11号着陆区的 2 米/像素高程、0.5 米/像素正射影像和高程置信度图。目录标注的经纬度范围包含静海着陆点。进近航迹的完整覆盖及网页坐标配准仍待验证。[LROC 产品目录](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO11) · [NASA 着陆点](https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo11info.html)

| 控件或仪表 | 已查到的上游位置 | 本地验证 |
| --- | --- | --- |
| DSKY（显示与键盘） | `AID_DSKY_KEY`、`AID_DSKY_DISPLAY`、`AID_DSKY_LIGHTS` | 指令舱和登月舱的 V35、P00 与数字回显测试通过。登月舱网页实测 V35 显示三排 `88888`。 |
| ROD（下降率开关） | `LEM.cpp` 的 `DescendPlus`、`DescendMinus`，通道 016 的第 6、7 位 | 原 ROM 在两个方向均产生计数。按住和松开不重复计数。独立调用原始 P66 例程 `RODCOMP` 时，例程消耗该计数并更新 `VDGVERT`。 |
| ACA（姿态控制手柄） | `LEMcomputer.cpp` 的通道 013 读取逻辑，计数器 042 至 044 | 代码定位完成。与飞行状态同步待验。 |
| FDAI（姿态指示仪） | `fdaiLeft.RegisterMe`，主面板左仪表原图起点 744、625，着陆观察窗为 1320、243 | 原图坐标已核，动态姿态球和指针待验。 |
| 高度与高度变化率带尺 | `AID_RANGE_TAPE`、`AID_RATE_TAPE`，`LEMcomputer::ProcessChannel143` | 原图坐标已核，雷达与计算机显示来源切换待验。 |
| LUNAR CONTACT（月面接触灯） | `AID_CONTACTLIGHT1` 与 `AID_CONTACTLIGHT2` | 原图坐标已核，探针事件待验。 |
| ENGINE STOP（发动机关停） | `CDRManualEngineStop`，上游注册在 `Panel5SwitchRow` | 已查到原按钮位置。发动机关停和脚垫触地的先后顺序待验。 |
| DPS（下降推进系统） | `THRUST` 寄存器 055，通道 014 第 4 位使能，NASSP 通道 0142 将输出送往 DECA（下降发动机控制组件） | 用原 ROM 的 `FLATOUT` 例程实测发出一次 4096 脉冲。持续闭环和 DECA 执行状态待验。 |

## 独立参考和验收边界

- 固定版本 NASSP 的 `Apollo 11 - 10 - PDI T-15m.scn` 包含鹰号的轨道状态、显示、1,511 个非零可擦除内存条目、I/O 和中断状态。任务时间是 102:25:44.424，`MODREG` 的八进制值为 77（十进制 63）。它可用于恢复动力下降前的参考状态。P66 起点需要从参考模拟器飞行后采集，包括 AGC、惯性测量、着陆雷达、飞行姿态和节流执行状态。[固定版本参考场景](https://github.com/orbiternassp/NASSP/blob/a4ed25511e626823f9c83b457cf9371375b82094/Scenarios/Project%20Apollo%20-%20NASSP/Apollo%20-%20Mission%20Scenarios/Apollo%2011/Apollo%2011%20-%2010%20-%20PDI%20T-15m.scn)
- 《Apollo 11 LM-5 Computer Words》PDF 第 7 页在 102:43:21 的记录行显示程序 66、动作码 06 和数据码 60，R2 为 `-00100`，R3 为 `+00410`。任务报告表 5-I 记录进入 P66 为 102:43:22，脚垫触地为 102:45:39.9。两套记录分别保留时间轴，仍需查清这 1 秒的差异再做历史重放对齐。下行只记录选定字段，可用于独立比对显示、旗标和其他遥测量。[原始计算机下行记录](https://www.ibiblio.org/apollo/Documents/apollo_11_computer_words.pdf#page=7) · [NASA 任务报告](https://www.nasa.gov/wp-content/uploads/static/apollo50th/pdf/A11_MissionReport.pdf)
- 现有浏览器的下降工程实验仍使用独立简化控制律。内核测试分别验证了 ROD 到原始程序和原始程序到节流输出的两段接口。验收要求在同一 P66 场景中看到节流输出驱动推力、推力改变飞行状态、模拟传感器再把变化反馈给原程序。然后才能验收动态面板、窗景和 P64 至 P66 的切换。

## 重跑本地检查

```sh
python3 validation/check-luminary-rom.py
python3 validation/check-nassp-assets.py
node validation/check-p66-peripherals.mjs
node validation/check-agc.mjs
node validation/check-landing.mjs
```

`check-p66-peripherals.mjs` 可接收一个替代 WASM 路径。用修改前的二进制运行，会在第一个下降率开关计数检查处失败。当前版本通过。该测试中的例程入口是隔离试验条件，不是任务存档。
