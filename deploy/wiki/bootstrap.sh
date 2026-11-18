#!/bin/sh
set -eu

cd /var/www/html
state=/var/lib/mediawiki
config="$state/LocalSettings.php"
password="$state/initial-admin-password"

if [ ! -f "$config" ]; then
    install -d -m 0750 -o www-data -g www-data "$state/db"
    if [ ! -s "$password" ]; then
        (umask 077; php -r 'echo bin2hex(random_bytes(24)), PHP_EOL;' > "$password")
    fi

    php maintenance/run.php install --dbtype=sqlite --dbpath="$state/db" \
        --dbname=marisa_wiki --confpath="$state" --passfile="$password" \
        --server="$WIKI_SERVER" --scriptpath= --lang=zh-hans --skins=Vector \
        '霧雨魔法店 Wiki' WikiAdmin
fi

chown root:www-data "$config"
chmod 0640 "$config"
chown www-data:www-data "$state/db/"*
# Keep generated credentials in the volume and site settings in version control.
printf '%s\n' '<?php' \
    'require "/var/lib/mediawiki/LocalSettings.php";' \
    'require "/opt/wiki/site.php";' > LocalSettings.php

if [ ! -f "$state/pages-initialized" ]; then
    seed() {
        su -s /bin/sh www-data -c 'exec php maintenance/run.php edit --user=WikiAdmin --summary="初始化小店 Wiki" "$0"' "$1" < "/opt/wiki/pages/$2"
    }

    seed 'Template:作品条目' 'work-template.wiki'
    seed '幻想乡交易所' 'exchange.wiki'
    seed '首页' 'home.wiki'
    seed 'MediaWiki:Mainpage' 'mainpage.wiki'
    seed 'MediaWiki:Sidebar' 'sidebar.wiki'
    seed 'Category:作品' 'works-category.wiki'
    seed '游戏' 'directory-games.wiki'
    seed '测试' 'directory-tests.wiki'
    seed '工具' 'directory-tools.wiki'
    seed '丙午东海道' 'story-channel.wiki'
    seed 'Z先生异闻录' 'human-stars-hs-001.wiki'
    seed '故事创作准则' 'story-guidelines.wiki'
    seed '故事' 'directory-stories.wiki'
    seed 'MediaWiki:Citizen-footer-desc' 'footer-description.wiki'
    seed 'MediaWiki:Citizen-footer-tagline' 'footer-tagline.wiki'
    seed 'Project:隐私政策' 'privacy.wiki'
    seed 'Project:免责声明' 'disclaimer.wiki'
    touch "$state/pages-initialized"
fi

exec apache2-foreground
