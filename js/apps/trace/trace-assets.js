/**
 * 文件名: js/apps/trace/trace-assets.js
 * 用途: 轨迹应用 - 资产模块。
 */
import { persistTraceData } from './trace-store.js';
import { showApiErrorModal } from '../../core/ui/components/ApiErrorModal.js';

/* ==========================================================================
   [区域标注·本次需求·应用内轻量级提示弹窗]
   ========================================================================== */
function showToast(container, message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(26, 26, 26, 0.9);
    color: #ffffff;
    padding: 14px 28px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  toast.textContent = message;
  container.appendChild(toast);
  
  // 触发动画
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

/* ==========================================================================
   [区域标注·本次需求·资产生成上下文提取与 API 工具]
   ========================================================================== */
async function requestAssetsFromApi(profile, messages) {
  if (!profile.apiKey) throw new Error('API Key 不能为空');
  if (!profile.model) throw new Error('未选择 API 模型');

  const provider = profile.provider || 'openai';
  const rawBaseUrl = profile.baseUrl || '';
  const trimSlash = (url) => url.replace(/\/+$/, '');
  let endpoint, method = 'POST', headers = { 'Content-Type': 'application/json' }, body;

  if (provider === 'deepseek' || provider === 'openai') {
    endpoint = `${trimSlash(rawBaseUrl)}/chat/completions`;
    headers['Authorization'] = `Bearer ${profile.apiKey}`;
    body = JSON.stringify({
      model: profile.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: 0.4
    });
  } else if (provider === 'gemini') {
    endpoint = `${trimSlash(rawBaseUrl)}/models/${encodeURIComponent(profile.model)}:generateContent?key=${encodeURIComponent(profile.apiKey)}`;
    const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
    const userParts = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');
    body = JSON.stringify({
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: userParts }] }],
      generationConfig: { temperature: 0.4 }
    });
  } else if (provider === 'claude') {
    endpoint = `${trimSlash(rawBaseUrl)}/messages`;
    headers['x-api-key'] = profile.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    body = JSON.stringify({
      model: profile.model,
      system: systemPrompt,
      messages: userMsgs,
      max_tokens: 1500,
      temperature: 0.4
    });
  } else {
    throw new Error(`暂不支持通过该服务商(${provider})生成`);
  }

  const response = await fetch(endpoint, { method, headers, body });
  if (!response.ok) {
    throw new Error(`API 请求失败: HTTP ${response.status}`);
  }

  const result = await response.json();
  let aiText = '';
  if (provider === 'deepseek' || provider === 'openai') {
    aiText = result.choices?.[0]?.message?.content || '';
  } else if (provider === 'gemini') {
    aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else if (provider === 'claude') {
    aiText = result.content?.map(c => c.text).join('\n') || '';
  }
  return aiText;
}

function extractJsonArrayFromAiText(text) {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return JSON.parse(text);
  } catch (e) {
    console.error('解析资产 JSON 失败:', text);
    throw new Error('AI 返回的数据格式无法解析');
  }
}

/* ==========================================================================
   [区域标注·本次需求·资产模块 UI 渲染]
   ========================================================================== */
