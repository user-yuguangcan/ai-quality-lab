import os, shutil
from playwright.sync_api import sync_playwright
from pathlib import Path
from PIL import Image
import json,io,base64,hashlib
root=Path(__file__).resolve().parents[1]
results=[];errors=[]
def check(name,fun):
 try:fun();results.append({'name':name,'status':'PASS'});print('PASS',name,flush=True)
 except Exception as e:results.append({'name':name,'status':'FAIL','details':str(e)[:900]});print('FAIL',name,str(e),flush=True);raise

def assert_true(value): assert value

def png_bytes(rgb=(92,148,135)):
 buf=io.BytesIO();Image.new('RGB',(360,260),rgb).save(buf,format='PNG');return buf.getvalue()

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=(os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or None),args=['--no-sandbox','--disable-gpu'])
 ctx=browser.new_context(viewport={'width':1480,'height':980},accept_downloads=True)
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<html lang="zh-CN"><body><div id="root"></div></body></html>')
 page.add_script_tag(path=str(root/'tests/fake-idb.js'))
 page.add_style_tag(path=str(root/'offline/styles.css'))
 for f in ['vendor/react.js','vendor/react-dom.js','app.js']:page.add_script_tag(path=str(root/'offline'/f))
 page.get_by_role('heading',name='总览面板').wait_for(timeout=8000)
 page.wait_for_timeout(200)
 def nav(name):page.locator('.sidebar nav button').filter(has_text=name).click()
 check('九个功能模块（新增报告中心）',lambda:assert_true(page.locator('.sidebar nav button').count()==9))
 nav('报告中心')
 page.get_by_role('heading',name='报告中心').wait_for(timeout=3000)
 check('默认未勾选原始图片（隐私保护）',lambda:assert_true(not page.locator('.report-images input[type=checkbox]').is_checked()))
 check('报告统计3条示例用例',lambda:assert_true(page.locator('.report-stats strong').first.inner_text()=='3'))
 page.get_by_role('button',name='生成报告预览').click()
 page.get_by_text('报告已根据当前工作区生成',exact=False).wait_for(timeout=6000)
 preview=page.locator('iframe.report-frame');preview.wait_for(timeout=3000)
 report_html=preview.get_attribute('srcdoc')
 check('报告预览已生成 HTML 文档',lambda:assert_true('<html lang="zh-CN">' in report_html))
 check('报告包括用例与异常描述',lambda:assert_true('异常问题与复测' in report_html and 'Bad Case' in report_html))
 check('未评分时不会虚构数据',lambda:assert_true('尚无人工评分' in report_html))
 check('报告样例不嵌入隐私图片',lambda:assert_true('本报告未包含图片原文件' in report_html))
 with page.expect_download() as d:page.get_by_role('button',name='下载独立 HTML').click()
 downloaded=Path(d.value.path()).read_text()
 check('报告HTML可以独立下载',lambda:assert_true('AI QUALITY LAB / ASSESSMENT REPORT' in downloaded))
 check('导出报告包含打印入口',lambda:assert_true('window.print()' in downloaded))
 # Change scope
 scope=page.get_by_label('报告范围');scope.select_option(index=1)
 check('单用例筛选影响统计',lambda:assert_true(page.locator('.report-stats strong').first.inner_text()=='1'))
 check('切换范围使旧报告失效',lambda:assert_true(page.locator('iframe.report-frame').count()==0))
 # Audit base workspace
 page.get_by_role('button',name='执行完整性检查').click()
 page.locator('.audit-result.passed').wait_for(timeout=5000)
 check('完整性审计初始状态通过',lambda:assert_true('检查通过' in page.locator('.audit-result').inner_text()))
 # Upload image evidence on first run
 nav('图片证据')
 form=page.locator('form').first
 form.locator('select[name=runId]').select_option(index=0)
 form.locator('select[name=role]').select_option('output')
 data=png_bytes()
 form.locator('input[name=photo]').set_input_files({'name':'test-output.png','mimeType':'image/png','buffer':data})
 form.locator('input[name=note]').fill('自动化上传测试：演示图像证据')
 form.get_by_role('button',name='保存图片证据').click()
 page.get_by_text('图片证据已保存至 IndexedDB',exact=False).wait_for(timeout=5000)
 check('报告前完成了图片上传',lambda:assert_true(page.locator('.evidence-card img').count()==1))
 nav('报告中心')
 page.get_by_label('报告范围').select_option('all')
 page.locator('.report-images input[type=checkbox]').check()
 page.get_by_role('button',name='生成报告预览').click()
 page.get_by_text('报告已根据当前工作区生成',exact=False).wait_for(timeout=5000)
 html_with_image=page.locator('iframe.report-frame').get_attribute('srcdoc')
 check('主动勾选后报告嵌入图片数据',lambda:assert_true('data:image/png;base64,' in html_with_image and 'test-output.png' in html_with_image))
 page.screenshot(path=str(root/'tests/AI_Quality_Lab_V0.5_报告中心预览.png'),full_page=True)
 # Test opened printed tab via click; popup may be blocked in restrictive environment, download already covers fallback
 try:
  with ctx.expect_page(timeout=2500) as pinfo:page.get_by_role('button',name='打开打印版 / PDF').click()
  pop=pinfo.value;pop.wait_for_load_state('domcontentloaded',timeout=4000)
  check('独立打印页能正常打开',lambda:assert_true('AI 输出质量评测报告' in pop.content()))
  pop.close()
 except Exception as e:results.append({'name':'独立打印页能正常打开','status':'UNVERIFIED','details':str(e)[:160]});print('UNVERIFIED print page')
 # data integrity and hash backup
 nav('数据管理')
 with page.expect_download() as d:page.get_by_role('button',name='导出 V0.5 完整 JSON（含图片、评分和校验码）').click()
 backup=json.loads(Path(d.value.path()).read_text())
 check('备份格式为V0.5',lambda:assert_true(backup['format']=='AIQL-BACKUP-0.5'))
 check('备份保留原始图片',lambda:assert_true(len(backup['files'])==1))
 source=base64.b64decode(backup['files'][0]['dataUrl'].split(',')[1])
 check('SHA256摘要与实际字节一致',lambda:assert_true(backup['files'][0]['sha256']==hashlib.sha256(source).hexdigest()))
 check('附件内容与上传字节一致',lambda:assert_true(source==data))
 # Preserve data on wrong digest after tamper: flip a single base64 digit, preserving total blob length
 broken=json.loads(json.dumps(backup,ensure_ascii=False))
 coded=broken['files'][0]['dataUrl']
 idx=coded.find(',')+1
 broken['files'][0]['dataUrl']=coded[:idx]+('A' if coded[idx]!='A' else 'B')+coded[idx+1:]
 page.once('dialog',lambda d:d.accept())
 page.locator('input[type=file]').set_input_files({'name':'tampered.json','mimeType':'application/json','buffer':json.dumps(broken,ensure_ascii=False).encode()})
 page.get_by_role('alert').wait_for(timeout=6000)
 check('篡改图片后完整备份导入被拒',lambda:assert_true('SHA-256' in page.get_by_role('alert').inner_text()))
 nav('图片证据')
 check('拒绝篡改后原有图片不丢失',lambda:assert_true(page.locator('.evidence-card img').count()==1))
 # compatibility V0.4, no SHA
 legacy=json.loads(json.dumps(backup,ensure_ascii=False));legacy['format']='AIQL-BACKUP-0.4'
 for item in legacy['files']:item.pop('sha256',None)
 nav('数据管理')
 page.once('dialog',lambda d:d.accept())
 page.locator('input[type=file]').set_input_files({'name':'legacy04.json','mimeType':'application/json','buffer':json.dumps(legacy,ensure_ascii=False).encode()})
 page.get_by_text('完整数据与图片已恢复',exact=False).wait_for(timeout=6000)
 nav('图片证据')
 check('兼容V0.4备份且图片保留',lambda:assert_true(page.locator('.evidence-card img').count()==1))
 # V0.5 restore
 nav('数据管理')
 page.once('dialog',lambda d:d.accept())
 page.locator('input[type=file]').set_input_files({'name':'backup05.json','mimeType':'application/json','buffer':json.dumps(backup,ensure_ascii=False).encode()})
 page.get_by_text('完整数据与图片已恢复',exact=False).wait_for(timeout=6000)
 nav('报告中心');page.get_by_role('button',name='执行完整性检查').click()
 page.locator('.audit-result.passed').wait_for(timeout=5000)
 check('V0.5恢复后的完整性检查通过',lambda:assert_true('检查通过' in page.locator('.audit-result').inner_text()))
 check('无脚本异常',lambda:assert_true(not errors))
 page.set_viewport_size({'width':390,'height':844})
 check('390px移动端无主体横向溢出',lambda:assert_true(page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+3')))
 page.screenshot(path=str(root/'tests/AI_Quality_Lab_V0.5_移动端预览.png'),full_page=True)
 (root/'tests/browser-stage04-results.json').write_text(json.dumps({'results':results,'pageErrors':errors,'environment':'Playwright page.set_content with memory IndexedDB mock (not real refresh persistence)'},ensure_ascii=False,indent=2))
 print('RESULT',sum(x['status']=='PASS' for x in results),'PASS of',len(results),'items; errors',errors)
 browser.close()
