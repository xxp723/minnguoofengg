/**
 * 文件名: js/apps/trace/trace-schedule.js
 * 用途: 轨迹应用 - 日程模块。
 */
import { persistTraceData } from './trace-store.js';
import { loadMapData } from '../map/map-store.js';
import { showApiErrorModal } from '../../core/ui/components/ApiErrorModal.js';

/* ==========================================================================
   [区域标注·本次需求·日程生成上下文提取与 API 工具]
   ========================================================================== */
async function requestScheduleFromSecondaryApi(profile, messages) {
  if (!profile.apiKey) throw new Error('副 API Key 不能为空');
  if (!profile.model) throw new Error('请先在设置应用选择副 API 模型');

  const provider = profile.provider || 'openai';
  const rawBaseUrl = profile.baseUrl || '';

  // 简单 trimSlash
  const trimSlash = (url) => url.replace(/\/+$/, '');

  let endpoint, method = 'POST', headers = { 'Content-Type': 'application/json' }, body;

  if (provider === 'deepseek' || provider === 'openai') {
    endpoint = `${trimSlash(rawBaseUrl)}/chat/completions`;
    headers['Authorization'] = `Bearer ${profile.apiKey}`;
    body = JSON.stringify({
      model: profile.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: 0.7
    });
  } else if (provider === 'gemini') {
    endpoint = `${trimSlash(rawBaseUrl)}/models/${encodeURIComponent(profile.model)}:generateContent?key=${encodeURIComponent(profile.apiKey)}`;
    const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
    const userParts = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');
    body = JSON.stringify({
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: userParts }] }],
      generationConfig: { temperature: 0.7 }
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
      max_tokens: 1024,
      temperature: 0.7
    });
  } else {
    throw new Error(`暂不支持通过该服务商(${provider})生成日程`);
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
    console.error('解析日程 JSON 失败:', text);
    throw new Error('AI 返回的数据格式无法解析');
  }
}

/* ==========================================================================
   [区域标注·本次需求·日程模块 UI 渲染]
   ========================================================================== */
