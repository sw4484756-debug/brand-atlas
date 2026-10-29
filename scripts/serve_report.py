#!/usr/bin/env python3
"""Local report workspace: host assistant or optional DeepSeek/Gemini APIs."""
import argparse
import copy
import fcntl
import json
import mimetypes
import re
import secrets
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote

from render_report import render
from research_service import ResearchError, research_only, validate_operation, verify_result
from validate_report import ReportError, load_report, validate_report
from provider_api import initial_config, public_config, configure, research

class FileMutex:
    """Serialize the browser server and host completion helper (macOS/Linux)."""
    def __init__(self,path):
        self.path=path
        self.thread=threading.Lock()
    def __enter__(self):
        self.thread.acquire()
        self.file=self.path.open('a')
        fcntl.flock(self.file,fcntl.LOCK_EX)
    def __exit__(self,*args):
        fcntl.flock(self.file,fcntl.LOCK_UN)
        self.file.close()
        self.thread.release()

def merge_workspace(base, result, operation):
    workspace = copy.deepcopy(base.get('workspace', {}))
    ids = [b['id'] for b in result['brands']]
    dims = [d['id'] for d in result['dimensions']]
    if not workspace:
        workspace = dict(language='zh', x=dims[0], y=dims[1], selected=result['primaryId'], visible=ids,
                         palette='ocean', style='minimal', customDimensions=[], axisLabels={}, overrides={}, logos={}, colors={})
    changed = {d['id'] for d in operation.get('dimensions', [])}
    workspace['customDimensions'] = [d for d in workspace.get('customDimensions', []) if d['id'] not in dims]
    for id in changed:
        workspace.get('axisLabels', {}).pop(id, None)
        for values in workspace.get('overrides', {}).values():
            values.pop(id, None)
    old_ids = {b['id'] for b in base['brands']}
    workspace['visible'] = list(dict.fromkeys(workspace.get('visible', list(old_ids)) + [id for id in ids if id not in old_ids]))
    if operation['type'] == 'dimensions' and len(changed) == 1:
        new_id = next(iter(changed))
        if new_id not in {d['id'] for d in base['dimensions']}:
            workspace['x'] = new_id
    result['workspace'] = workspace
    validate_report(result)
    return result

class ReportApp:
    def __init__(self,path):
        self.path=Path(path).resolve()
        load_report(self.path)
        self.queue=self.path.parent/'.research'
        self.queue.mkdir(exist_ok=True)
        self.lock=FileMutex(self.queue/'queue.lock')
        self.token=secrets.token_urlsafe(32)
        self.config=initial_config()

    def status(self):
        pending=self.pending()
        active={k:pending[0][k] for k in ('id','status','stage')} if pending else None
        config=public_config(self.config)
        return {'token':self.token,'mode':'host' if config['provider']=='host' else 'api',
                'requiresKey':config['provider']!='host','activeJob':active,**config}

    def set_config(self,payload):
        with self.lock:
            if self.pending():raise ResearchError('busy')
            self.config=configure(self.config,payload)
            return public_config(self.config)

    def job_path(self,id):
        if not re.fullmatch('[a-f0-9]{32}',id):raise ResearchError('job_not_found')
        return self.queue/(id+'.json')

    def save_job(self,id,value):
        path=self.job_path(id);tmp=path.with_suffix('.tmp')
        tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(path)

    def pending(self):
        jobs=[]
        for file in sorted(self.queue.glob('*.json')):
            job=json.loads(file.read_text())
            if job['status'] in ('queued','running'):jobs.append(job)
        return jobs

    def start(self,payload):
        base,operation=payload.get('report'),payload.get('operation')
        validate_report(base);validate_operation(base,operation)
        with self.lock:
            current,_=load_report(self.path)
            if research_only(base)!=research_only(current):raise ResearchError('stale_report')
            if self.pending():raise ResearchError('busy')
            config=copy.deepcopy(self.config);engine=config['provider']
            settings=config['providers'].get(engine,{})
            if engine!='host' and not settings.get('key'):raise ResearchError('api_key_required')
            id=uuid.uuid4().hex
            self.save_job(id,{'id':id,'status':'queued','stage':'queued' if engine=='host' else 'api_queued',
                             'engine':engine,'operation':operation,'report':base})
        if engine!='host':threading.Thread(target=self.run_api,args=(id,base,operation,engine,settings),daemon=True).start()
        return {'id':id,'status':'queued'}

    def run_api(self,id,base,operation,engine,settings):
        def check():
            if self.job(id)['status'] not in ('queued','running'):raise ResearchError('cancelled')
        def stage(value):
            with self.lock:
                job=json.loads(self.job_path(id).read_text())
                if job['status'] not in ('queued','running'):raise ResearchError('cancelled')
                job.update(status='running',stage=value);self.save_job(id,job)
        try:
            result=research(base,operation,engine,settings,check=check,stage=stage)
            self.complete(id,result)
        except Exception as error:
            # Never persist raw provider errors or tracebacks with credentials.
            code=str(error) if isinstance(error,ResearchError) and re.fullmatch('[a-z_]+',str(error)) else 'validation_failed'
            with self.lock:
                job=json.loads(self.job_path(id).read_text())
                if job['status'] in ('queued','running'):
                    job.update(status='failed',stage='failed',error=code);self.save_job(id,job)

    def recover_api_jobs(self):
        with self.lock:
            for job in self.pending():
                if job.get('engine','host')!='host':
                    job.update(status='failed',stage='failed',error='server_restarted');self.save_job(job['id'],job)

    def job(self,id,cancel=False):
        with self.lock:
            path=self.job_path(id)
            if not path.exists():raise ResearchError('job_not_found')
            job=json.loads(path.read_text())
            if cancel and job['status'] in ('queued','running'):
                job.update(status='cancelled',stage='cancelled');self.save_job(id,job)
            visible={k:v for k,v in job.items() if k not in ('report','operation')}
            if job['status']=='complete':visible['report']=job['result']
            visible.pop('result',None)
            return visible

    def complete(self,id,result):
        with self.lock:
            path=self.job_path(id);job=json.loads(path.read_text())
            if job['status'] not in ('queued','running'):raise ResearchError('cancelled')
            current,_=load_report(self.path)
            if research_only(current)!=research_only(job['report']):raise ResearchError('stale_report')
            verify_result(job['report'],result,job['operation'])
            result=merge_workspace(job['report'],result,job['operation'])
            folder=self.path.parent/'history'/id;folder.mkdir(parents=True,exist_ok=True)
            candidate=folder/'report.json';candidate.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
            render(candidate,folder/'report.html',force=True)
            (folder/'previous.json').write_text(json.dumps(current,ensure_ascii=False,indent=2),encoding='utf-8')
            # A separate host helper may run concurrently with the server's cancel request.
            latest=json.loads(path.read_text())
            if latest['status'] not in ('queued','running'):raise ResearchError('cancelled')
            for suffix in ('.html','.md','.json'):
                target=self.path.with_suffix(suffix);temp=target.with_suffix(suffix+'.tmp')
                temp.write_bytes((folder/('report'+suffix)).read_bytes());temp.replace(target)
            job.update(status='complete',stage='complete',result=result);self.save_job(id,job)
            return result

    def update_job(self,id,status):
        with self.lock:
            path=self.job_path(id);job=json.loads(path.read_text())
            if job['status'] not in ('queued','running'):raise ResearchError('cancelled')
            job.update(status=status,stage='searching' if status=='running' else status)
            if status=='failed':job['error']='host_research_failed'
            self.save_job(id,job)
            return {'id':id,'status':status,'operation':job['operation'],'requestFile':str(path)}

