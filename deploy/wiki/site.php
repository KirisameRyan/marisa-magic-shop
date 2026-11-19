<?php

$wgServer = getenv( 'WIKI_SERVER' );
$wgSitename = '雾雨 Wiki';
$wgCookieSecure = str_starts_with( $wgServer, 'https://' );
$wgCookieDomain = '';
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
$wgGroupPermissions['*']['autocreateaccount'] = false;
$wgGroupPermissions['*']['createpage'] = false;
$wgGroupPermissions['*']['createtalk'] = false;
$wgGroupPermissions['user']['createaccount'] = false;
$wgGroupPermissions['user']['autocreateaccount'] = false;
$wgGroupPermissions['sysop']['createaccount'] = true;
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