export function renderSchedule(container, state) {
  const schedules = Array.isArray(state.schedules) ? state.schedules : [];
  
  const now = new Date();
  const currentHourStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  // 判断当前选中的日期是否是今天
  const todayStr = now.toISOString().split('T')[0];
  const targetDateStr = state.selectedDate || todayStr;
  const isToday = targetDateStr === todayStr;
  const isPastDay = targetDateStr < todayStr;

  // 计算状态
  const getStatus = (timeStr) => {
    if (isPastDay) return 'past';
    if (!isToday && targetDateStr > todayStr) return 'future';

    const toMinutes = (t) => {
      if (t === '00:00' || t === '24:00') return 24 * 60; // 跨天午夜作为 1440
      const [h, m] = t.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const parts = timeStr.split('-');
    if (parts.length !== 2) return 'future';
    const start = toMinutes(parts[0].trim());
    const end = toMinutes(parts[1].trim());
    const current = toMinutes(currentHourStr);
    
    if (current >= end) return 'past';
    if (current >= start && current < end) return 'current';
    return 'future';
  };

  let listHtml = '';
  if (schedules.length === 0) {
    listHtml = `
      <div class="trace-empty">
        <p>暂无${isToday ? '今日' : '该日'}日程</p>
        <p class="trace-empty-sub">点击左上角羽毛笔生成</p>
      </div>
    `;
  } else {
    // 采用时间轴 + 色块布局
    listHtml = `<div class="trace-timeline-list">` + schedules.map((s, index) => {
      const status = getStatus(s.time);
      const isPast = status === 'past';
      const timeParts = s.time.split('-');
      const startTime = timeParts[0] ? timeParts[0].trim() : '';
      
      // 添加索引 data-index 方便后续内联编辑保存
      return `
      <div class="trace-timeline-item trace-status-${status}" data-index="${index}">
        <div class="trace-timeline-time-col">
          <div class="trace-timeline-time">${escapeHtml(startTime)}</div>
        </div>
        <div class="trace-timeline-line">
          <div class="trace-timeline-dot"></div>
        </div>
        <div class="trace-timeline-content">
          <div class="trace-card trace-schedule-card">
            <div class="trace-schedule-body">
              <div class="trace-card-title ${isPast ? 'is-completed' : ''}">
                <span class="editable-text" data-field="title">${escapeHtml(s.title || '活动')}</span>
              </div>
              <div class="trace-schedule-duration">
                <span class="editable-text" data-field="time">${escapeHtml(s.time)}</span>
              </div>
              <div class="trace-schedule-location">
                <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 44C24 44 40 32 40 19C40 10.1634 32.8366 3 24 3C15.1634 3 8 10.1634 8 19C8 32 24 44 24 44Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="19" r="6" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>
                <span class="editable-text" data-field="location">${escapeHtml(s.location)}</span>
              </div>
              <div class="trace-card-desc">
                <span class="editable-text" data-field="detail">${escapeHtml(s.detail || '')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `}).join('') + `</div>`;
  }

  container.innerHTML = `
    <div class="trace-module-container">
      <div class="trace-module-content">
        ${listHtml}
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求·日程模块交互事件绑定]
   ========================================================================== */
export function bindScheduleEvents(shellContainer, container, state, context) {
  const generateBtn = shellContainer.querySelector('#trace-schedule-generate-btn');
  const dropdownMask = shellContainer.querySelector('#trace-dropdown-mask');
  const dropdownTitle = shellContainer.querySelector('#trace-dropdown-title');
  const dropdownContent = shellContainer.querySelector('#trace-dropdown-content');
  const dropdownFooter = shellContainer.querySelector('#trace-dropdown-footer');
  
  let selectedMapId = state.boundMapId || null;
  let availableMaps = [];

  const openMapModal = async () => {
    if (!state.activeContactId) {
      showApiErrorModal(shellContainer, { title: '提示', message: '请先选择一个联系人' });
      return;
    }

    // 复用折叠菜单
    dropdownTitle.textContent = '选择关联地图';
    const tpl = shellContainer.querySelector('#tpl-map-list');
    if (tpl) {
      dropdownContent.innerHTML = tpl.innerHTML;
    }
    dropdownFooter.style.display = 'block';
    
    // 替换确认按钮防止事件重复绑定
    const oldConfirmBtn = dropdownFooter.querySelector('#trace-dropdown-confirm');
    const confirmBtn = oldConfirmBtn.cloneNode(true);
    oldConfirmBtn.parentNode.replaceChild(confirmBtn, oldConfirmBtn);
    confirmBtn.textContent = '确认生成';

    dropdownMask.classList.remove('is-hidden');
    
    const mapListContainer = dropdownContent.querySelector('#trace-map-list-container');
    const hintEl = dropdownContent.querySelector('#trace-map-select-hint');
    hintEl.textContent = '';
    
    // 加载地图列表
    try {
      const mapData = await loadMapData(context.db);
      availableMaps = mapData.maps || [];
      if (availableMaps.length === 0) {
        mapListContainer.innerHTML = '<div style="text-align:center;color:#999;font-size:12px;padding:10px;">暂无可用地图，请先在地图应用中创建</div>';
      } else {
        mapListContainer.innerHTML = availableMaps.map(m => {
          const isSelected = String(m.id) === String(selectedMapId) ? 'background:#1a1a1a;color:#fff;' : 'background:#f5f5f5;color:#1a1a1a;';
          return `<div class="trace-map-select-item" data-id="${m.id}" style="padding:10px; border-radius:8px; cursor:pointer; font-size:14px; ${isSelected}">${escapeHtml(m.name)}</div>`;
        }).join('');

        // 绑定选择事件
        mapListContainer.querySelectorAll('.trace-map-select-item').forEach(item => {
          item.addEventListener('click', (e) => {
            selectedMapId = e.currentTarget.dataset.id;
            // 更新 UI
            mapListContainer.querySelectorAll('.trace-map-select-item').forEach(el => {
              el.style.background = '#f5f5f5';
              el.style.color = '#1a1a1a';
            });
            e.currentTarget.style.background = '#1a1a1a';
            e.currentTarget.style.color = '#fff';
          });
        });
      }
    } catch (e) {
      console.error(e);
      mapListContainer.innerHTML = '<div style="text-align:center;color:#e74c3c;font-size:12px;padding:10px;">加载地图失败</div>';
    }

    confirmBtn.addEventListener('click', async () => {
      if (!selectedMapId) {
        hintEl.textContent = '请先选择一个关联地图';
        return;
      }

      const selectedMap = availableMaps.find(m => m.id === selectedMapId);
      if (!selectedMap) {
        hintEl.textContent = '地图数据无效';
        return;
      }

      if (!selectedMap.points || selectedMap.points.length === 0) {
        hintEl.textContent = '该地图中还没有任何地点，无法生成日程，请先前往地图应用添加地点。';
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = '生成中...';
      hintEl.textContent = '';

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

        // 2. 收集聊天记录（最近20轮对话，一轮=一组连续User消息+一组连续Assistant消息）
        const chatKey = `chat_messages_${state.activeMaskId}_${state.activeContactId}`;
        const chatRecord = await context.db.get('appsData', chatKey);
        const chatRecordsRaw = chatRecord ? (chatRecord.data || chatRecord.value || []) : [];
        
        // 合并连续同角色消息为块(Block)
        const blocks = [];
        let currentBlock = [];
        for (const msg of chatRecordsRaw) {
          if (currentBlock.length === 0) {
            currentBlock.push(msg);
          } else {
            if (currentBlock[0].role === msg.role) {
              currentBlock.push(msg);
            } else {
              blocks.push(currentBlock);
              currentBlock = [msg];
            }
          }
        }
        if (currentBlock.length > 0) blocks.push(currentBlock);
        
        // 取最后 40 个块（约等于 20 轮对话，每轮一来一回算 2 个块）
        const recentBlocks = blocks.slice(-40);
        const recentMessages = recentBlocks.flat();

        const chatLines = recentMessages.map(msg => {
          const role = msg.role === 'user' ? '用户' : activeContact?.name || '角色';
          return `[${new Date(msg.timestamp).toLocaleString()}] ${role}: ${msg.content}`;
        }).join('\n');

        // 3. 收集世界书
        const wbRecord = await context.db.get('appsData', 'worldbook::all-books');
        const worldBooksRaw = wbRecord ? (wbRecord.data || wbRecord.value || []) : [];
        const relatedBooks = worldBooksRaw.filter(b => b.enabled !== false && b.entries);
        const bookText = relatedBooks.map(b => b.entries.filter(e => e.enabled !== false).map(e => `[${(e.keys || []).join(',')}] ${e.content}`).join('\n')).join('\n');

        // 4. 提取地图地点
        const mapPointsText = (selectedMap.points || []).map(p => `- ${p.name || '未命名地点'}: ${p.description || '无具体描述'}`).join('\n');

        // 5. 组装 Prompt
        const targetDate = new Date(state.selectedDate);
        const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const currentDay = days[targetDate.getDay()];
        const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
        const dayTypeInfo = isWeekend 
          ? '这一天是周末（请安排娱乐、放松、休闲为主的活动，不要安排上班或上学，除非人设强烈要求）。' 
          : '这一天是工作日（周一至周五，请正常安排白天上班、上学或处理正事，晚上做休闲、放松的活动，不应出现白天在玩的情况，除非人设强烈要求）。';

        const systemPrompt = `你现在扮演角色：${activeContact?.name || '未知'}。
【世界书背景】：
${bookText || '无特殊背景'}

【你的档案设定】：
${charPrompt}

【当前用户面具（互动对象）】：
${maskPrompt}

【最近聊天参考】：
${chatLines || '暂无近期聊天记录'}

【活动地图与已有地点】：以下是你所在地图（${selectedMap.name}）的已有地点：
${mapPointsText}

【日期约束】：
这天是${currentDay}。${dayTypeInfo}

任务要求：
1. 请根据上述背景为你自己生成这一天的日程表，必须在上述【已有地点】中选择活动场所，绝不允许虚构新地点！
2. 严格遵守【日期约束】，符合生活常识。时间安排必须分清早中晚的合理作息，且要有一定的独立自主性，同时也要参考【最近聊天参考】中的对话或约定来安排合适的活动（体现活人感）。
3. 日程表固定生成 8 个时间段，每 2 小时一个时段，从 08:00 开始到次日 00:00 结束（即 08:00 - 10:00, 10:00 - 12:00, 12:00 - 14:00, 14:00 - 16:00, 16:00 - 18:00, 18:00 - 20:00, 20:00 - 22:00, 22:00 - 00:00）。
4. 严格输出为精简的 JSON 数组，包含以下字段：
  - time: 时间段（必须严格遵守格式，如 "08:00 - 10:00"）
  - location: 所在地点（必须是【已有地点】之一）
  - title: 正在做的事（小标题，不超过10字）
  - detail: 正在做的事（正文描述，详细版，80字以内）
5. 禁止生成违背人设（OOC）的行为！
6. 严格返回纯 JSON 数组，禁止任何 Markdown 标记、代码块标记（如 \`\`\`json）或任何多余的解释性文本。`;

        // 6. 调用 API
        const settingsRecord = await context.db.get('settings', 'global-settings');
        const settingsStore = settingsRecord || {};
        const apiSettings = settingsStore.api || {};
        // 优先副 API，回退主 API
        const targetApi = (apiSettings.secondary && apiSettings.secondary.apiKey) ? apiSettings.secondary : apiSettings.primary;

        if (!targetApi || !targetApi.apiKey) {
          throw new Error('请先在设置应用中配置主 API 或副 API。');
        }

        const rawAiText = await requestScheduleFromSecondaryApi(targetApi, [{ role: 'system', content: systemPrompt }]);
        const parsedSchedules = extractJsonArrayFromAiText(rawAiText);

        if (!Array.isArray(parsedSchedules) || parsedSchedules.length === 0) {
          throw new Error('AI 返回的数据无效。');
        }

        // 自动解析标注收支属性
        parsedSchedules.forEach(s => {
          const contentToParse = (s.title || '') + ' ' + (s.detail || '');
          const types = [];
          if (/[买转花付]|消费|支出|购物|买单/.test(contentToParse)) types.push('expense');
          if (/[赚收]|工资|收入|收益|发薪/.test(contentToParse)) types.push('income');
          if (types.length > 0) s.financialTypes = types;
        });

        // 保存绑定关系和日程数据
        state.boundMapId = selectedMapId;
        state.schedules = parsedSchedules;

        await persistTraceData(context.db, state, state.activeMaskId, state.activeContactId, state.selectedDate);
        
        dropdownMask.classList.add('is-hidden');
        renderSchedule(container, state);
        // 注意重新绑定事件
        bindScheduleEvents(shellContainer, container, state, context);

      } catch (err) {
        console.error(err);
        showApiErrorModal(shellContainer, { title: '生成日程失败', message: err.message || '未知错误' });
        hintEl.textContent = '生成失败，请重试。';
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '确认生成';
      }
    });
  };

  generateBtn?.addEventListener('click', openMapModal);

  // 添加内联编辑事件委托
  container.addEventListener('click', (e) => {
    const editableSpan = e.target.closest('.editable-text');
    if (!editableSpan || editableSpan.querySelector('input, textarea')) return;

    const field = editableSpan.dataset.field;
    const itemEl = editableSpan.closest('.trace-timeline-item');
    if (!itemEl) return;
    const index = parseInt(itemEl.dataset.index, 10);
    const schedule = state.schedules[index];
    if (!schedule) return;

    const originalText = schedule[field] || '';

    // 创建输入框
    const isTextarea = field === 'detail';
    const inputEl = document.createElement(isTextarea ? 'textarea' : 'input');
    if (!isTextarea) inputEl.type = 'text';
    inputEl.value = originalText;
    inputEl.className = isTextarea ? 'trace-inline-textarea' : 'trace-inline-input';
    
    editableSpan.innerHTML = '';
    editableSpan.appendChild(inputEl);
    inputEl.focus();

    // 失去焦点或回车保存
    const saveChanges = async () => {
      const newText = inputEl.value.trim();
      if (newText !== originalText) {
        schedule[field] = newText;
        
        // 如果修改的是标题或详情，重新解析收支属性
        if (field === 'title' || field === 'detail') {
          const contentToParse = (schedule.title || '') + ' ' + (schedule.detail || '');
          const types = [];
          if (/[买转花付]|消费|支出|购物|买单/.test(contentToParse)) types.push('expense');
          if (/[赚收]|工资|收入|收益|发薪/.test(contentToParse)) types.push('income');
          if (types.length > 0) {
            schedule.financialTypes = types;
          } else {
            delete schedule.financialTypes;
          }
        }

        // 保存到数据库
        await persistTraceData(context.db, state, state.activeMaskId, state.activeContactId, state.selectedDate);
      }
      editableSpan.innerHTML = escapeHtml(schedule[field] || '');
    };

    inputEl.addEventListener('blur', saveChanges);
    if (!isTextarea) {
      inputEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') saveChanges();
      });
    }
  });

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
