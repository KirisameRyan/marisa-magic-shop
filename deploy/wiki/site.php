<?php

$wgServer = getenv( 'WIKI_SERVER' );
$wgSitename = '雾雨 Wiki';
$wgCookieSecure = str_starts_with( $wgServer, 'https://' );
// Share interface-message invalidation between Apache and maintenance commands.
$wgMessageCacheType = CACHE_DB;
wfLoadSkin( 'Citizen' );
$wgDefaultSkin = 'citizen';
$wgCitizenHeaderPosition = 'left';
$wgCitizenHeaderPositionMobile = 'top';
$wgVectorResponsive = true;
$wgLogos = [ '1x' => "$wgScriptPath/resources/assets/shop-logo.png" ];
$wgGroupPermissions['*']['edit'] = false;
$wgGroupPermissions['*']['createaccount'] = false;
$wgGroupPermissions['*']['autocreateaccount'] = (bool)getenv( 'WIKI_SSO_SITE' )
    && strlen( (string)getenv( 'MMS_WIKI_SSO_SECRET' ) ) >= 32;
$wgGroupPermissions['user']['edit'] = false;
$wgGroupPermissions['user']['createpage'] = false;
$wgGroupPermissions['user']['createtalk'] = false;
$wgGroupPermissions['editor']['edit'] = true;
$wgGroupPermissions['editor']['createpage'] = true;
$wgGroupPermissions['editor']['createtalk'] = true;
$wgGroupPermissions['sysop']['edit'] = true;
$wgGroupPermissions['sysop']['createpage'] = true;
$wgGroupPermissions['sysop']['createtalk'] = true;
$wgAddGroups['sysop'][] = 'editor';
$wgRemoveGroups['sysop'][] = 'editor';

require_once '/opt/wiki/ShopLogin.php';
$wgAuthManagerAutoConfig['primaryauth'][ShopLoginProvider::class] = [
    'class' => ShopLoginProvider::class,
    'sort' => 1,
];

$wgResourceModules['site.marisaWiki'] = [
    'styles' => [ 'wiki-theme.css' ],
    'localBasePath' => '/var/www/html/resources/assets',
    'remoteBasePath' => "$wgScriptPath/resources/assets",
];
$wgHooks['BeforePageDisplay'][] = static function ( $out, $skin ) {
    if ( in_array( $skin->getSkinName(), [ 'citizen', 'vector-2022' ], true ) ) {
        $out->addModuleStyles( 'site.marisaWiki' );
    }
};

wfLoadExtension( 'VisualEditor' );
