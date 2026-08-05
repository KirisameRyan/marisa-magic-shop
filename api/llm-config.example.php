<?php
// =============================================
//  大模型 API 配置模板 —— 复制为 llm-config.php 后填写
//  llm-config.php 已被 gitignore，不会上传仓库（含 API key，等同密码）
//  智谱: open.bigmodel.cn 注册 → API 密钥
//  模型: glm-4.6v-flash(免费视觉) / glm-4v-flash(免费视觉备选)
//        glm-4.6-flash(免费文本)
// =============================================
return [
    'base_url' => 'https://open.bigmodel.cn/api/paas/v4',
    'api_key'  => '你的智谱API密钥',
    'vision_model' => 'glm-4.6v-flash',
    'vision_fallback' => 'glm-4v-flash',
    'text_model'   => 'glm-4-flash',
];
