"""Regressions for the exposed database, credentials and unsafe archive inclusions."""
import importlib.util,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
policy=load('policy','public-files.py');scan=load('scanner','security-scan.py')
class PublicationTests(unittest.TestCase):
    def test_private_paths_are_excluded(self):
        for name in ['data/site.db','data/site.db-wal','data/auth_rate.json','data/bot_token.json','api/llm-config.php','apps/android/app/src/main/assets/www.zip','.env','.git/config','.agents/skills/test/SKILL.md','scripts/build-manifest.php','toy-build/baka.zip','images/../api/llm-config.php','var/private/site.db','zyms/studio.js']:
            self.assertFalse(policy.public_file(name),name)
        self.assertFalse(policy.public_file('unregistered-private-draft.html'))
    def test_public_paths_are_included(self):
        for name in ['index.html','tools.html','nav.js','quiz-heartprint.html','data/heartprint-db.js','data/waifu-db-all-zh.js','data/waifu-db-male-zh.js','data/waifu-tags-v2.json','data/waifu-db-zh.js','images/logo.png','js/catalog.js','unity/tuoluo/index.html','unity/tuoluo/Build/file.wasm','zyms/DREAMCORE __ 旧核·梦核·怪核图片滤镜实验室.html']:
            self.assertTrue(policy.public_file(name),name)
    def test_credentials_are_redacted(self):
        secret='a'*32+'.'+'b'*16
        findings=scan.scan_text("'api_key' => '"+secret+"'",'config.php')
        self.assertTrue(findings);self.assertNotIn(secret,str(findings))
        for name in ['BOT_APP_SECRET','apiKey','client_secret','SMTP_PASSWORD']:
            self.assertTrue(scan.scan_text(name+" = '"+'x'*24+"'",'config.js'),name)
    def test_environment_references_are_safe(self):
        self.assertFalse(scan.scan_text("'api_key' => mms_env('MMS_ZHIPU_API_KEY')",'config.php'))
    def test_no_bot_in_current_source(self):
        self.assertFalse((ROOT/'api/bot.php').exists());self.assertFalse((ROOT/'api/bot_token.php').exists())
    def test_manifest_never_contains_private_data(self):
        for p in policy.public_paths():self.assertTrue(policy.public_file(p.relative_to(ROOT)))
if __name__=='__main__':unittest.main()
