<?php
// =============================================
//  大模型 API 配置 —— 此文件已加入 .gitignore，勿上传仓库
//  智谱: open.bigmodel.cn 注册 → API 密钥
// =============================================
return [
    'base_url' => 'https://open.bigmodel.cn/api/paas/v4',
    'api_key'  => '6deb134f90a242f79e3f4e30c9282a24.zX0ZTg82awKFJI4B',
    'vision_model' => 'glm-4.6v-flash',      // 截屏识别(免费, 高峰期可能限流)
    'vision_fallback' => 'glm-4v-flash',     // 视觉备选(免费)
    'text_model'   => 'glm-4-flash',        // CSV 兜底等纯文本任务(免费)
];
