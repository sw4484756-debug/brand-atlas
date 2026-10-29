import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from research_service import ResearchError, validate_operation, verify_result, research_only
from serve_report import ReportApp, merge_workspace
from render_report import render

def fixture():
    return json.loads((ROOT/'examples/demo.json').read_text())

def dimension_result(base):
    result=copy.deepcopy(base)
    result.pop('workspace',None)
    result['dimensions'][0]['name']='新维度'
    op={'type':'dimensions','dimensions':[{k:result['dimensions'][0][k] for k in ('id','name','low','high')}]}
    source={'id':'NEW','title':'Test-only evidence','url':'https://example.org/evidence','accessedAt':'2026-10-29','publishedAt':None,'evidence':'Synthetic test evidence.'}
    result['sources'].append(source)
    result['translations']['en']['sources'].append({'id':'NEW','title':'Test-only evidence','evidence':'Synthetic test evidence.'})
    result['translations']['en']['dimensions'][0]['name']='New dimension'
    for b in result['brands']:
        b['scores'][result['dimensions'][0]['id']]={'value':60,'rationale':'Test only','confidence':'low','basis':'assessed','sourceIds':['NEW']}
    return result,op

class ResearchTests(unittest.TestCase):
    def setUp(self):
        self.base=fixture()
        self.result,self.op=dimension_result(self.base)
        self.urls={'https://example.org/evidence'}

    def test_verified_new_dimension_preserves_unrelated_scores(self):
        verify_result(self.base,self.result,self.op)

    def test_rejects_unrelated_score_changes(self):
        self.result['brands'][0]['scores']['digital']['value']=25
        with self.assertRaisesRegex(ResearchError,'unrelated_scores_changed'):
            verify_result(self.base,self.result,self.op)

    def test_rejects_silent_brand_removal(self):
        self.result['brands'].pop();self.result['translations']['en']['brands'].pop()
        with self.assertRaisesRegex(ResearchError,'scope_changed'):
            verify_result(self.base,self.result,self.op)

    def test_unknown_score_can_remain_null(self):
        self.result['brands'][0]['scores'][self.result['dimensions'][0]['id']]={'value':None,'basis':'unknown','confidence':'low','rationale':'Insufficient evidence','sourceIds':[]}
        verify_result(self.base,self.result,self.op)

    def test_competitor_operation_requires_new_brand(self):
        with self.assertRaisesRegex(ResearchError,'no_new_competitors'):
            verify_result(self.base,self.base,{'type':'competitors','query':'new','inputType':'brand'})

    def test_new_competitor_scored_without_changing_existing_data(self):
        result=copy.deepcopy(self.base);result.pop('workspace',None)
        result['sources']=self.result['sources'];result['translations']['en']['sources']=self.result['translations']['en']['sources']
        b=copy.deepcopy(result['brands'][0]);b['id']='testbrand';b['name']='测试品牌'
        for score in b['scores'].values():score['sourceIds']=['NEW']
        result['brands'].append(b)
        b_en=copy.deepcopy(result['translations']['en']['brands'][0]);b_en.update(id='testbrand',name='Test brand');result['translations']['en']['brands'].append(b_en)
        verify_result(self.base,result,{'type':'competitors','query':'new','inputType':'brand'})

    def test_operation_rejects_equal_endpoints_and_bad_country(self):
        bad=copy.deepcopy(self.op);bad['dimensions'][0]['high']=bad['dimensions'][0]['low']
        for op in (bad,{'type':'competitors','query':'A','inputType':'brand','country':'China'}):
            with self.assertRaises(ResearchError):validate_operation(self.base,op)

    def test_workspace_rescoring_clears_only_affected_scenarios(self):
        self.base['workspace']={'language':'en','x':'experience','y':'digital','selected':'starbucks','visible':['starbucks'],'palette':'ocean','style':'minimal','overrides':{'starbucks':{'experience':10,'digital':30}},'colors':{'starbucks':'#123456'},'axisLabels':{'experience':{'name':'edit','low':'a','high':'b'}}}
        merged=merge_workspace(self.base,self.result,self.op)
        self.assertEqual(merged['workspace']['overrides']['starbucks'],{'digital':30})
        self.assertEqual(merged['workspace']['colors']['starbucks'],'#123456')
        self.assertEqual(merged['workspace']['axisLabels'],{})

class ServerStateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'report.json'
        self.base=fixture();self.path.write_text(json.dumps(self.base))
        render(self.path,self.path.with_suffix('.html'))
        self.app=ReportApp(self.path);self.result,self.op=dimension_result(self.base)
    def tearDown(self):self.temp.cleanup()
    def submit(self):return self.app.start({'report':self.base,'operation':self.op})['id']
    def test_status_requires_no_provider_credentials(self):
        status=self.app.status();self.assertEqual(status['mode'],'host');self.assertFalse(status['requiresKey'])
        self.assertTrue(all('key' not in p for p in status['providers'].values()))
    def test_queue_contains_exact_request_without_invented_result(self):
        id=self.submit();job=self.app.pending()[0]
        self.assertEqual(job['operation'],self.op);self.assertEqual(job['report'],self.base)
        self.assertEqual(self.app.job(id)['status'],'queued');self.assertNotIn('report',self.app.job(id))
    def test_no_duplicate_while_pending(self):
        self.submit()
        with self.assertRaisesRegex(ResearchError,'busy'):self.submit()
    def test_host_claim_is_visible_to_separate_server_instance(self):
        id=self.submit();other=ReportApp(self.path);other.update_job(id,'running')
        self.assertEqual(self.app.job(id)['stage'],'searching')
    def test_success_updates_disk_and_keeps_previous_revision(self):
        id=self.submit();self.app.complete(id,self.result)
        self.assertEqual(self.app.job(id)['status'],'complete')
        self.assertEqual(json.loads(self.path.read_text())['dimensions'][0]['name'],'新维度')
        self.assertTrue((self.path.parent/'history'/id/'previous.json').exists())
    def test_invalid_result_preserves_report_bytes(self):
        id=self.submit();before=self.path.read_bytes();self.result['brands'][0]['scores']['digital']['value']=23
        with self.assertRaises(ResearchError):self.app.complete(id,self.result)
        self.assertEqual(before,self.path.read_bytes());self.assertEqual(self.app.job(id)['status'],'queued')
    def test_cancellation_prevents_host_completion(self):
        id=self.submit();self.app.job(id,cancel=True)
        with self.assertRaisesRegex(ResearchError,'cancelled'):ReportApp(self.path).complete(id,self.result)
        self.assertEqual(research_only(json.loads(self.path.read_text())),research_only(self.base))
    def test_failed_host_job_is_visible_and_does_not_mutate(self):
        id=self.submit();before=self.path.read_bytes();self.app.update_job(id,'failed')
        self.assertEqual(self.app.job(id)['status'],'failed');self.assertEqual(before,self.path.read_bytes())
    def test_stale_request_cannot_replace_newer_report(self):
        id=self.submit();new=copy.deepcopy(self.base);new['summary']='Newer summary';self.path.write_text(json.dumps(new))
        with self.assertRaisesRegex(ResearchError,'stale_report'):self.app.complete(id,self.result)
    def test_job_path_traversal_is_rejected(self):
        with self.assertRaises(ResearchError):self.app.job_path('../report')

if __name__=='__main__':unittest.main()
