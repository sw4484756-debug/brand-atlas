#!/usr/bin/env python3
"""Build a standalone interactive HTML report and Markdown analysis, with no network calls."""
import argparse
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from validate_report import ReportError, load_report

ROOT = Path(__file__).resolve().parents[1]

def markdown(data):
    def cell(v):
        return str(v).replace('|', r'\|').replace('\n',' ')
    mode={'live':'公开资料研究','supplied':'用户提供资料','illustrative':'演示数据 · 非真实市场研究'}[data['mode']]
    lines=[f'# {data["title"]}', '', f'> {mode}', '', f'市场：{data["market"]}  |  品类：{data["category"]}  |  研究时间：{data["generatedAt"]}', '', '## 研究结论', '', data['summary'], '', '来源：'+(', '.join(data['summarySourceIds']) or '策略假设 / 示例'), '', '## 竞品矩阵', '', '| 品牌 | '+' | '.join(cell(d['name']) for d in data['dimensions'])+' |', '|---|'+'---|'*len(data['dimensions'])]
    for b in data['brands']:
        values=[str(b['scores'][d['id']]['value']) if b['scores'][d['id']]['value'] is not None else '资料不足' for d in data['dimensions']]
        lines.append('| '+cell(b['name'])+('（我的品牌）' if b['id']==data['primaryId'] else '')+' | '+' | '.join(values)+' |')
    for b in data['brands']:
        lines+=['',f'## {b["name"]}', '', b['positioning'], '', '目标人群：'+b['audience']]
        if b.get('strengths'):
            lines+=['','**竞争优势（研究推断）：**'+'；'.join(b['strengths'])]
        if b.get('improvement'):
            lines+=['','**改善方向（待验证）：**'+b['improvement'], '', '品牌分析来源：'+(', '.join(b.get('profileSourceIds',[])) or '提供资料 / 策略假设')]
        for d in data['dimensions']:
            s=b['scores'][d['id']]
            lines+=['', f'**{d["name"]}：{s["value"] if s["value"] is not None else "资料不足"}** · {s["basis"]} · confidence {s["confidence"]}', '', s['rationale'], '', '来源：'+(', '.join(s['sourceIds']) or '无；参见证据限制')]
    lines+=['','## 可验证的定位方向','']
    for o in data['opportunities']:
        lines += [f'### {o["title"]}', '', o['detail'], '', '**下一步：**'+o['action'], '', '来源：'+(', '.join(o['sourceIds']) or '策略假设 / 示例'), '']
    lines+=['## 方法与限制','']
    for d in data['dimensions']:
        lines += [f'- **{d["name"]}**（{d["low"]} → {d["high"]}）：{d["rubric"]}']
    lines+=['']+['- '+x for x in data['limitations']]+['', '## 来源', '']
    for s in data['sources']:
        target=s.get('url') or s.get('locator','')
        lines += [f'- [{s["id"]}] {s["title"]} — {target}（访问：{s["accessedAt"]}）', '  '+s['evidence']]
    return '\n'.join(lines)+'\n'

def render(input_path, output_path, force=False):
    data,warnings=load_report(input_path)
    output=Path(output_path)
    md=output.with_suffix('.md')
    if output.suffix.lower()!='.html':
        raise ReportError('Output must have an .html extension')
    if not force and (output.exists() or md.exists()):
        raise ReportError('Output already exists; choose a new filename or pass --force to replace it')
    data=dict(data)
    data['renderedAt']=datetime.now(timezone.utc).isoformat()
    encoded=json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
    template=(ROOT/'assets'/'report.html').read_text(encoding='utf-8')
    # Insert data last so user-authored placeholder-like text cannot affect assets.
    result=template.replace('/*__REPORT_CSS__*/',(ROOT/'assets'/'report.css').read_text(encoding='utf-8')).replace('/*__REPORT_JS__*/',(ROOT/'assets'/'report.js').read_text(encoding='utf-8')).replace('__REPORT_TITLE__',html.escape(data['title'])).replace('/*__REPORT_DATA__*/',encoded)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(result,encoding='utf-8')
    md.write_text(markdown(data),encoding='utf-8')
    return warnings

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path)
    parser.add_argument('--out',required=True,type=Path)
    parser.add_argument('--force',action='store_true',help='Replace existing HTML and Markdown output')
    args=parser.parse_args()
    try:
        warnings=render(args.input,args.out,args.force)
    except (ReportError,ValueError,OSError) as e:
        print(str(e),file=sys.stderr);return 1
    for warning in warnings:
        print('WARNING: '+warning,file=sys.stderr)
    print(json.dumps({'html':str(args.out.resolve()),'markdown':str(args.out.with_suffix('.md').resolve())},ensure_ascii=False))
    return 0
if __name__=='__main__':
    sys.exit(main())
