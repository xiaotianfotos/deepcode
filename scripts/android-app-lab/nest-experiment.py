#!/usr/bin/env python3
"""Coordinate four real tablet DeepCode sessions; never execute their app code on Ubuntu."""
import argparse, json, pathlib, sys, time, uuid
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/lib'))
from dsh_device import Device

OUT = ROOT / 'docs/validation/2026-09-11-pad-nest'
WORK = '/storage/emulated/0/work/deepcode-nest-20260911'
SKILL = '/data/user/0/com.dsharnessmobile.shell/files/home/.dsh/codex-android/home/skills/android-app-dev'
JOBS = [
    ('tool', '小窝 · Qwen 实用工具', 'local-qwen', 'qwen38-flash-next'),
    ('gpu', '小窝 · Qwen 3D 实验', 'local-qwen', 'qwen38-flash-next'),
    ('pelican', '小窝 · Qwen 鹈鹕骑车', 'local-qwen', 'qwen38-flash-next'),
    ('icons', '小窝 · GPT 图标工坊', 'relay-codex', 'gpt-6-astra'),
]
COMMON = f'''这是用户授权的真实平板开发实验，你运行在小米平板 DeepCode 中。共享根目录 {WORK}，其他3个会话也以此为cwd。你必须亲自通过工具编写、在本机ARM64 Debian编译安卓APK，不让电脑或其他模型代写。先读取 {SKILL}/SKILL.md，你可用宿主Termux python执行 {SKILL}/scripts/app.py。模型叫Qwen38，保持当前模型，不调用GPT、不启动子Agent。
只写分配给你的应用子目录，不修改其他目录、DeepCode本体或全局配置。不要读私人文件/账号/照片。原生Java+Activity/View，minSdk26 target34，匿名类监听器不用lambda。程序所有资源/逻辑离线运行。build helper支持src与res，不会打包assets；需要assets时自行在项目中写一个构建扩展，不修改全局helper。优先只用Java/res避免依赖下载。
GPT专门生成3张图标，稍后会放到 icons/tool.png icons/gpu.png icons/pelican.png，你不画图标、不调用生图。暂时Manifest可不引用图标；收到后再接入。现在完成代码、构建、自检文档即可；暂时不要install/launch操作屏幕，协调者稍后依次通知安装，避免同时抢前台。
在你的子目录写 brief.json (name,package,purpose) 和 README.md，记录真实完成/未验证点。尽早写brief供图标会话查看。保留build.log。至少实现一个有意义的self_test intent验证正常逻辑并通过AndroidAppDev标签日志报告，不能只硬编码PASS。需要构建时可直接用app.py build --project 绝对子目录；若Debian占用错误稍后重试，不终止其他任务。完成后回复源码路径/APK路径/下一步验收动作。
'''
SPEC = {
 'tool': '''你的目录tool，包名com.deepcode.nest.tool。先通过允许的pm应用包列表和公共设备功能判断一个适合本机、值得补充的小工具，不查看私人内容；选择一个能在本轮完成、有实际用途、精美适配横竖屏和触摸的原生小应用。比如给创作者用的拍摄节奏/分段计时/素材规划类工具，具体由你决定。不要只是计数器或静态卡片；至少一个可交互工作流、有重置和持久化状态。不要申请敏感权限，不删改媒体。自测应验证核心状态变更与持久化读写。''',
 'gpu': '''你的目录gpu，包名com.deepcode.nest.gpu，名称“星环3D实验”。使用原生GLSurfaceView+OpenGL ES 3.0做漂亮的真实3D星环/几何实例场景，实际GPU绘制、深度测试、透视相机、动态光照/颜色、触摸旋转。至少低/中/高3档负载（实例数/分辨率/着色复杂度），可开始固定30秒测试、停止、显示真实帧间隔统计FPS/平均帧时/P95帧时、GL_VENDOR/GL_RENDERER。不要伪造GPU利用率或凭FPS声称综合GPU跑分。不使用Canvas2D冒充3D。负载默认低，主动退出/暂停停止渲染计时。shader编译/链接必须检查日志，提供self_test模式，至少实际画出若干帧无GL错误才记录PASS并报告renderer。3D表现要酷炫，兼顾文字可读。''',
 'pelican': '''你的目录pelican，包名com.deepcode.nest.pelican，名称“鹈鹕骑车”。做真正可玩的原生安卓小游戏：侧视鹈鹕骑自行车，车轮转动、蹬腿动画、路面滚动、触摸跳跃避障/拾取小鱼、有得分/失败/重新开始。明亮海边插画风，形状绘制可以Canvas，鹈鹕长嘴喉囊和自行车必须辨识清晰。支持横竖屏，不依赖远程网页。触摸按钮足够大。提供可重复self_test验证跳跃重力落地、障碍碰撞、得分、重开；记录真实断言结果。暂停后停止动画循环。'''
}