export function renderAssets(container, state) {
  const assets = Array.isArray(state.assets) ? state.assets : [];
  
  // 按照 category 进行分组，找不到分组的放在 'other'
  const groups = {
    wallet: [],
    income: [],
    expense: [],
    investment: [],
    special: [],
    transfer: [],
    other: []
  };

  assets.forEach(a => {
    if (a.category && groups[a.category]) {
      groups[a.category].push(a);
    } else {
      groups.other.push(a);
    }
  });

  const renderGroup = (title, items, isWallet = false) => {
    if (!items || items.length === 0) return '';
    if (isWallet) {
      return items.map(a => {
        // 防止 AI 返回的 amount 里自带了 ¥ 符号，导致双重显示
        let amtStr = escapeHtml(a.amount || '0').trim();
        if (amtStr.startsWith('¥')) amtStr = amtStr.substring(1).trim();
        return `
        <div class="trace-wallet-card">
          <div class="trace-wallet-bg"></div>
          <div class="trace-wallet-content">
            <div class="trace-wallet-title">Total Balance</div>
            <div class="trace-wallet-amount">¥ ${amtStr}</div>
            <div class="trace-wallet-name">${escapeHtml(a.name || '账户余额')}</div>
            <div class="trace-wallet-desc">${escapeHtml(a.desc || '')}</div>
          </div>
        </div>
      `}).join('');
    }

    return `
      <div class="trace-assets-group">
        <h3 class="trace-assets-group-title">${title}</h3>
        <div class="trace-assets-list">
          ${items.map(a => `
            <div class="trace-asset-item">
              <div class="trace-asset-info">
                <div class="trace-asset-name">${escapeHtml(a.name || '未命名')}</div>
                <div class="trace-asset-desc">${escapeHtml(a.desc || '')}</div>
              </div>
              <div class="trace-asset-amount ${a.category === 'income' ? 'is-income' : 'is-expense'}">
                ${a.category === 'income' ? '+' : ''}${escapeHtml(a.amount || '0')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  let contentHtml = '';
  if (assets.length === 0) {
    contentHtml = `
      <div class="trace-empty">
        <p>暂无资产记录</p>
        <p class="trace-empty-sub">点击左上角图标生成</p>
      </div>
    `;
  } else {
    contentHtml = `
      ${renderGroup('钱包', groups.wallet, true)}
      ${renderGroup('转账流水', groups.transfer)}
      ${renderGroup('近期收入', groups.income)}
      ${renderGroup('近期支出', groups.expense)}
      ${renderGroup('理财与投资', groups.investment)}
      ${renderGroup('对“我”的特定消费', groups.special)}
      ${renderGroup('其它', groups.other)}
    `;
  }

  container.innerHTML = `
    <div class="trace-module-container trace-assets-container">
      <div class="trace-module-content">
        ${contentHtml}
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求·资产模块交互事件绑定]
   ========================================================================== */
export function bindAssetsEvents(shellContainer, container, state, context) {
  const generateBtn = shellContainer.querySelector('#trace-assets-generate-btn');
  if (!generateBtn) return;

  const handleGenerate = async () => {
    if (!state.activeContactId) {
      showApiErrorModal(shellContainer, { title: '提示', message: '请先选择一个联系人' });
      return;
    }
    
    // UI 反馈
    const originalIcon = generateBtn.innerHTML;
    generateBtn.innerHTML = `<span style="font-size:12px;">生成中</span>`;
    generateBtn.disabled = true;

    try {
      // 1. 收集联系人和面具档案
      const archiveRecord = await context.db.get('appsData', 'archive::archive-data');
      const archiveData = archiveRecord ? (archiveRecord.data || archiveRecord.value || {}) : {};
      
      const activeContact = state.contacts.find(c => c.id === state.activeContactId);
      const activeMask = (state.masks || []).find(m => m.id === state.activeMaskId);
      
      const charSetting = archiveData.characters?.find(c => c.id === activeContact?.id) || {};
      const charPrompt = `角色姓名：${activeContact?.name || '未知'}\n背景：${charSetting.background || ''}\n人设：${charSetting.prompt || ''}\n档案：${charSetting.profile || ''}`;
      
      const maskSetting = archiveData.masks?.find(m => m.id === state.activeMaskId) || {};
      const maskPrompt = `用户面具：${activeMask?.name || '未知'}\n背景：${maskSetting.background || ''}\n人设：${maskSetting.prompt || ''}\n档案：${maskSetting.profile || ''}`;

      // 2. 收集世界书
      const wbRecord = await context.db.get('appsData', 'worldbook::all-books');
      const worldBooksRaw = wbRecord ? (wbRecord.data || wbRecord.value || []) : [];
      const relatedBooks = worldBooksRaw.filter(b => b.enabled !== false && b.entries);
      const bookText = relatedBooks.map(b => b.entries.filter(e => e.enabled !== false).map(e => `[${(e.keys || []).join(',')}] ${e.content}`).join('\n')).join('\n');

      // 3. 收集该角色过去30天的带有收支标签的日程表
      const schedulesContext = [];
      const now = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const scheduleKey = `trace_schedule_${state.activeMaskId}_${state.activeContactId}_${dateStr}`;
        const scheduleRecord = await context.db.get('appsData', scheduleKey);
        const scheduleRaw = scheduleRecord ? (scheduleRecord.data || scheduleRecord.value || null) : null;
        if (scheduleRaw && Array.isArray(scheduleRaw.schedules)) {
          const financialSchedules = scheduleRaw.schedules.filter(s => s.financialTypes && s.financialTypes.length > 0);
          if (financialSchedules.length > 0) {
            schedulesContext.push(`【${dateStr}】:\n` + financialSchedules.map(s => `- ${s.time} [${s.financialTypes.join(',')}] ${s.title}: ${s.detail}`).join('\n'));
          }
        }
      }
      const schedulesText = schedulesContext.join('\n\n');

      // 4. 收集最近的关于送礼/转账的聊天记录（闲谈应用）
      // 修正：闲谈消息存储的真实键前缀是 "chat_msgs_"
      const chatKey = `chat_msgs_${state.activeMaskId}_${state.activeContactId}`;
      const chatRecord = await context.db.get('appsData', chatKey);
      let chatRecordsRaw = [];
      if (chatRecord) {
        // 如果存储结构是对象数组或是带有 messages 字段的对象
        chatRecordsRaw = Array.isArray(chatRecord.data) ? chatRecord.data 
                       : (chatRecord.data && Array.isArray(chatRecord.data.messages) ? chatRecord.data.messages 
                       : (Array.isArray(chatRecord.value) ? chatRecord.value 
                       : (chatRecord.value && Array.isArray(chatRecord.value.messages) ? chatRecord.value.messages : [])));
      }
      
      // 简单筛选带金额或礼物、收付款的消息（放宽正则匹配范围，并增加对 system 类型消息如系统转账提示的捕获）
      const financialChats = chatRecordsRaw.filter(msg => {
        const txt = String(msg.content || msg.text || msg.html || '');
        // "红包", "转账" 在很多系统提示或用户动作中常见（HTML 卡片也包含这些字眼）
        return /转账|红包|送礼|买给|花费|给你.*钱|收到|支付|¥|元|块钱|礼物/.test(txt);
      }).slice(-30); // 取最近30条相关
      const chatLines = financialChats.map(msg => {
        const role = msg.role === 'user' ? '用户' : activeContact?.name || '角色';
        // HTML 卡片可能只有 html 字段没有 content 字段
        const contentStr = String(msg.content || msg.html || '').replace(/<[^>]+>/g, ' '); // 简单剔除HTML标签
        return `[${new Date(msg.timestamp || Date.now()).toLocaleString()}] ${role}: ${contentStr}`;
      }).join('\n');

      // 5. 拼装 Prompt
      const systemPrompt = `你现在扮演角色：${activeContact?.name || '未知'}。你需要根据以下所有信息，为你自己生成一份详细的资产情况表。
【世界书背景】：
${bookText || '无特殊背景'}

【你的档案设定】（非常重要，决定了你的基础资产水平）：
${charPrompt}

【当前用户面具（互动对象）】：
${maskPrompt}

【过去一个月的收支日常记录】：
${schedulesText || '暂无近期的收支日常'}

【与用户关于金钱/礼物的相关对话记录】：
${chatLines || '暂无金钱往来聊天'}

任务要求：
1. 请仔细分析【档案设定】中你的社会地位、职业和性格。绝不能OOC！(例如：如果是穷学生，钱包不能有几百万；如果是霸总，不能只赚几千块)。
2. 提取“转账流水(transfer)”时，必须【仅限】且【明确】是你（角色）与当前用户（面具）之间发生的资金往来。绝对不要脑补或生成你与其他家人、朋友、公司的虚构转账流水！如果没有相关的聊天记录或日志，则转账流水列表必须为空。
2. 结合【过去一个月的收支日常记录】和【与用户关于金钱的对话记录】，在合理范围内总结出近期的开销、收入和对用户的专项消费。如果没有记录支持某项支出/收入，可根据人设合理虚构日常开销。
3. 必须输出为 JSON 数组，每个对象代表一项资产条目。数组中的每个对象必须包含以下字段：
   - category: 类别。必须是以下之一: "wallet"(仅限1条，代表总可用余额), "income"(近期收入项目), "expense"(近期支出项目), "investment"(理财与投资情况), "special"(对用户的特定消费), "transfer"(转账流水，包括用户转给你的和你转给用户的金额，必须单列出来)。
   - name: 项目名称（如 "工资", "买咖啡", "股票账户", "给用户买的项链"）。
   - amount: 金额（请带上货币符号或单位，如 "¥5000", "-¥30", "$1.2M", "浮亏20%"等。wallet类的必须是当前剩余总额）。
   - desc: 补充描述（20字以内）。
4. 严格返回纯 JSON 数组，禁止任何 Markdown 标记、代码块标记（如 \`\`\`json）或任何多余的解释性文本。`;

      // 6. 调用 API
      const settingsRecord = await context.db.get('settings', 'global-settings');
      const settingsStore = settingsRecord || {};
      const apiSettings = settingsStore.api || {};
      
      const targetApi = (apiSettings.secondary && apiSettings.secondary.apiKey) ? apiSettings.secondary : apiSettings.primary;

      if (!targetApi || !targetApi.apiKey) {
        throw new Error('请先在设置应用中配置主 API 或副 API。');
      }

      const rawAiText = await requestAssetsFromApi(targetApi, [{ role: 'system', content: systemPrompt }]);
      const parsedAssets = extractJsonArrayFromAiText(rawAiText);

      if (!Array.isArray(parsedAssets) || parsedAssets.length === 0) {
        throw new Error('AI 返回的数据无效。');
      }

      // 7. 保存数据并渲染
      state.assets = parsedAssets;
      await persistTraceData(context.db, state, state.activeMaskId, state.activeContactId, state.selectedDate);
      
      renderAssets(container, state);

      // 生成成功提示弹窗，改用轻量级 Toast 而不是报错组件
      showToast(shellContainer, '生成完成');

    } catch (err) {
      console.error(err);
      showApiErrorModal(shellContainer, { title: '生成资产失败', message: err.message || '未知错误' });
    } finally {
      generateBtn.innerHTML = originalIcon;
      generateBtn.disabled = false;
    }
  };

  // 先移除旧事件，防止重复绑定
  const newBtn = generateBtn.cloneNode(true);
  generateBtn.parentNode.replaceChild(newBtn, generateBtn);
  newBtn.addEventListener('click', handleGenerate);
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&' + '#38;';
      case '<': return '&' + '#60;';
      case '>': return '&' + '#62;';
      case '"': return '&' + '#34;';
      case "'": return '&' + '#39;';
      default: return char;
    }
  });
}
