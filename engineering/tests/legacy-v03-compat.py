from pathlib import Path
import json, io
from PIL import Image
import os, shutil
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
import subprocess
store=json.loads(subprocess.check_output(['node','-e',"const d=require('./tests/build/domain.cjs');const s=d.demoStore();s.schemaVersion='1.1';delete s.rubric;delete s.scorecards;console.log(JSON.stringify(s))"],cwd=root,text=True))
b=io.BytesIO();Image.new('RGB',(8,8),(100,150,180)).save(b,format='PNG');blob=b.getvalue();import base64
meta={'id':'IMG-v03-backward','runId':store['runs'][0]['id'],'role':'output','fileName':'legacy-fixture.png','mime':'image/png','size':len(blob),'note':'V0.3兼容性模拟附件','createdAt':'2026-11-02T00:00:00.000Z'}
store['evidence']=[meta]
backup={'format':'AIQL-BACKUP-0.3','exportedAt':'2026-11-02T00:00:00.000Z','data':store,'files':[{'id':meta['id'],'mime':'image/png','dataUrl':'data:image/png;base64,'+base64.b64encode(blob).decode()}]}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=(os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or None),args=['--no-sandbox'])
 page=b.new_page(accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<html><head></head><body><div id="root"></div></body></html>')
 page.add_script_tag(path=str(root/'tests/fake-idb.js'));page.add_style_tag(path=str(root/'offline/styles.css'))
 for x in ['vendor/react.js','vendor/react-dom.js','app.js']:page.add_script_tag(path=str(root/'offline'/x))
 page.get_by_role('heading',name='总览面板').wait_for(timeout=10000)
 page.locator('.sidebar nav button').filter(has_text='数据管理').click()
 page.once('dialog',lambda x:x.accept())
 page.locator('input[type=file]').set_input_files({'name':'legacy-v03.json','mimeType':'application/json','buffer':json.dumps(backup,ensure_ascii=False).encode()})
 page.get_by_text('完整数据与图片已恢复',exact=False).wait_for(timeout=5000)
 page.locator('.sidebar nav button').filter(has_text='图片证据').click()
 page.locator('.evidence-card img').first.wait_for(timeout=5000)
 assert page.locator('.evidence-card img').count()==1
 page.locator('.sidebar nav button').filter(has_text='人工评测').click()
 assert page.locator('.rubric-row').count()==4
 assert page.locator('.score-history').count()==0
 page.locator('.sidebar nav button').filter(has_text='数据管理').click()
 with page.expect_download() as dl:page.get_by_role('button',name='导出 V0.4 完整 JSON（含图片及评分）').click()
 exported=json.loads(Path(dl.value.path()).read_text())
 assert exported['format']=='AIQL-BACKUP-0.4'
 assert exported['data']['schemaVersion']=='1.2'
 assert len(exported['data']['evidence'])==1
 assert len(exported['files'])==1
 assert len(exported['data']['scorecards'])==0
 assert len(exported['data']['rubric'])==4
 assert errors==[],errors
 print('PASS V0.3 complete backup + picture restores in V0.4; safely upgrades schema and retains attachment, no invented scores')
 b.close()