def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def end_headers(self):
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            super().end_headers()

        def send_json(self, status, body):
            raw=json.dumps(body,ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Content-Length',str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def trusted(self, mutation=False):
            allowed = {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
            host=self.headers.get('Host','')
            origin=self.headers.get('Origin')
            if host not in allowed or (origin and origin != 'http://'+host):
                return False
            return not mutation or secrets.compare_digest(self.headers.get('X-Report-Token',''),app.token)

        def do_GET(self):
            if not self.trusted():
                return self.send_json(403, {'error':'forbidden'})
            path=urlsplit(self.path).path
            if path=='/api/status':
                return self.send_json(200,app.status())
            if path.startswith('/api/jobs/'):
                if not self.trusted(True):
                    return self.send_json(403,{'error':'forbidden'})
                try:
                    return self.send_json(200,app.job(path.rsplit('/',1)[-1]))
                except ResearchError:
                    return self.send_json(404,{'error':'job_not_found'})
            if path=='/': path='/'+app.path.with_suffix('.html').name
            file=(app.path.parent/unquote(path).lstrip('/')).resolve()
            # No directory listing, history, secrets, or filesystem traversal.
            if file.parent != app.path.parent or not file.is_file() or file.suffix not in ('.html','.json','.md','.png'):
                return self.send_json(404,{'error':'not_found'})
            raw=file.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type',(mimetypes.guess_type(file.name)[0] or 'application/octet-stream')+('' if file.suffix=='.png' else '; charset=utf-8'))
            self.send_header('Content-Length',str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_POST(self):
            if not self.trusted(True):
                return self.send_json(403,{'error':'forbidden'})
            if self.headers.get('Content-Type','').split(';')[0] != 'application/json':
                return self.send_json(415,{'error':'invalid_request'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0 < length <= 10_000_000:
                    return self.send_json(413,{'error':'request_too_large'})
                payload=json.loads(self.rfile.read(length))
                if not isinstance(payload,dict): raise ResearchError('invalid_request')
                path=urlsplit(self.path).path
                if path=='/api/research':
                    return self.send_json(202,app.start(payload))
                if path=='/api/config':
                    return self.send_json(200,app.set_config(payload))
                match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/cancel',path)
                if match:
                    return self.send_json(200,app.job(match[1],cancel=True))
                return self.send_json(404,{'error':'not_found'})
            except ResearchError as error:
                return self.send_json(409 if str(error) in ('busy','stale_report') else 400,{'error':str(error)})
            except (ValueError,TypeError,KeyError,ReportError,AttributeError):
                return self.send_json(400,{'error':'invalid_request'})
    return Handler

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report',type=Path)
    parser.add_argument('--port',type=int,default=8765)
    args=parser.parse_args()
    app=ReportApp(args.report)
    app.recover_api_jobs()
    render(app.path,app.path.with_suffix('.html'),force=True)
    server=ThreadingHTTPServer(('127.0.0.1',args.port),make_handler(app))
    print(f'Report: http://127.0.0.1:{args.port}/{app.path.with_suffix(".html").name}',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

if __name__=='__main__':
    main()
