<?php

use MediaWiki\Auth\AbstractPrimaryAuthenticationProvider;
use MediaWiki\Auth\AuthenticationRequest;
use MediaWiki\Auth\AuthenticationResponse;
use MediaWiki\Auth\AuthManager;
use MediaWiki\Language\RawMessage;
use MediaWiki\MediaWikiServices;

class ShopLoginRequest extends AuthenticationRequest {
    public $shopLogin;

    public function getFieldInfo() {
        $label = new RawMessage( '使用官网账号登录' );
        return [ 'shopLogin' => [ 'type' => 'button', 'label' => $label, 'help' => $label ] ];
    }
}

class ShopLoginCallback extends AuthenticationRequest {
    public $mmsWikiCode;

    public function getFieldInfo() {
        $label = new RawMessage( '官网登录凭证' );
        return [ 'mmsWikiCode' => [
            'type' => 'string', 'label' => $label, 'help' => $label, 'sensitive' => true,
        ] ];
    }
}

class ShopLoginProvider extends AbstractPrimaryAuthenticationProvider {
    private const SESSION_KEY = 'ShopLogin:request';

    public function getAuthenticationRequests( $action, array $options ) {
        return $action === AuthManager::ACTION_LOGIN && getenv( 'WIKI_SSO_SITE' )
            && strlen( (string)getenv( 'MMS_WIKI_SSO_SECRET' ) ) >= 32
            ? [ new ShopLoginRequest() ]
            : [];
    }

    public function beginPrimaryAuthentication( array $reqs ) {
        $request = AuthenticationRequest::getRequestByClass( $reqs, ShopLoginRequest::class );
        if ( !$request || !$request->shopLogin ) {
            return AuthenticationResponse::newAbstain();
        }
        $verifier = bin2hex( random_bytes( 32 ) );
        $challenge = hash( 'sha256', $verifier );
        $expires = time() + 600;
        $callback = $request->returnToUrl;
        // API clients supply returnToUrl themselves. Never sign a third-party destination.
        $wikiOrigin = rtrim( (string)getenv( 'WIKI_SERVER' ), '/' );
        if ( $wikiOrigin === '' || !$callback || !str_starts_with( $callback, "$wikiOrigin/" )
            || str_contains( $callback, '\\' ) || str_contains( $callback, '#' ) ) {
            return AuthenticationResponse::newFail( new RawMessage( 'Wiki 登录回跳地址无效。' ) );
        }
        $signature = hash_hmac(
            'sha256', "start\n$challenge\n$expires\n$callback", getenv( 'MMS_WIKI_SSO_SECRET' )
        );
        $this->manager->setAuthenticationSessionData( self::SESSION_KEY, [ $verifier, $expires ] );
        $url = rtrim( getenv( 'WIKI_SSO_SITE' ), '/' ) . '/api/wiki-auth.php?'
            . http_build_query( compact( 'challenge', 'expires', 'callback', 'signature' ) );
        return AuthenticationResponse::newRedirect( [ new ShopLoginCallback() ], $url );
    }

    public function continuePrimaryAuthentication( array $reqs ) {
        $request = AuthenticationRequest::getRequestByClass( $reqs, ShopLoginCallback::class );
        $session = $this->manager->getAuthenticationSessionData( self::SESSION_KEY );
        $this->manager->removeAuthenticationSessionData( self::SESSION_KEY );
        $error = new RawMessage( '官网登录凭证已失效，请从 Wiki 重新登录。' );
        $code = $request->mmsWikiCode ?? '';
        if ( !$session || $session[1] < time() || !preg_match( '/\A[a-f0-9]{64}\z/', $code ) ) {
            return AuthenticationResponse::newFail( $error );
        }
        [ $verifier ] = $session;
        $proof = hash_hmac( 'sha256', "redeem\n$code\n$verifier", getenv( 'MMS_WIKI_SSO_SECRET' ) );
        $backend = getenv( 'WIKI_SSO_BACKEND' ) ?: getenv( 'WIKI_SSO_SITE' );
        $json = MediaWikiServices::getInstance()->getHttpRequestFactory()->post(
            rtrim( $backend, '/' ) . '/api/wiki-auth.php',
            [
                'postData' => [ 'action' => 'redeem', 'code' => $code, 'verifier' => $verifier, 'proof' => $proof ],
                'timeout' => 5,
                'followRedirects' => false,
            ],
            __METHOD__
        );
        $id = $json === null ? null : ( json_decode( $json, true )['id'] ?? null );
        return is_int( $id ) && $id > 0
            ? AuthenticationResponse::newPass( "官网用户-$id" )
            : AuthenticationResponse::newFail( $error );
    }

    public function testUserForCreation( $user, $autocreate, array $options = [] ) {
        if ( preg_match( '/\A官网用户-[0-9]+\z/', $user->getName() ) && $autocreate !== self::class ) {
            return StatusValue::newFatal( new RawMessage( '此用户名由官网登录系统分配。' ) );
        }
        return StatusValue::newGood();
    }

    public function testUserExists( $username, $flags = 0 ) {
        return false;
    }

    public function accountCreationType() {
        return self::TYPE_NONE;
    }

    public function beginPrimaryAccountCreation( $user, $creator, array $reqs ) {
        return AuthenticationResponse::newAbstain();
    }

    public function providerAllowsAuthenticationDataChange( AuthenticationRequest $req, $checkData = true ) {
        return StatusValue::newGood( 'ignored' );
    }

    public function providerChangeAuthenticationData( AuthenticationRequest $req ) {
    }
}
