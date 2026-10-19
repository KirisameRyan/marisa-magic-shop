# Android 客户端源码

从原 `android-app/` 迁移，包名和 WebView 实现不变。在 Android Studio 中打开此目录，按本机 SDK 设置 `local.properties`，签名信息只放本机。

从仓库根执行 `python scripts/release.py android` 生成新的 `app/src/main/assets/www.zip`。该文件由公开资源白名单生成，不能提交；旧包曾包含数据库，已移至根目录的忽略区隔离，不能再使用。

APK/AAB 是发布产物，应放 Releases 或独立分发服务，不放网站源码目录。当前离线壳的部分在线功能仍依赖正式网站 API。
