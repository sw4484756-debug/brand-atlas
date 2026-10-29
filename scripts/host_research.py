#!/usr/bin/env python3
"""Read and complete the report's research requests using the current assistant."""
import argparse
import json
from pathlib import Path
from serve_report import ReportApp
from validate_report import load_report

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report',type=Path)
    sub=parser.add_subparsers(dest='action',required=True)
    sub.add_parser('pending')
    for name in ('claim','complete','fail'):
        command=sub.add_parser(name);command.add_argument('job_id')
        if name=='complete':command.add_argument('result',type=Path)
    args=parser.parse_args();app=ReportApp(args.report)
    if args.action=='pending':
        output=[{'id':j['id'],'status':j['status'],'operation':j['operation'],'requestFile':str(app.job_path(j['id']))} for j in app.pending() if j.get('engine','host')=='host']
    elif args.action=='complete':
        result,_=load_report(args.result)
        app.complete(args.job_id,result)
        output={'status':'complete','report':str(app.path.with_suffix('.html'))}
    else:output=app.update_job(args.job_id,'running' if args.action=='claim' else 'failed')
    print(json.dumps(output,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
