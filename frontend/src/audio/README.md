# 前端音频黑盒

外部只允许从 `index.ts` 导入 `useRadioAudio`、`useVisualizer`、`RadioAudioContext`。

- `engine.ts`：音频元素、WebAudio 分析图、试听区间、音源取链。
- `impacts.ts`：拉取服务端时间轴，缺失时返回 null。
- `visualizer/`：配置、频谱采样、圆环/边缘绘制、冲击动画。

修改后必须验证：首次点击解锁音频、切歌定位、试听边界、暂停/恢复、无时间轴时不震动。
