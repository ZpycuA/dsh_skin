# NOTICE — 开源组件与素材署名（编码道德清单）

本插件逐文件列明来源与许可。代码与素材许可相互独立。

## 1. 本插件代码（MIT）

| 文件 | 作者 | 许可 |
| --- | --- | --- |
| `index.js`、`client/praze-skin.js`、`client/praze-skin.css`、`package.json`、`cordis.patch.yml` | ZpycuA（2026，AI 辅助编写） | MIT（见 LICENSE） |

## 2. 参考/依赖的开源项目（未复制代码，仅遵循其公开接入范式）

| 项目 | 作者 | 许可 | 使用方式 |
| --- | --- | --- | --- |
| [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) | DeepSeek-AI | MIT | 宿主框架；使用其公开插件接缝（webServer.register / tapIndex / session/event / llm/stream / credentials / subprocess） |
| [Cordis](https://github.com/cordiverse/cordis) | cordiverse | MIT | dsh 底层插件框架（随宿主提供，本包不 vendored 任何代码） |
| [dsh-token-monitor](https://github.com/chencmb2077-ui/dsh-token-monitor) | chencmb2077-ui | MIT | **接入范式参考**：静态 Host 插件结构、子进程查余额、用量事件统计写法。本插件为其范式的独立实现，未逐行复制；如判定构成衍生，同样以 MIT 兼容 |
| [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) / [dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale) 等社区皮肤 | 各社区作者 | 各自许可 | 仅作生态调研参考，未使用其代码或素材 |

本插件**零运行时第三方依赖**（无 npm dependencies，无 CDN、无外部字体、无遥测）。

## 3. 图片素材（逐文件）

| 文件 | 来源 | 权利与许可 |
| --- | --- | --- |
| `assets/background.png` | 用户 ZpycuA 本人提供（文件名 ZpycuA.png，校园学习题材插画） | © 2026 ZpycuA，由权利人本人授权用于本插件。随 Praze 设定集生态分发时遵循 CC BY-NC 4.0；单独提取使用请联系权利人 |
| `assets/avatar.png`、`assets/avatar-happy.png`、`assets/icon.png` | 本项目 AI 生成的**原创** Q 版鲸鱼娘形象（2026-11-14 生成，参考用户提供的形象特征说明：蓝发渐变、黑白女仆装、鲸鱼尾/耳） | © 2026 ZpycuA（AI 辅助生成，在权利人持有相应权利的范围内提供），随代码包以 CC BY-NC 4.0 提供。**非 DeepSeek 官方素材**，不代表官方形象或背书 |

### 鲸鱼娘形象的文化致谢（非素材直接使用）

社区「DeepSeek 娘 / 鲸鱼娘」形象的流行源于以下创作者，本插件的 AI 生成头像仅参考
「蓝发 + 女仆装 + 鲸鱼尾」这一通用特征组合，未复制其任何具体画作：

- **上善**：鲸鱼娘原始角色形象（Pixiv / Bilibili UID 4456176）
- **ZipZipPipe**：在鲸鱼娘形象上加入 DeepSeek 元素的女仆鲸鱼娘二创（Pixiv / Bilibili UID 4168597）

如果你更喜欢社区原版立绘，推荐直接使用上述作者授权的开源皮肤项目
（如 dsh-deep-whale、dsh-whale-galgame），并遵守其各自的素材许可。

## 4. 世界观与文案

| 内容 | 来源 | 许可 |
| --- | --- | --- |
| Praze 世界观术语（P 空间、耦合能、计划树、投射四象限等）在界面文案与桌宠人设中的引用 | 《Praze》设定集 V3-261031，© 2026 ZpycuA | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)；仓库 <https://github.com/ZpycuA/Praze_Site> |

本插件仅使用设定集的**视觉与术语元素**做健康向的界面装饰，不包含设定集中的成人/猎奇内容。

## 5. 数据口径来源

| 数据 | 来源 | 时点 |
| --- | --- | --- |
| 峰谷时段规则（工作日 9–12 / 14–18 高峰，周末与法定节假日空闲半价） | DeepSeek 官方 API 文档「模型 & 价格」 | 2026-11-14 查阅 |
| 默认价格表（flash/pro × 峰谷 × 命中/未命中/输出） | 同上 | 2026-11-14 查阅，可在设置中编辑 |
| 2026 年节假日 | 国务院办公厅《关于2026年部分节假日安排的通知》（国办发明电〔2025〕7号，中国政府网） | 2025-11-04 发布 |
| 2027 年节假日 | 国务院办公厅《关于2027年部分节假日安排的通知》（国办发明电〔2026〕10号，中国政府网） | 2026-11-05 发布 |
| 余额接口 / 模型 effort 档位 / 对话接口 | DeepSeek 官方 API 文档（api-docs.deepseek.com） | 2026-11-14 查阅 |

价格与规则可能变动，插件内价格表与节假日表均可编辑；费用估算仅供参考，以官方账单为准。

## 6. 商标声明

DeepSeek、DeepSeek Harness 名称与商标归深度求索所有；Praze 为 ZpycuA 的原创世界观。
本项目为非官方社区插件，与相关权利人不存在隶属、合作或背书关系。