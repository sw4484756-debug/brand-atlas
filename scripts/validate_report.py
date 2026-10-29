#!/usr/bin/env python3
"""Validate Brand Positioning report data. Python 3.9+, standard library only."""
import argparse
import base64
import copy
import ipaddress
import json
import math
import re
import sys
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlsplit

class ReportError(ValueError):
    pass

def public_url(value):
    if not isinstance(value, str) or any(ord(c) < 32 for c in value):
        return False
    try:
        u = urlsplit(value)
        if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password:
            return False
        host = u.hostname.lower().rstrip('.')
        if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')) or '.' not in host:
            return False
        try:
            if not ipaddress.ip_address(host).is_global:
                return False
        except ValueError:
            pass
        _ = u.port
        return True
    except (ValueError, TypeError):
        return False

def validate_report(data):
    errors, warnings = [], []
    def fail(path, message):
        errors.append(f'{path}: {message}')
    def text(v, path, optional=False, limit=6000):
        if not isinstance(v, str) or (not optional and not v.strip()) or (isinstance(v, str) and len(v) > limit):
            fail(path, f'must be a {"possibly empty " if optional else "nonempty "}string of at most {limit} characters')
            return False
        return True
    def array(v, path, minimum=0, maximum=150):
        if not isinstance(v, list) or not minimum <= len(v) <= maximum:
            fail(path, f'must be an array with {minimum}–{maximum} items')
            return []
        return v
    def identifier(v, path):
        if not isinstance(v, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,50}', v) or v in ('__proto__','constructor','prototype'):
            fail(path, 'must be a 1–50 character ASCII identifier')
            return None
        return v
    def timestamp(v, path, full=False):
        try:
            if not isinstance(v, str):
                raise ValueError()
            if full or 'T' in v:
                parsed = datetime.fromisoformat(v.replace('Z', '+00:00'))
                if parsed.tzinfo is None:
                    raise ValueError()
            else:
                date.fromisoformat(v)
        except (ValueError, TypeError):
            fail(path, 'must be an ISO date or timezone-aware timestamp' if not full else 'must be a timezone-aware ISO timestamp')
    if not isinstance(data, dict):
        raise ReportError('Report must be a JSON object')
    if type(data.get('version')) is not int or data.get('version') != 1:
        fail('version', 'must be 1')
    for key in ('title', 'category', 'market', 'summary'):
        text(data.get(key), key, limit=6000 if key == 'summary' else 200)
    timestamp(data.get('generatedAt'), 'generatedAt', full=True)
    mode = data.get('mode')
    if mode not in ('live', 'supplied', 'illustrative'):
        fail('mode', 'must be live, supplied or illustrative')
    dims = array(data.get('dimensions'), 'dimensions', 2, 12)
    brands = array(data.get('brands'), 'brands', 2, 8)
    sources = array(data.get('sources'), 'sources', 0, 150)
    dim_ids, brand_ids, source_ids, names = set(), set(), set(), set()
    for i, d in enumerate(dims):
        p = f'dimensions[{i}]'
        if not isinstance(d, dict):
            fail(p, 'must be an object'); continue
        ident = identifier(d.get('id'), p+'.id')
        if ident in dim_ids:
            fail(p+'.id', 'duplicate dimension ID')
        if ident:
            dim_ids.add(ident)
        for key in ('name','low','high','rubric'):
            text(d.get(key), p+'.'+key, limit=1500 if key=='rubric' else 40)
        if d.get('low') == d.get('high'):
            fail(p, 'low and high endpoints must differ')
    for i, s in enumerate(sources):
        p = f'sources[{i}]'
        if not isinstance(s, dict):
            fail(p, 'must be an object'); continue
        ident = identifier(s.get('id'), p+'.id')
        if ident in source_ids:
            fail(p+'.id', 'duplicate source ID')
        if ident:
            source_ids.add(ident)
        text(s.get('title'), p+'.title', limit=500)
        text(s.get('evidence'), p+'.evidence', limit=2000)
        timestamp(s.get('accessedAt'), p+'.accessedAt')
        if s.get('publishedAt') is not None:
            timestamp(s['publishedAt'], p+'.publishedAt')
        if s.get('url') is None:
            text(s.get('locator'), p+'.locator', limit=500)
            if mode == 'live':
                fail(p+'.url', 'live reports require a public web URL')
        elif not public_url(s['url']):
            fail(p+'.url', 'must be a public HTTP(S) URL without credentials')
    used_sources = set()
    def refs(value, path):
        ids = array(value, path, 0, 150)
        for ident in ids:
            if not isinstance(ident, str) or ident not in source_ids:
                fail(path, f'unknown source ID {ident!r}')
            else:
                used_sources.add(ident)
        return ids
    for i, b in enumerate(brands):
        p = f'brands[{i}]'
        if not isinstance(b, dict):
            fail(p, 'must be an object'); continue
        ident = identifier(b.get('id'), p+'.id')
        if ident in brand_ids:
            fail(p+'.id', 'duplicate brand ID')
        if ident:
            brand_ids.add(ident)
        for key in ('name','positioning','audience'):
            text(b.get(key), p+'.'+key, limit=60 if key=='name' else 1500)
        name = b.get('name')
        if isinstance(name, str):
            if name.strip().casefold() in names:
                fail(p+'.name', 'duplicate brand name')
            names.add(name.strip().casefold())
        website = b.get('website')
        if website != '' and not public_url(website):
            fail(p+'.website', 'must be empty or a public HTTP(S) URL')
        for j, s in enumerate(array(b.get('strengths'), p+'.strengths', 0, 8)):
            text(s, f'{p}.strengths[{j}]', limit=200)
        if 'country' in b and (not isinstance(b['country'],str) or not re.fullmatch('[A-Z]{2}',b['country'])):
            fail(p+'.country','must be a two-letter country code for the observed market')
        for key in ('aliases','products','traits','tags'):
            if key in b:
                for j, value in enumerate(array(b[key],p+'.'+key,0,30)):
                    text(value,f'{p}.{key}[{j}]',limit=100)
        if 'improvement' in b:
            text(b['improvement'],p+'.improvement',limit=2000)
        if 'profileSourceIds' in b:
            refs(b['profileSourceIds'],p+'.profileSourceIds')
        scores = b.get('scores')
        if not isinstance(scores, dict):
            fail(p+'.scores', 'must be an object'); continue
        if set(scores) != dim_ids:
            fail(p+'.scores', 'must contain exactly all declared dimension IDs')
        for did, score in scores.items():
            sp = p+'.scores.'+did
            if not isinstance(score, dict):
                fail(sp,'must be an object'); continue
            v = score.get('value')
            if 'value' not in score:
                fail(sp+'.value','required; use null for unknown')
            elif v is not None and (type(v) not in (int,float) or not math.isfinite(v) or not 0 <= v <= 100):
                fail(sp+'.value','must be a finite number 0–100 or null')
            conf, basis = score.get('confidence'), score.get('basis')
            if conf not in ('high','medium','low'):
                fail(sp+'.confidence','invalid confidence')
            if basis not in ('measured','assessed','unknown'):
                fail(sp+'.basis','invalid score basis')
            if v is None and (conf != 'low' or basis != 'unknown'):
                fail(sp,'null scores require low confidence and unknown basis')
            if v is not None and basis == 'unknown':
                fail(sp+'.basis','numeric scores cannot have unknown basis')
            text(score.get('rationale'), sp+'.rationale', limit=2500)
            ids = refs(score.get('sourceIds'), sp+'.sourceIds')
            if v is not None and not ids and mode != 'illustrative':
                fail(sp+'.sourceIds','numeric scores require evidence; use null if unsupported')
            if v is None:
                warnings.append(f'{b.get("name", ident)} / {did}: no score; excluded from projections using this dimension')
    primary = data.get('primaryId')
    if not isinstance(primary,str) or primary not in brand_ids:
        fail('primaryId','must identify an existing brand')
    refs(data.get('summarySourceIds'), 'summarySourceIds')
    for i, o in enumerate(array(data.get('opportunities'),'opportunities',1,6)):
        p = f'opportunities[{i}]'
        if not isinstance(o, dict):
            fail(p,'must be an object'); continue
        for key in ('title','detail','action'):
            text(o.get(key), p+'.'+key, limit=200 if key=='title' else 3000)
        refs(o.get('sourceIds'), p+'.sourceIds')
    for i, limitation in enumerate(array(data.get('limitations'),'limitations',1,15)):
        text(limitation,f'limitations[{i}]',limit=2000)
    if mode == 'illustrative':
        warnings.append('Illustrative data: not a factual market study; report and PNG carry a visible example label.')
    if source_ids - used_sources:
        warnings.append('Some sources are not cited by a score, summary or opportunity: '+', '.join(sorted(source_ids-used_sources)))
    if not errors and 'translations' in data:
        translations=data['translations']
        if not isinstance(translations,dict) or set(translations)!={'en'}:
            fail('translations','must contain a complete en translation')
        else:
            try:
                translated=translated_report(data,'en')
                validate_report(translated)
            except (ReportError,KeyError,TypeError,AttributeError) as exc:
                fail('translations.en',str(exc))
    if not errors and 'workspace' in data:
        try:
            validate_workspace(data['workspace'],data)
        except (ReportError,TypeError,ValueError,AttributeError) as exc:
            fail('workspace',str(exc))
    if errors:
        raise ReportError('\n'.join(errors))
    return warnings


