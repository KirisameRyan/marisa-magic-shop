<?php
require_once __DIR__ . '/bootstrap.php';
return [
    'base_url' => 'https://open.bigmodel.cn/api/paas/v4',
    'api_key' => mms_env('MMS_ZHIPU_API_KEY'),
    'vision_model' => mms_env('MMS_VISION_MODEL', 'glm-4v-flash'),
    'vision_fallback' => mms_env('MMS_VISION_FALLBACK', 'glm-4.6v-flash'),
    'text_model' => mms_env('MMS_TEXT_MODEL', 'glm-4-flash'),
];
