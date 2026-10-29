import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from provider_api import configure,initial_config,public_config,research,ResearchError,verify_evidence,model_text,NoRedirect
from serve_report import ReportApp
from test_research import fixture,dimension_result

class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.base=fixture();self.result,self.op=dimension_result(self.base)
        self.result=json.loads(json.dumps(self.result).replace('"NEW"','"API1"'))
        self.calls=[]
    def deepseek(self,url,body,headers):
        self.calls.append((url,body,headers))
        if url.endswith('/v1/tools/search'):
            return {'results':[{'url':'https://example.org/evidence','title':'Test evidence','content':'Synthetic test content, not a research finding.'}]}
        return {'choices':[{'finish_reason':'stop','message':{'content':json.dumps(self.result)}}]}
    def gemini(self,url,body,headers):
        self.calls.append((url,body,headers))
        if body.get('tools'):
            return {'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'Synthetic test memo.'}]},'groundingMetadata':{'webSearchQueries':['test query'],'groundingChunks':[{'web':{'uri':'https://example.org/evidence','title':'Test evidence'}}],'groundingSupports':[{'segment':{'text':'Synthetic evidence.'},'groundingChunkIndices':[0]}],'searchEntryPoint':{'renderedContent':'<p>Test attribution</p>'}}}]}
        return {'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps(self.result)}]}}]}
    def test_deepseek_retrieval_precedes_synthesis_and_preserves_unrelated_scores(self):
        r=research(self.base,self.op,'deepseek',{'key':'test-key','model':'deepseek-flash'},transport=self.deepseek)
        self.assertEqual(r['brands'][0]['scores']['digital'],self.base['brands'][0]['scores']['digital'])
        self.assertTrue(self.calls[-1][0].endswith('/chat/completions'))
        self.assertIn('https://example.org/evidence',self.calls[-1][1]['messages'][-1]['content'])
        self.assertNotIn('test-key',self.calls[-1][1]['messages'][-1]['content'])
    def test_gemini_grounding_and_attribution_survive_completion(self):
        r=research(self.base,self.op,'gemini',{'key':'test-key','model':'gemini-3.8-flash'},transport=self.gemini)
        self.assertEqual(len(self.calls),2)
        self.assertEqual(self.calls[0][1]['tools'],[{'google_search':{}}])
        self.assertEqual(r['researchAttribution'][0]['renderedContent'],'<p>Test attribution</p>')
    def test_workspace_logos_and_manual_coordinates_not_sent(self):
        self.base['workspace']={'logos':{'starbucks':'private-logo-data'},'overrides':{'starbucks':{'experience':7}}}
        research(self.base,self.op,'deepseek',{'key':'test-key','model':'deepseek-flash'},transport=self.deepseek)
        sent=json.dumps([body for _,body,_ in self.calls])
        self.assertNotIn('private-logo-data',sent)
        prompt=self.calls[-1][1]['messages'][-1]['content']
        original=json.loads(prompt.split('BASE REPORT:\n')[1].split('\nRETRIEVED EVIDENCE:')[0])
        self.assertNotIn('workspace',original)
    def test_no_grounding_is_failure_not_model_knowledge_fallback(self):
        def no_search(*args):return {'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'Answer without search'}]}}]}
        with self.assertRaisesRegex(ResearchError,'search_unavailable'):
            research(self.base,self.op,'gemini',{'key':'test-key','model':'gemini-3.8-flash'},transport=no_search)
    def test_empty_search_does_not_synthesize(self):
        with self.assertRaisesRegex(ResearchError,'search_unavailable'):
            research(self.base,self.op,'deepseek',{'key':'test-key','model':'deepseek-flash'},transport=lambda *a:{'results':[]})
    def test_invented_url_is_rejected(self):
        self.result['sources'][-1]['url']='https://invented.example/evidence'
        with self.assertRaisesRegex(ResearchError,'unverified_sources'):
            research(self.base,self.op,'deepseek',{'key':'test-key','model':'deepseek-flash'},transport=self.deepseek)
    def test_rescored_values_require_new_retrieved_citation(self):
        self.result['brands'][0]['scores'][self.op['dimensions'][0]['id']]['sourceIds']=[self.base['sources'][0]['id']]
        with self.assertRaisesRegex(ResearchError,'unverified_sources'):
            research(self.base,self.op,'deepseek',{'key':'test-key','model':'deepseek-flash'},transport=self.deepseek)
    def test_unrelated_scores_cannot_change(self):
        self.result['brands'][0]['scores']['digital']['value']=20
        with self.assertRaisesRegex(ResearchError,'unrelated_scores_changed'):
            research(self.base,self.op,'deepseek',{'key':'test-key','model':'deepseek-flash'},transport=self.deepseek)
    def test_truncated_response_rejected(self):
        with self.assertRaisesRegex(ResearchError,'incomplete_provider_response'):
            model_text({'choices':[{'finish_reason':'length','message':{'content':'{}'}}]},'deepseek')
    def test_cancel_stops_before_network(self):
        def cancel():raise ResearchError('cancelled')
        with self.assertRaisesRegex(ResearchError,'cancelled'):
            research(self.base,self.op,'deepseek',{'key':'test-key','model':'deepseek-flash'},check=cancel,transport=self.deepseek)
        self.assertFalse(self.calls)
    def test_redirects_never_forward_api_credentials(self):
        self.assertIsNone(NoRedirect().redirect_request(None,None,302,'Found',{},'https://other.example'))

class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'report.json';self.base=fixture()
        self.path.write_text(json.dumps(self.base));self.app=ReportApp(self.path)
        self.result,self.op=dimension_result(self.base)
    def tearDown(self):self.temp.cleanup()
    def test_credentials_only_in_memory_not_status_or_files(self):
        self.app.set_config({'provider':'deepseek','apiKey':'test-secret','model':'deepseek-flash'})
        self.assertTrue(self.app.status()['providers']['deepseek']['configured'])
        self.assertNotIn('test-secret',json.dumps(self.app.status()))
        self.assertTrue(all('test-secret' not in p.read_text() for p in self.path.parent.rglob('*') if p.is_file()))
    def test_empty_key_preserves_existing_and_clear_removes_it(self):
        config=configure(initial_config(),{'provider':'gemini','apiKey':'test-key'})
        config=configure(config,{'provider':'gemini','apiKey':''})
        self.assertEqual(config['providers']['gemini']['key'],'test-key')
        config=configure(config,{'provider':'gemini','clearKey':True})
        self.assertFalse(config['providers']['gemini']['key'])
    def test_missing_key_rejects_before_creating_job(self):
        self.app.set_config({'provider':'gemini','clearKey':True})
        with self.assertRaisesRegex(ResearchError,'api_key_required'):self.app.start({'report':self.base,'operation':self.op})
        self.assertEqual(self.app.pending(),[])
    def test_invalid_model_and_header_characters_rejected(self):
        for payload in ({'provider':'gemini','model':'../other?key=x'},{'provider':'deepseek','apiKey':'x\nHeader: value'}):
            with self.assertRaises(ResearchError):self.app.set_config(payload)
    def test_api_worker_failure_preserves_existing_report(self):
        self.app.set_config({'provider':'deepseek','apiKey':'test-key'})
        with patch('serve_report.threading.Thread'):
            id=self.app.start({'report':self.base,'operation':self.op})['id']
        before=self.path.read_bytes()
        with patch('serve_report.research',side_effect=ResearchError('search_unavailable')):
            self.app.run_api(id,self.base,self.op,'deepseek',{'key':'test-key'})
        self.assertEqual(self.app.job(id)['status'],'failed');self.assertEqual(before,self.path.read_bytes())
        self.assertNotIn('test-key',self.app.job_path(id).read_text())
    def test_api_worker_success_commits_valid_report(self):
        self.app.set_config({'provider':'gemini','apiKey':'test-key'})
        with patch('serve_report.threading.Thread'):
            id=self.app.start({'report':self.base,'operation':self.op})['id']
        with patch('serve_report.research',return_value=self.result):
            self.app.run_api(id,self.base,self.op,'gemini',{'key':'test-key'})
        self.assertEqual(self.app.job(id)['status'],'complete')
        self.assertEqual(json.loads(self.path.read_text())['dimensions'],self.result['dimensions'])
        self.assertTrue(self.path.with_suffix('.html').is_file())
    def test_server_restart_fails_api_but_keeps_host_queue(self):
        host=self.app.start({'report':self.base,'operation':self.op})['id'];self.app.recover_api_jobs()
        self.assertEqual(self.app.job(host)['status'],'queued')
        self.app.job(host,cancel=True);self.app.set_config({'provider':'gemini','apiKey':'test-key'})
        with patch('serve_report.threading.Thread'):id=self.app.start({'report':self.base,'operation':self.op})['id']
        self.app.recover_api_jobs();self.assertEqual(self.app.job(id)['error'],'server_restarted')
    def test_cancel_blocks_api_completion(self):
        self.app.set_config({'provider':'deepseek','apiKey':'test-key'})
        with patch('serve_report.threading.Thread'):id=self.app.start({'report':self.base,'operation':self.op})['id']
        self.app.job(id,cancel=True)
        with patch('serve_report.research',return_value=self.result):self.app.run_api(id,self.base,self.op,'deepseek',{'key':'test-key'})
        self.assertEqual(self.app.job(id)['status'],'cancelled')
        self.assertEqual(json.loads(self.path.read_text()),self.base)

if __name__=='__main__':unittest.main()
