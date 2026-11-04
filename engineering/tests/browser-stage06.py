import os, shutil
from playwright.sync_api import sync_playwright
from pathlib import Path
from PIL import Image
import io,json
root=Path(__file__).resolve().parents[1]
results=[];errors=[]
def check(label,condition):
    ok=condition() if callable(condition) else condition
    results.append({'name':label,'status':'PASS' if ok else 'FAIL'})
    print('PASS' if ok else 'FAIL',label,flush=True)
    assert ok,label
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path=(os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or None),args=['--no-sandbox','--disable-gpu'])
    ctx=b.new_context(viewport={'width':1480,'height':970},accept_downloads=True)
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content('<html lang="zh"><body><div id="root"></div></body></html>')
    page.add_script_tag(path=str(root/'tests/fake-idb.js'))
    page.add_style_tag(path=str(root/'offline/styles.css'))
    for f in ('vendor/react.js','vendor/react-dom.js','app.js'):page.add_script_tag(path=str(root/'offline'/f))
    page.get_by_role('heading',name='总览面板').wait_for(timeout=10000)
    page.wait_for_timeout(300)
    def nav(label):page.locator('.sidebar nav button').filter(has_text=label).click()
    check('V0.6 数据正常加载',lambda: page.locator('.metrics strong').first.inner_text()=='3')
    nav('图片证据')
    form=page.locator('form').first
    form.locator('select[name=runId]').select_option(index=0)
    form.locator('select[name=role]').select_option('input')
    raw=io.BytesIO();Image.new('RGB',(200,150),(84,147,161)).save(raw,format='PNG')
    form.locator('input[name=photo]').set_input_files({'name':'local-edit-test.png','mimeType':'image/png','buffer':raw.getvalue()})
    form.locator('input[name=note]').fill('V0.6 mock test, not user photo')
    form.get_by_role('button',name='保存图片证据').click()
    page.get_by_text('图片证据已保存至 IndexedDB',exact=False).wait_for(timeout=8000)
    check('上传图片显示',lambda:page.locator('.evidence-card img').count()==1)
    card=page.locator('.evidence-card').first
    card.locator('select[aria-label^="修改图片类型"]').select_option('output')
    page.get_by_text('图片类型已修改',exact=False).wait_for(timeout=5000)
    check('图片类型变更为AI输出',lambda:'AI 输出' in page.locator('.evidence-card').first.locator('small').inner_text())
    check('图片附件未删除重传',lambda:page.locator('.evidence-card img').count()==1)
    page.locator('.evidence-card').first.screenshot(path=str(root/'tests/AI_Quality_Lab_V0.6_图片证据类型编辑.png'))
    # New run of the same first case
    nav('执行记录')
    f=page.locator('form').first
    f.locator('select[name=testCaseId]').select_option(index=0)
    f.locator('input[name=tool]').fill('Functional test run')
    f.locator('input[name=promptVersion]').fill('retest-v06')
    f.locator('textarea[name=output]').fill('明确选择结果类型后，证据角色保存正确。')
    f.get_by_role('button',name='记录本次执行').click()
    page.get_by_text('已为测试用例新增执行记录',exact=False).wait_for(timeout=5000)
    nav('Bad Case')
    row=page.locator('tbody tr').first
    row.locator('select.status-select').select_option('ready_for_retest')
    page.get_by_text('问题状态已更新',exact=False).wait_for(timeout=5000)
    nav('复测记录')
    check('新增复测原因选择框',lambda:page.locator('select[name=resolution]').count()==1)
    form=page.locator('form').first
    form.locator('select[name=runId]').select_option(index=1) if form.locator('select[name=runId] option').count()>2 else form.locator('select[name=runId]').select_option(index=1)
    form.locator('textarea[name=notes]').fill('复核未复现，属于操作选择错误，未修复代码。')
    form.get_by_role('button',name='提交复测结果').click()
    page.get_by_text('复测通过时必须选择',exact=False).wait_for(timeout=5000)
    check('通过时强制选择原因',lambda:page.get_by_role('alert').count()==1)
    form.locator('select[name=resolution]').select_option('not_reproduced')
    form.get_by_role('button',name='提交复测结果').click()
    page.get_by_text('复测已记录；问题状态同步更新',exact=False).wait_for(timeout=5000)
    check('复测原因保留为未复现',lambda:'未能复现' in page.locator('.event').first.inner_text())
    page.locator('.panel').last.screenshot(path=str(root/'tests/AI_Quality_Lab_V0.6_复测结论预览.png'))
    nav('Bad Case')
    check('问题状态显示已关闭未复现',lambda:'已关闭 · 未能复现' in page.locator('tbody tr').first.inner_text())
    nav('报告中心')
    page.get_by_role('button',name='生成报告预览').click()
    page.get_by_text('报告已根据当前工作区生成',exact=False).wait_for(timeout=6000)
    report=page.locator('iframe.report-frame').get_attribute('srcdoc')
    check('报告明确保留未复现原因',lambda:'未能复现（未修改代码）' in report)
    nav('数据管理')
    with page.expect_download() as d:page.get_by_role('button',name='导出完整 JSON（兼容 V0.5 格式，含图片与校验码）').click()
    backed=json.loads(Path(d.value.path()).read_text())
    check('备份结构可向后兼容',lambda:backed['format']=='AIQL-BACKUP-0.5')
    check('图片类型元数据在备份已更新',lambda:backed['data']['evidence'][0]['role']=='output')
    check('图片字节未丢失',lambda:len(backed['files'])==1)
    check('复测原因在备份中保留',lambda:backed['data']['retests'][0]['resolution']=='not_reproduced')
    check('无浏览器脚本错误',lambda:len(errors)==0)
    page.screenshot(path=str(root/'tests/AI_Quality_Lab_V0.6_数据管理预览.png'),full_page=True)
    (root/'tests/browser-stage06-results.json').write_text(json.dumps({'environment':'Playwright with fake IndexedDB in-memory; user real-browser persistence verified separately in V0.5','results':results,'errors':errors},ensure_ascii=False,indent=2))
    print('SUMMARY',len(results),'passed')
    b.close()