def translated_report(data, language='en'):
    """Only allow translated text, never changed facts, IDs, URLs or citations."""
    out=copy.deepcopy(data)
    out.pop('translations',None);out.pop('workspace',None)
    tr=data['translations'][language]
    root_keys={'title','category','market','summary','limitations','dimensions','brands','sources','opportunities'}
    if not isinstance(tr,dict) or set(tr)!=root_keys:
        raise ReportError('all narrative sections must be translated')
    for key in ('title','category','market','summary','limitations'):
        out[key]=tr[key]
    if not isinstance(tr['limitations'],list) or len(tr['limitations'])!=len(data['limitations']):
        raise ReportError('limitations must match the original count')
    allowed={'dimensions':{'id','name','low','high','rubric'},'sources':{'id','title','evidence'},'opportunities':{'title','detail','action'}}
    for section in ('dimensions','brands','sources','opportunities'):
        rows=tr[section]
        if not isinstance(rows,list) or len(rows)!=len(data[section]):
            raise ReportError(section+' must match original items')
        for i,(base,row) in enumerate(zip(data[section],rows)):
            fields=allowed.get(section)
            if section=='brands':
                fields={'id','name','positioning','audience','strengths','scores'}|({k for k in ('products','traits','improvement') if k in base})
            if not isinstance(row,dict) or set(row)!=fields:
                raise ReportError(section+' has missing text or forbidden factual fields')
            if section!='opportunities' and row['id']!=base['id']:
                raise ReportError(section+' IDs/order must match originals')
            if section=='brands':
                if set(row['scores'])!=set(base['scores']):
                    raise ReportError('translated scores must match dimensions')
                for did,score in row['scores'].items():
                    if not isinstance(score,dict) or set(score)!={'rationale'}:
                        raise ReportError('translations may only change score rationale')
                patched=copy.deepcopy(row)
                patched['scores']={did:{**score,**row['scores'][did]} for did,score in base['scores'].items()}
                out[section][i].update(patched)
            else:
                out[section][i].update(row)
    return out

