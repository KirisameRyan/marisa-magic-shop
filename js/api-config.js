// =============================================
//  霧雨魔法店 · API 基址配置
//  网页版: 同源 → 空字符串, 所有 fetch 相对路径
//  App 离线壳内嵌版(appassets 域): API 直连线上服务器
//  用法: fetch(API_BASE + 'api/xxx.php', ...)
// =============================================
window.API_BASE = window.API_BASE || '';
if (location.hostname === 'appassets.androidapp.net') {
    window.API_BASE = 'https://www.azureflame.cloud';
}
