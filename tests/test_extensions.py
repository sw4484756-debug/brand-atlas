import copy
import json
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from validate_report import validate_report, translated_report, ReportError
class Extensions(unittest.TestCase):
    def setUp(self):self.data=json.loads((ROOT/'examples/demo.json').read_text())
    def test_live_bilingual_sample_valid(self):validate_report(self.data)
    def test_translation_cannot_change_score_or_url(self):
        for field in ['score','url']:
            d=copy.deepcopy(self.data)
            if field=='score':d['translations']['en']['brands'][0]['scores']['digital']['value']=99
            else:d['translations']['en']['sources'][0]['url']='https://example.org'
            with self.assertRaises(ReportError):validate_report(d)
    def test_translation_cannot_skip_sections(self):
        del self.data['translations']['en']['limitations']
        with self.assertRaises(ReportError):validate_report(self.data)
    def test_localized_copy_preserves_facts(self):
        en=translated_report(self.data)
        self.assertEqual(en['brands'][0]['scores']['digital']['value'],90)
        self.assertNotEqual(en['summary'],self.data['summary'])
        self.assertEqual(en['sources'][0]['url'],self.data['sources'][0]['url'])
    def test_unknown_profile_sources_rejected(self):
        self.data['brands'][0]['profileSourceIds']=['fake']
        with self.assertRaises(ReportError):validate_report(self.data)
    def test_workspace_keeps_research_and_accepts_null(self):
        self.data['workspace']={'language':'zh','x':'experience','y':'digital','selected':'starbucks','visible':['starbucks'],'palette':'sage','style':'dark','overrides':{'starbucks':{'digital':None}}}
        validate_report(self.data)
        self.assertEqual(self.data['brands'][0]['scores']['digital']['value'],90)
    def test_workspace_rejects_bad_manual_score(self):
        self.data['workspace']={'language':'zh','x':'experience','y':'digital','selected':'starbucks','visible':['starbucks'],'palette':'sage','style':'dark','overrides':{'starbucks':{'digital':101}}}
        with self.assertRaises(ReportError):validate_report(self.data)
if __name__=='__main__':unittest.main()
