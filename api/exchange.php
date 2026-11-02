<?php
// Same-origin PHP gateway for existing PHP sites. The market still runs in Node.
require_once __DIR__ . '/bootstrap.php';
mms_cors();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Idempotency-Key, If-None-Match');
function exchange_error(int $status, string $code, string $message): void {
    http_response_code($status);
    echo json_encode(['ok'=>false,'code'=>$code,'error'=>$message], JSON_UNESCAPED_UNICODE); exit;
}
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') { http_response_code(204); exit; }
$route = $_GET['route'] ?? '';
if (!is_string($route) || !in_array($route, ['health','overview','state','leaderboard','join','order','cancel','margin'], true)) exchange_error(404,'NOT_FOUND','接口不存在');
if (($method !== 'GET' || !in_array($route,['health','overview','state','leaderboard'],true)) && ($method !== 'POST' || !in_array($route,['join','order','cancel','margin'],true))) exchange_error(405,'METHOD_NOT_ALLOWED','请求方式不受支持');
$port = filter_var(mms_env('MMS_EXCHANGE_PORT','8098'), FILTER_VALIDATE_INT, ['options'=>['min_range'=>1024,'max_range'=>65535]]);
if (!$port) exchange_error(503,'EXCHANGE_UNAVAILABLE','交易服务暂时不可用，请稍后重试');
$asset = $_GET['asset'] ?? '';
if (!is_string($asset) || strlen($asset)>40) exchange_error(400,'BAD_REQUEST','交易标的不正确');
$url = 'http://127.0.0.1:' . $port . '/api/exchange/' . $route . ($asset!==''?'?asset='.rawurlencode($asset):'');
$headers = ['Content-Type: application/json','Connection: close'];
foreach (['HTTP_AUTHORIZATION'=>'Authorization','HTTP_IDEMPOTENCY_KEY'=>'Idempotency-Key','HTTP_IF_NONE_MATCH'=>'If-None-Match','HTTP_ORIGIN'=>'Origin'] as $key=>$name) {
    $value = $_SERVER[$key] ?? ($key==='HTTP_AUTHORIZATION'?($_SERVER['REDIRECT_HTTP_AUTHORIZATION']??''):'');
    if (is_string($value) && $value!=='' && strlen($value)<=2048 && !preg_match('/[\r\n]/',$value)) $headers[]=$name.': '.$value;
}
$body = $method==='POST'?file_get_contents('php://input',false,null,0,8193):'';
if ($body===false || strlen($body)>8192) exchange_error(413,'BODY_TOO_LARGE','请求过大');
$context = stream_context_create(['http'=>['method'=>$method,'header'=>implode("\r\n",$headers),'content'=>$body,'timeout'=>12,'ignore_errors'=>true,'follow_location'=>0]]);
$stream = @fopen($url,'rb',false,$context);
if (!$stream) exchange_error(503,'EXCHANGE_UNAVAILABLE','交易服务暂未启动，请稍后重试');
$meta = stream_get_meta_data($stream); $status=502;
foreach (($meta['wrapper_data']??[]) as $line) {
    if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $line, $m)) $status=(int)$m[1];
    if (preg_match('/^(ETag):\s*(.+)$/i',$line,$m)) header($m[1].': '.$m[2]);
}
http_response_code($status);
fpassthru($stream); fclose($stream);
