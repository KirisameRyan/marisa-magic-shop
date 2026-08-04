// =============================================
//  霧雨魔法店 · API 基址配置
//  网页版: 同源 → 空字符串, 所有 fetch 相对路径
//  App 离线壳内嵌版: 打包脚本会替换为绝对地址
//    window.API_BASE = 'https://www.azureflame.cloud';
//  用法: fetch(API_BASE + 'api/xxx.php', ...)
// =============================================
window.API_BASE = window.API_BASE || '';