def prompts():
    values = {k: COMMON + '\n' + SPEC[k] for k in SPEC}
    values['icons'] = f'''你是本次平板DeepCode实验的专职图标设计师。用户明确要求GPT6只做各应用图标，你只负责这件事，绝不编写/修改应用Java、Manifest、构建逻辑，也不要安装应用或控制桌面。cwd共享根目录 {WORK}，三个Qwen会话正在tool、gpu、pelican三个子目录写应用。先读本机imagegen SKILL.md，使用你真实可用的内置image_gen工具逐个生成3张不同应用图标（不要改走API/CLI，不索取API key）。
三个图标：1.tool：供创作者使用的小工具，可读取tool/brief.json了解具体用途，尚未出现就先做另两张；2.gpu：星环3D实验，发光青紫星环围绕立体几何核心；3.pelican：鹈鹕骑车，可爱白色长嘴鹈鹕骑薄荷绿自行车、珊瑚橙点缀。统一高质感、有辨识度，方形主体居中、留足Android自适应图标裁切安全区、不要文字，优先真透明前景。分别调用生图，不拼成一张九宫格。
实际查看每张产物并将原图复制到 {WORK}/icons/tool.png、gpu.png、pelican.png，同时写icons/prompts.md和icons/manifest.json（真实来源、对应应用、尺寸/透明度如可验证）。这些目录仅你写，Qwen只读。图标一张完成即落盘，全部完成后回复位置。不自行扩展到其他任务。'''
    return values

def main():
    p=argparse.ArgumentParser();p.add_argument('serial');p.add_argument('action',choices=['init','start','status','send']);p.add_argument('--job');p.add_argument('--prompt');p.add_argument('--mode',choices=['queue','steer'],default='queue');a=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    d=Device(a.serial)
    try:
        assert d.shell('getprop','ro.product.device')=='yingtian'
        assert not d.exists('files/.snapshot-transaction')
        d.authenticate(timeout=15)
        if a.action=='init':
            assert not (OUT/'sessions.json').exists(), 'Existing experiment; reuse its sessions'
            assert d.command('shell','test','-e',WORK,check=False).returncode != 0, 'Preserve existing workspace'
            d.shell('mkdir','-p',WORK)
            default=next(n for n in d.rpc('settings/describe',{})['namespaces'] if n['ns']=='agent-default-model')
            sessions=[]
            try:
                for key,title,provider,model in JOBS:
                    sid=d.rpc('session/create',{'request':{'cwd':WORK,'agentPreset':'standard'}})['sessionId']
                    sessions.append(dict(key=key,title=title,id=sid,provider=provider,model=model,workspace=WORK))
                    (OUT/'sessions.json').write_text(json.dumps(sessions,ensure_ascii=False,indent=2))
                    d.rpc('session/rename',{'request':{'sessionId':sid,'title':title}})
                    d.rpc('commands/execute',{'agentId':sid,'line':'/permission danger-full-access','images':[]})
                    req={'sessionId':sid,'provider':provider,'model':model}
                    if provider=='relay-codex': req['reasoningEffort']='medium'
                    d.rpc('session/selectModel',{'request':req})
            finally:
                now=next(n for n in d.rpc('settings/describe',{})['namespaces'] if n['ns']=='agent-default-model')
                d.rpc('settings/replace',{'ns':'agent-default-model','section':default.get('user',{}),'expectedRevision':now['revision']})
            for key,prompt in prompts().items(): (OUT/(key+'-prompt.txt')).write_text(prompt)
            print(json.dumps(sessions,ensure_ascii=False));return
        sessions=json.loads((OUT/'sessions.json').read_text())
        if a.action in ('start','send'):
            for item in sessions:
                if a.job and a.job!=item['key']:continue
                path=pathlib.Path(a.prompt) if a.prompt else OUT/(item['key']+'-prompt.txt')
                d.rpc('session/prompt',{'request':{'sessionId':item['id'],'requestId':uuid.uuid4().hex,'mode':a.mode,'content':[{'type':'text','text':path.read_text()}]}})
                print('Started',item['key'],item['id'])
        if a.action=='status':
            listed={i['sessionId']:i for i in d.rpc('session/list',{'_request':{}})['items']}
            for item in sessions:
                rows=d.session_records(item['id'])
                (OUT/(item['key']+'-events.json')).write_text(json.dumps(rows,ensure_ascii=False,indent=2))
                texts=[b.get('text','') for r in rows if r.get('event',{}).get('type')=='assistant/message' for b in r['event']['data']['message']['content'] if b.get('type')=='text']
                recent=[r.get('event',{}).get('type') for r in rows[-4:]]
                print(json.dumps({'job':item['key'],'running':listed[item['id']].get('running'),'recent':recent,'message':texts[-1][-600:] if texts else ''},ensure_ascii=False))
    finally:d.close()

if __name__=='__main__':main()
