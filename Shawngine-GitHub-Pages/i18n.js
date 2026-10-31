'use strict';
(() => {
  const entries = [
    ['界面语言','Language'],['简体中文','Simplified Chinese'],['设置与备份','Settings & backup'],['切换主题','Switch theme'],
    ['深色模式','Dark mode'],['浅色模式','Light mode'],['涂鸦模式','Doodle mode'],['F1 模式','F1 mode'],['F1模式','F1 mode'],
    ['页面主题','Theme'],['页面动效','Motion effects'],['显示英文摘句','Show English quotes'],['摘句来源','Quote source'],
    ['在线随机 · DummyJSON','Online random · DummyJSON'],['本地精选 · 原著摘句','Curated literary quotes'],['英文歌词 · lyrics.ovh','English lyrics · lyrics.ovh'],
    ['其他主题也显示网速表','Show speedometer in other themes'],['导出备份','Export backup'],['导入备份','Import backup'],['完成','Done'],['取消','Cancel'],['确认','Confirm'],['请确认','Please confirm'],
    ['添加自定义链接','Add a custom link'],['添加链接','Add link'],['编辑链接','Edit link'],['删除链接','Delete link'],['删除','Delete'],['保存','Save'],
    ['链接名称','Link name'],['网站地址','Website address'],['例如：我的常用网站','e.g. My favorite website'],['example.com 或 https://…','example.com or https://…'],
    ['搜索内容','Search query'],['搜索','Search'],['清空搜索内容','Clear search'],['选择搜索引擎','Choose search engine'],['自定义快捷链接','Custom shortcuts'],['必应','Bing'],['百度','Baidu'],
    ['换一句英文摘句','Another English quote'],['换一句','Another quote'],['正在寻找一句话…','Finding a new line…'],['在线暂不可用 · 本地精选','Online unavailable · curated fallback'],
    ['涂鸦画布','Doodle canvas'],['涂鸦工具','Doodle tools'],['启用涂鸦','Enable drawing'],['停用涂鸦','Disable drawing'],['启用/停用涂鸦','Enable / disable drawing'],['清除涂鸦','Clear drawing'],['画笔颜色','Pen color'],['画笔大小','Pen size'],['保存涂鸦','Save drawing'],['调节背景模糊','Adjust background blur'],['背景模糊','Background blur'],
    ['下载采样网速表','Download speedometer'],['待测','Waiting'],['采样中','Sampling'],['已采样','Sampled'],['已暂停','Paused'],['离线','Offline'],['未完成','Incomplete'],['尚未采样','No sample yet'],['暂停采样','Pause'],['开始采样','Start'],['立即采样','Sample now'],
    ['本站下载采样 · 每15秒约0.5MB','Site download · ~0.5 MB every 15s'],['等待开始下载采样','Waiting for a download sample'],['已离线，恢复连接后可继续','Offline. Sampling resumes when connected.'],['请打开在线网站使用下载测速','Open the hosted site to measure speed.'],['节省流量模式：点击后开始采样','Data saver: click Start to sample.'],['仪表隐藏，采样已暂停','Gauge hidden. Sampling paused.'],['已暂停 · 数字为上次采样','Paused · showing the last sample'],['上次下载平均 · 等待下次采样','Last download average · waiting'],['正在测量本次下载平均速度…','Measuring download average…'],['本次采样完成 · 自动采样已暂停','Sample complete · automatic sampling paused'],['本次下载平均 · 等待下次采样','Download average · waiting for next sample'],['本次采样超时，稍后重试','Sample timed out. Please try again.'],['采样已取消','Sample canceled'],['采样失败，请重试','Sampling failed. Please retry.'],
    ['测速资源暂不可用','Sample resource unavailable'],['测速响应无效，请稍后重试','Invalid response. Please retry later.'],['测速样本长度异常','Unexpected sample size'],['测速样本不完整，请重试','Incomplete sample. Please retry.'],['检测到缓存或压缩，本次不计入','Cached or compressed sample discarded'],
    ['在线模式从 DummyJSON 的句库随机获取短句；断网或接口不可用时使用本地精选。关闭摘句后不再请求句子接口。','Online quotes are selected randomly from DummyJSON. Curated quotes are used offline. Turning quotes off stops quote requests.'],
    ['歌词模式从预设英文歌曲中随机选取短句，附歌曲、歌手与 lyrics.ovh 来源。服务不可用时回退本地精选。','Lyrics mode selects short lines from a preset English song list, with song, artist and lyrics.ovh source links. Curated quotes are used if unavailable.'],
    ['F1 模式默认显示网速表。测速会下载小样本，页面隐藏时暂停；结果反映本站下载速度，不代表整机总流量。','The speedometer is shown in F1 mode. Small download samples pause when the page is hidden. Results measure this site, not all device traffic.'],
    ['主题、搜索引擎、链接和涂鸦保存在当前浏览器，不会自动跨设备同步。请定期导出备份。','Themes, search engines, links and drawings are saved in this browser. Export backups regularly; data does not sync across devices.'],
    ['支持本站备份或链接数组 JSON。导入前会请你确认；原本地 HTML 的数据不会自动迁移。','Import a Shawngine backup or a JSON link array. Confirmation is required. Data from the original local HTML is not migrated automatically.'],
    ['浏览器未能保存数据，请导出备份；本次修改仍可在当前页面使用。','Could not save in this browser. Export a backup; changes remain available in this session.'],
    ['请输入有效的网站地址。','Enter a valid website address.'],['仅支持 http:// 或 https:// 网站地址。','Only HTTP or HTTPS addresses are supported.'],['网站地址格式不正确，请检查后再保存。','Check the website address and try again.'],['请输入不含账号密码的 HTTP 或 HTTPS 地址。','Use an HTTP or HTTPS address without embedded credentials.'],
    ['备份中的链接格式不正确，最多支持 300 个链接。','Invalid link data. Up to 300 links are supported.'],['链接名称需为 1–60 个字符。','Link names must contain 1–60 characters.'],['请填写链接名称，最多 60 个字符。','Enter a link name of up to 60 characters.'],['最多支持 300 个链接，请先删除不需要的链接。','The limit is 300 links. Remove unused links first.'],['链接已删除','Link deleted'],['链接已保存','Link saved'],
    ['备份文件过大，请选择 8 MB 以内的 JSON 文件。','Choose a JSON backup smaller than 8 MB.'],['不是可识别的 Shawngine 备份文件。','This is not a recognized Shawngine backup.'],['备份中的设置格式不正确。','Invalid settings in the backup.'],['备份中的摘句设置格式不正确。','Invalid language or quote settings in the backup.'],['备份中的涂鸦格式不正确。','Invalid drawing data in the backup.'],['导入并替换','Import and replace'],['备份已导入','Backup imported'],['JSON 文件格式不正确，请选择有效备份。','Invalid JSON. Choose a valid backup.'],['涂鸦图片尺寸过大。','The drawing image is too large.'],['无法读取备份中的涂鸦图片。','The drawing in this backup could not be read.'],['保存的涂鸦无法读取，其他功能仍可使用。','The saved drawing could not be read. Other features are available.'],['画笔已启用，在空白区域开始涂鸦','Drawing enabled. Draw in the blank area.'],['画笔已停用','Drawing disabled'],['确定清除当前涂鸦吗？建议先导出备份。','Clear this drawing? Export a backup first if needed.'],['清除','Clear'],['涂鸦已清除','Drawing cleared'],['涂鸦已保存到当前浏览器','Drawing saved in this browser'],
  ];
  const dictionary = new Map(entries);
  let language = 'zh';
  const records = new WeakMap();
  const attributes = new WeakMap();
  function english(s) {
    if (dictionary.has(s)) return dictionary.get(s);
    let m;
    if ((m=s.match(/^用(.+)搜索…$/))) return 'Search with ' + (dictionary.get(m[1]) || m[1]) + '…';
    if ((m=s.match(/^当前(.+)，点击切换主题$/))) return (dictionary.get(m[1]) || m[1]) + '; click to switch theme';
    if ((m=s.match(/^(编辑链接|删除链接)：(.*)$/))) return (m[1]==='编辑链接'?'Edit link: ':'Delete link: ')+m[2];
    if ((m=s.match(/^确定删除“(.*)”吗？$/))) return 'Delete “'+m[1]+'”?';
    if ((m=s.match(/^量程 (.+) Mbps$/))) return 'Range '+m[1]+' Mbps';
    if ((m=s.match(/^(\d+) 秒前$/))) return m[1]+'s ago';
    if ((m=s.match(/^(\d+) 分钟前$/))) return m[1]+'m ago';
    if ((m=s.match(/^将导入 (\d+) 个链接，并替换当前(.*)。建议先导出当前备份。$/))) return 'Import '+m[1]+' links and replace '+(m[2]==='链接'?'your links':'settings, links and drawing')+'? Export your current backup first.';
    return s;
  }
  function convert(raw) {const core=raw.trim();return language==='en' ? raw.replace(core,english(core)) : raw;}
  function updateText(node) {
    if(node.parentElement?.closest('script,style,#dailyQuote,#quoteSource,.custom-link-btn,#designerLine,.f1-toast'))return;
    const current=node.nodeValue;
    let record=records.get(node);
    if(!record || record.last!==current)record={source:current,last:current};
    const next=convert(record.source);
    record.last=next;records.set(node,record);
    if(current!==next)node.nodeValue=next;
  }
  function updateAttribute(element,key) {
    if(!element.hasAttribute(key))return;
    let set=attributes.get(element);if(!set){set={};attributes.set(element,set);}
    const current=element.getAttribute(key);let record=set[key];
    if(!record || record.last!==current)record={source:current,last:current};
    const next=convert(record.source);record.last=next;set[key]=record;
    if(current!==next)element.setAttribute(key,next);
  }
  function render() {
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode())updateText(walker.currentNode);
    document.querySelectorAll('[aria-label],[title],[placeholder]').forEach(el=>['aria-label','title','placeholder'].forEach(key=>updateAttribute(el,key)));
  }
  const observer=new MutationObserver(render);
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder']});
  window.ShawngineI18n=Object.freeze({setLanguage(value){language=value==='en'?'en':'zh';document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=language==='en'?'Shawngine · Your search starts here':'Shawngine · 你的搜索起点';render();}});
})();
