import unittest, json, hmac, hashlib
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
spec=spec_from_file_location('studybase_setup',Path(__file__).resolve().parents[1]/'setup.py')
module=module_from_spec(spec);spec.loader.exec_module(module)
build_manifest,verify_proof,encode,decode=module.build_manifest,module.verify_proof,module.encode,module.decode

class SetupTests(unittest.TestCase):
    def test_manifest_is_private_and_requests_only_content_permissions(self):
        m=build_manifest('https://admin.example.test','nonce')
        self.assertFalse(m['public'])
        self.assertEqual(m['default_permissions'],{'contents':'write','metadata':'read'})
        self.assertEqual(m['callback_urls'],['https://admin.example.test/auth/github/callback'])
        self.assertFalse(m['hook_attributes']['active'])
        self.assertFalse(m['request_oauth_on_install'])

    def test_local_confirmation_is_signed_and_bound_to_owner_repository_and_nonce(self):
        master=encode(bytes([7])*32)
        body={'iss':'https://admin.example.test','aud':'studybase-local-setup','sub':'103800312','login':'riex71','repository':1397071826,'nonce':'one-time','canWrite':True,'exp':1100}
        def sign(value):
            head=encode(json.dumps({'alg':'HS256'}).encode());payload=encode(json.dumps(value).encode());key=hmac.new(decode(master),b'studybase-local-setup-proof-v1',hashlib.sha256).digest()
            return head+'.'+payload+'.'+encode(hmac.new(key,(head+'.'+payload).encode(),hashlib.sha256).digest())
        self.assertTrue(verify_proof(sign(body),master,'https://admin.example.test','one-time',1000)['canWrite'])
        for change in [{'sub':'attacker'},{'repository':1},{'nonce':'other'},{'exp':900},{'exp':9999},{'canWrite':False},{'aud':'other'}]:
            with self.assertRaises(ValueError):verify_proof(sign({**body,**change}),master,'https://admin.example.test','one-time',1000)
        with self.assertRaises(ValueError):verify_proof(sign(body)[:-2]+'aa',master,'https://admin.example.test','one-time',1000)

if __name__=='__main__':unittest.main()