def validate_workspace(w,data):
    """Validate portable manual scenarios; original scores stay untouched."""
    def require(test,message):
        if not test:raise ReportError(message)
    def label(v):return isinstance(v,str) and bool(v.strip()) and len(v)<=40
    require(isinstance(w,dict),'must be an object')
    require(set(w)<=set('language x y selected visible palette style customDimensions axisLabels overrides logos colors'.split()),'unknown workspace fields')
    ids={b['id'] for b in data['brands']};dims={d['id'] for d in data['dimensions']}
    custom=w.get('customDimensions',[])
    require(isinstance(custom,list) and len(custom)+len(dims)<=12,'too many custom dimensions')
    for d in custom:
        require(isinstance(d,dict) and isinstance(d.get('id'),str) and re.fullmatch(r'custom_[A-Za-z0-9_-]{1,40}',d['id']) and d['id'] not in dims,'invalid custom dimension ID')
        require(all(label(d.get(k)) for k in ('name','low','high')) and d['low']!=d['high'],'invalid dimension labels')
        require(isinstance(d.get('rubric'),str) and 0<len(d['rubric'])<=1500,'invalid custom rubric')
        dims.add(d['id'])
    require(w.get('x') in dims and w.get('y') in dims and w['x']!=w['y'],'invalid axes')
    require(w.get('language') in ('zh','en'),'invalid language')
    require(w.get('palette') in ('sage','ocean','berry','mono'),'invalid palette')
    require(w.get('style') in ('quadrant','minimal','dark'),'invalid style')
    require(w.get('selected') in ids,'invalid selected brand')
    visible=w.get('visible');require(isinstance(visible,list) and all(isinstance(v,str) and v in ids for v in visible) and data['primaryId'] in visible and len(visible)==len(set(visible)),'invalid visible brands')
    for did,p in w.get('axisLabels',{}).items():
        require(did in dims and isinstance(p,dict) and set(p)=={'name','low','high'} and all(label(v) for v in p.values()) and p['low']!=p['high'],'invalid axis labels')
    for bid,values in w.get('overrides',{}).items():
        require(bid in ids and isinstance(values,dict),'invalid override brand')
        for did,v in values.items():
            require(did in dims and (v is None or type(v) in (int,float) and math.isfinite(v) and 0<=v<=100),'invalid manual coordinate')
    for bid,c in w.get('colors',{}).items():
        require(bid in ids and isinstance(c,str) and re.fullmatch(r'#[a-fA-F0-9]{6}',c),'invalid point color')
    for bid,img in w.get('logos',{}).items():
        require(bid in ids and isinstance(img,str) and len(img)<=500000 and img.startswith('data:image/png;base64,'),'invalid logo')
        try:decoded=base64.b64decode(img.split(',',1)[1],validate=True)
        except ValueError:raise ReportError('invalid PNG base64')
        require(decoded.startswith(b'\x89PNG\r\n\x1a\n'),'logo must be PNG data')


def load_report(path):
    p = Path(path)
    if p.stat().st_size > 10_000_000:
        raise ReportError('Input exceeds the 10 MB report limit')
    def reject_constant(value):
        raise ReportError(f'Non-standard JSON constant: {value}')
    data = json.loads(p.read_text(encoding='utf-8'), parse_constant=reject_constant)
    return data, validate_report(data)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path)
    args=parser.parse_args()
    try:
        _, warnings=load_report(args.input)
    except (ReportError,ValueError,OSError) as e:
        print('INVALID\n'+str(e),file=sys.stderr)
        return 1
    for w in warnings:
        print('WARNING: '+w,file=sys.stderr)
    print('VALID')
    return 0
if __name__=='__main__':
    sys.exit(main())
