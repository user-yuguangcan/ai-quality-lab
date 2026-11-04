import os, shutil
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, io, time
from PIL import Image
root=Path(__file__).resolve().parents[1]
results=[];errors=[]
def check(label,fun):
 try:
  fun();results.append({'name':label,'status':'PASS'});print('PASS',label,flush=True)
 except Exception as e:
  results.append({'name':label,'status':'FAIL','detail':str(e)[:500]});print('FAIL',label,str(e)[:500],flush=True);raise

def assert_true(expr):assert expr
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=(os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or None),args=['--no-sandbox','--disable-gpu'])
 ctx=b.new_context(viewport={'width':1440,'height':900},accept_downloads=True)
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<html lang="zh"><head></head><body><div id="root"></div></body></html>')
 page.add_script_tag(path=str(root/'tests/fake-idb.js'))
 page.add_style_tag(path=str(root/'offline/styles.css'))
 for f in ['vendor/react.js','vendor/react-dom.js','app.js']:page.add_script_tag(path=str(root/'offline'/f))
 page.get_by_role('heading',name='总览面板').wait_for(timeout=10000)
 page.wait_for_timeout(350)
 def nav(name):page.locator('.sidebar nav button').filter(has_text=name).click()
 check('左侧导航新增人工评测模块',lambda:assert_true(page.locator('.sidebar nav button').count()==8))
 check('三个历史案例无伪造评分',lambda:assert_true(page.locator('.metrics strong').first.inner_text()=='3'))
 nav('人工评测');page.get_by_role('heading',name='人工评测').wait_for(timeout=5000)
 check('评分规则默认4维度',lambda:assert_true(page.locator('.rubric-row').count()==4))
 check('历史人工评分初始为空',lambda:assert_true('尚无人工评分' in page.locator('.score-history').all_text_contents()[0] if page.locator('.score-history').count() else '目前尚无人工评分' in page.locator('body').inner_text()))
 # Start a run for the first test case
 original=page.locator('select[aria-label="评测执行记录"] option').first.get_attribute('value')
 # Score original version first
 evalForm=page.locator('form').filter(has=page.locator('input[name="runId"]')).first
 evalForm.locator('[name="evaluator"]').fill('演示评测人员')
 for ta in evalForm.locator('textarea[name^="rationale-"]').all():ta.fill('演示用人工评分：原始输出存在可见瑕疵，作为功能测试数据。')
 evalForm.locator('[name="summary"]').fill('演示基线：多项输出质量尚未满足人工验收条件。')
 evalForm.get_by_role('button',name='保存本次人工评分').click()
 page.get_by_text('人工评分已保存',exact=False).wait_for(timeout=4000)
 check('第一次人工评分保存成功',lambda:assert_true(page.locator('.score-history').count()==1))
 check('第一次评分显示3分',lambda:assert_true('3.00' in page.locator('.score-history').first.inner_text()))
 # Another execution same TestCase
 nav('执行记录')
 runForm=page.locator('form').first
 tcId=runForm.locator('[name=testCaseId] option').first.get_attribute('value')
 runForm.locator('[name=testCaseId]').select_option(tcId)
 runForm.locator('[name=tool]').fill('Demo Output Tool')
 runForm.locator('[name=promptVersion]').fill('v2-rerun')
 runForm.locator('[name=output]').fill('新版本处理后重复纹路有所减少，本条为模拟测试结果。')
 runForm.get_by_role('button',name='记录本次执行').click()
 page.get_by_text('已为测试用例新增执行记录',exact=False).wait_for(timeout=4000)
 check('同一用例新增第二次运行',lambda:assert_true(page.locator('tbody tr').count()==4))
 # attach image for side-by-side card
 nav('图片证据')
 proof=page.locator('form').first
 proof.locator('select[name=runId]').select_option(index=0)
 proof.locator('select[name=role]').select_option('output')
 def pic(color):
  buf=io.BytesIO();Image.new('RGB',(320,180),color).save(buf,format='PNG');return buf.getvalue()
 proof.locator('input[name=photo]').set_input_files({'name':'v2_demo.png','mimeType':'image/png','buffer':pic((95,163,161))})
 proof.locator('input[name=note]').fill('模拟v2输出截图，仅测试上传功能')
 proof.get_by_role('button',name='保存图片证据').click()
 page.get_by_text('图片证据已保存至 IndexedDB',exact=False).wait_for(timeout=5000)
 check('新版本关联图片证据',lambda:assert_true(page.locator('.evidence-card img').count()==1))
 nav('人工评测')
 # newly added run should be first; select
 evalSelect=page.locator('select[aria-label="评测执行记录"]')
 runV2=evalSelect.locator('option').first.get_attribute('value')
 assert runV2!=original
 evalSelect.select_option(runV2)
 evalForm=page.locator('form').filter(has=page.locator('input[name="runId"]')).first
 evalForm.locator('[name="evaluator"]').fill('演示评测人员')
 for item in evalForm.locator('select[name^="score-"]').all():item.select_option('5')
 for ta in evalForm.locator('textarea[name^="rationale-"]').all():ta.fill('模拟评测：对比截图，新的示例版本达到了指定标准。')
 evalForm.locator('[name="summary"]').fill('演示数据：v2 的4项指标全部人工标为5分，仅用于测试交互。')
 evalForm.get_by_role('button',name='保存本次人工评分').click()
 page.get_by_text('人工评分已保存',exact=False).wait_for(timeout=5000)
 check('两个评分保留历史',lambda:assert_true(page.locator('.score-history').count()==2))
 check('新版本评分为5.00',lambda:assert_true('5.00' in page.locator('.score-history').first.inner_text()))
 check('两个版本按维度展示',lambda:assert_true(page.locator('.score-comparison-table tbody tr').count()==4))
 check('比较结果使用相同评分口径',lambda:assert_true('相同评分口径' in page.locator('.compare-insight').inner_text()))
 check('版本卡片关联已上传图片',lambda:assert_true(page.locator('.compare-version .compare-thumbnails img').count()==1))
 page.screenshot(path=str(root/'tests/AI_Quality_Lab_V0.4_评分对比预览.png'),full_page=True)
 # add custom rubric dimension and adjust weights
 formRubric=page.locator('form').filter(has=page.locator('input[name^="label-"]')).first
 formRubric.locator('input[name^="weight-"]').first.fill('45')
 formRubric.get_by_role('button',name='保存评分规则').click()
 page.get_by_text('评分规则已保存',exact=False).wait_for(timeout=5000)
 check('评分规则权重修改成功',lambda:assert_true(page.locator('form input[name^="weight-"]').first.input_value()=='45'))
 check('既有两条评分保留原口径',lambda:assert_true('相同评分口径' in page.locator('.compare-insight').inner_text()))
 addForm=page.locator('form.add-dimension')
 addForm.locator('input[name=label]').fill('图像局部一致性')
 addForm.locator('input[name=weight]').fill('10')
 addForm.locator('input[name=guidance]').fill('检查局部编辑范围')
 addForm.get_by_role('button',name='＋ 新增维度').click()
 page.get_by_text('已增加评分维度',exact=False).wait_for(timeout=5000)
 check('自定义第五维度新增成功',lambda:assert_true(page.locator('.rubric-row').count()==5))
 # re-evaluate version v2 under new rubric => mismatch
 evalSelect=page.locator('select[aria-label="评测执行记录"]');evalSelect.select_option(runV2)
 evalForm=page.locator('form').filter(has=page.locator('input[name="runId"]')).first
 evalForm.locator('[name="evaluator"]').fill('演示评测人员')
 for select in evalForm.locator('select[name^="score-"]').all():select.select_option('4')
 for ta in evalForm.locator('textarea[name^="rationale-"]').all():ta.fill('按照更新后的新评分维度重新检查，记录独立依据。')
 evalForm.locator('[name="summary"]').fill('测试新的口径，不得与之前的不同权重评分直接作优劣比较。')
 evalForm.get_by_role('button',name='保存本次人工评分').click()
 page.get_by_text('人工评分已保存',exact=False).wait_for(timeout=5000)
 check('新口径评分不覆盖旧记录',lambda:assert_true(page.locator('.score-history').count()==3))
 check('不同评分口径触发警告',lambda:assert_true('维度或权重不一致' in page.locator('.compare-insight').inner_text()))
 nav('数据管理')
 with page.expect_download() as dl:page.get_by_role('button',name='导出 V0.4 完整 JSON（含图片及评分）').click()
 backup=json.loads(Path(dl.value.path()).read_text())
 check('V0.4 完整备份包含评分数据',lambda:assert_true(backup['format']=='AIQL-BACKUP-0.4' and len(backup['data']['scorecards'])==3 and len(backup['data']['rubric'])==5))
 check('V0.4 完整备份包含图片',lambda:assert_true(len(backup['files'])==1 and backup['files'][0]['dataUrl'].startswith('data:image/png;base64,')))
 # V0.4 restore
 page.once('dialog',lambda d:d.accept())
 page.locator('input[type=file]').set_input_files({'name':'backup-v04.json','mimeType':'application/json','buffer':json.dumps(backup,ensure_ascii=False).encode('utf-8')})
 page.get_by_text('完整数据与图片已恢复',exact=False).wait_for(timeout=5000)
 nav('人工评测')
 check('备份恢复后的历史评分未丢失',lambda:assert_true(page.locator('.score-history').count()==3))
 nav('图片证据')
 check('备份恢复后的图片未丢失',lambda:assert_true(page.locator('.evidence-card img').count()==1))
 # negative imported data should preserve existing
 nav('数据管理')
 broken=json.loads(json.dumps(backup));broken['data']['scorecards'][0]['ratings'][0]['score']=7
 page.once('dialog',lambda d:d.accept())
 page.locator('input[type=file]').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(broken,ensure_ascii=False).encode('utf-8')})
 page.get_by_role('alert').wait_for(timeout=3000)
 check('非法评分备份拒绝导入',lambda:assert_true('导入未完成' in page.locator('[role=alert]').inner_text()))
 nav('人工评测')
 check('非法备份导入不破坏现有记录',lambda:assert_true(page.locator('.score-history').count()==3))
 check('无未处理页面错误',lambda:assert_true(len(errors)==0))
 page.set_viewport_size({'width':390,'height':844})
 check('390px移动端无整体横向溢出',lambda:assert_true(page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+3')))
 page.screenshot(path=str(root/'tests/AI_Quality_Lab_V0.4_手机预览.png'),full_page=True)
 (root/'tests/browser-stage03-results.json').write_text(json.dumps({'results':results,'uncaughtErrors':errors,'environment':'Playwright set_content + memory IndexedDB mock; NOT real persistence'},ensure_ascii=False,indent=2))
 print('TOTAL',len(results),'passed',sum(x['status']=='PASS' for x in results),'PAGE ERRORS',errors)
 b.close()
