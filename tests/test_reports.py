import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from validate_report import ReportError, public_url, validate_report, load_report
from render_report import render

class Reports(unittest.TestCase):
    def setUp(self):
        self.data=json.loads((ROOT/'tests/fixtures/illustrative.json').read_text(encoding='utf-8'))
    def test_example_is_valid(self):
        self.assertGreaterEqual(len(validate_report(self.data)),1)
    def test_live_requires_evidence(self):
        self.data['mode']='live'
        with self.assertRaisesRegex(ReportError,'numeric scores require evidence'):
            validate_report(self.data)
    def test_null_preserved(self):
        self.assertIsNone(self.data['brands'][3]['scores']['innovation']['value'])
        validate_report(self.data)
    def test_invalid_numeric_types(self):
        for value in [True,'50',float('nan'),float('inf'),-1,101]:
            with self.subTest(value=value):
                d=copy.deepcopy(self.data);d['brands'][0]['scores']['price']['value']=value
                with self.assertRaises(ReportError):validate_report(d)
    def test_missing_dimension(self):
        del self.data['brands'][0]['scores']['design']
        with self.assertRaisesRegex(ReportError,'exactly all declared'):
            validate_report(self.data)
    def test_duplicate_brand(self):
        self.data['brands'][1]['id']='b0'
        with self.assertRaisesRegex(ReportError,'duplicate brand'):
            validate_report(self.data)
    def test_unknown_citation(self):
        self.data['brands'][0]['scores']['price']['sourceIds']=['invented']
        with self.assertRaisesRegex(ReportError,'unknown source'):
            validate_report(self.data)
    def test_unknown_scores_not_centered(self):
        s=self.data['brands'][3]['scores']['innovation'];s['value']=50
        with self.assertRaisesRegex(ReportError,'numeric scores cannot'):
            validate_report(self.data)
    def test_null_confidence(self):
        self.data['brands'][3]['scores']['innovation']['confidence']='high'
        with self.assertRaisesRegex(ReportError,'null scores require'):
            validate_report(self.data)
    def test_url_schemes_and_private_addresses(self):
        for value in ['javascript:alert(1)','file:///tmp/a','data:text/plain,hello','http://localhost/a','http://127.0.0.1','http://192.168.1.1','https://a:b@example.org','http://[::1]/','https://foo.local/','https://example.com\n/path']:
            with self.subTest(value=value):self.assertFalse(public_url(value))
        self.assertTrue(public_url('https://example.org/a?b=c#d'))
    def test_supplied_document_evidence(self):
        self.data['mode']='supplied';self.data['sources']=[{'id':'s1','title':'Supplied notes','url':None,'locator':'notes.md, section 1','accessedAt':'2026-10-28','publishedAt':None,'evidence':'Test supplied measurements.'}]
        for b in self.data['brands']:
            for s in b['scores'].values():
                if s['value'] is not None:s['sourceIds']=['s1']
        validate_report(self.data)
    def test_script_injection_encoded(self):
        text='</script><script>alert("x")</script> & <b>name</b>'
        self.data['summary']=text;self.data['title']='<script>alert(1)</script>'
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp);(p/'input.json').write_text(json.dumps(self.data),encoding='utf-8')
            render(p/'input.json',p/'report.html')
            html=(p/'report.html').read_text(encoding='utf-8')
            self.assertNotIn(text,html)
            self.assertIn('\\u003c/script\\u003e',html)
            self.assertIn('&lt;script&gt;alert(1)&lt;/script&gt;',html)
            self.assertNotIn('/*__REPORT_',html)
    def test_overwrite_is_explicit(self):
        with tempfile.TemporaryDirectory() as temp:
            out=Path(temp)/'report.html'
            render(ROOT/'tests/fixtures/illustrative.json',out)
            with self.assertRaisesRegex(ReportError,'already exists'):render(ROOT/'tests/fixtures/illustrative.json',out)
            render(ROOT/'tests/fixtures/illustrative.json',out,force=True)
    def test_bad_data_does_not_write_output(self):
        self.data['primaryId']='missing'
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp);(p/'input.json').write_text(json.dumps(self.data),encoding='utf-8')
            with self.assertRaises(ReportError):render(p/'input.json',p/'report.html')
            self.assertFalse((p/'report.html').exists())
    def test_research_date_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'report.html';render(ROOT/'tests/fixtures/illustrative.json',p)
            self.assertIn(self.data['generatedAt'],p.read_text(encoding='utf-8'))
    def test_source_unknown_type_rejected(self):
        self.data['sources']=[None]
        with self.assertRaises(ReportError):validate_report(self.data)
    def test_nan_json_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'data.json';p.write_text('{"a":NaN}',encoding='utf-8')
            with self.assertRaises(ReportError):load_report(p)
if __name__=='__main__':unittest.main()
