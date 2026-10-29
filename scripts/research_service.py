"""Consistency checks for host-assistant research; no model APIs or credentials."""
import copy
import re
from validate_report import validate_report

class ResearchError(Exception):
    pass

def research_only(data):
    out=copy.deepcopy(data)
    out.pop('workspace',None);out.pop('renderedAt',None)
    return out

def validate_operation(base,operation):
    if not isinstance(operation,dict):raise ResearchError('invalid_request')
    if operation.get('type')=='dimensions':
        dims=operation.get('dimensions')
        if not isinstance(dims,list) or not 1<=len(dims)<=2:raise ResearchError('invalid_request')
        seen=set()
        for dim in dims:
            if not isinstance(dim,dict) or not re.fullmatch(r'[A-Za-z0-9_-]{1,50}',str(dim.get('id',''))):raise ResearchError('invalid_request')
            if dim['id'] in seen:raise ResearchError('invalid_request')
            seen.add(dim['id'])
            if not all(isinstance(dim.get(k),str) and 0<len(dim[k].strip())<=40 for k in ('name','low','high')) or dim['low']==dim['high']:raise ResearchError('invalid_request')
        if len({d['id'] for d in base['dimensions']}|seen)>12:raise ResearchError('dimension_limit')
    elif operation.get('type')=='competitors':
        if len(base['brands'])>=8:raise ResearchError('brand_limit')
        if not isinstance(operation.get('query'),str) or not 1<=len(operation['query'].strip())<=600:raise ResearchError('invalid_request')
        if operation.get('inputType') not in ('brand','traits','product'):raise ResearchError('invalid_request')
        if operation.get('country') and not re.fullmatch('[A-Z]{2}',operation['country']):raise ResearchError('invalid_request')
    else:raise ResearchError('invalid_request')

def verify_result(base,result,operation):
    validate_report(result)
    if 'en' not in result.get('translations',{}) or result['mode']!='live' or result['primaryId']!=base['primaryId']:raise ResearchError('invalid_result')
    before_b={b['id']:b for b in base['brands']};after_b={b['id']:b for b in result['brands']}
    before_d={d['id']:d for d in base['dimensions']};after_d={d['id']:d for d in result['dimensions']}
    requested={d['id']:d for d in operation.get('dimensions',[])}
    if not before_b.keys()<=after_b.keys() or not before_d.keys()<=after_d.keys():raise ResearchError('scope_changed')
    if any(after_b[id]['name']!=b['name'] for id,b in before_b.items()):raise ResearchError('scope_changed')
    if operation['type']=='dimensions':
        if after_b.keys()!=before_b.keys() or after_d.keys()!=before_d.keys()|requested.keys():raise ResearchError('scope_changed')
        for id,dim in requested.items():
            if any(after_d[id][k]!=dim[k] for k in ('name','low','high')):raise ResearchError('scope_changed')
    elif after_d!=before_d or not after_b.keys()-before_b.keys():raise ResearchError('no_new_competitors')
    for id,dim in before_d.items():
        if id not in requested and after_d[id]!=dim:raise ResearchError('scope_changed')
    for bid,b in before_b.items():
        for did,score in b['scores'].items():
            if did not in requested and after_b[bid]['scores'][did]!=score:raise ResearchError('unrelated_scores_changed')
    sources={s['id']:s for s in result['sources']}
    if any(sources.get(s['id'])!=s for s in base['sources']):raise ResearchError('old_sources_changed')
    return result
