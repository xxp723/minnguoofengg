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

  // 计算状态
  const getStatus = (timeStr) => {
    // timeStr 格式如 "08:00 - 10:00"
    const parts = timeStr.split('-');
    if (parts.length !== 2) return 'future';
    const start = parts[0].trim();
    const end = parts[1].trim();
    
    if (currentHourStr >= end) return 'past';
    if (currentHourStr >= start && currentHourStr < end) return 'current';
    return 'future';
  };

  let listHtml = '';
  if (schedules.length === 0) {
    listHtml = `
      <div class="trace-empty">
        <p>暂无今日日程</p>
        <p class="trace-empty-sub">点击左上角羽毛笔生成</p>
      </div>
    `;
  } else {
    listHtml = `<div class="trace-list">` + schedules.map(s => {
      const status = getStatus(s.time);
      return `
      <div class="trace-card trace-schedule-card trace-status-${status}">
        <div class="trace-schedule-time">${escapeHtml(s.time)}</div>
        <div class="trace-schedule-body">
          <div class="trace-schedule-location">📍 ${escapeHtml(s.location)}</div>
          <div class="trace-card-title">${escapeHtml(s.title || '活动')}</div>
          <div class="trace-card-desc">${escapeHtml(s.detail || '')}</div>
        </div>
      </div>
    `}).join('') + `</div>`;
  }

  container.innerHTML = `
    <div class="trace-module-container">
      <div class="trace-module-content">
        ${listHtml}
      </div>
      
      <!-- 地图选择绑定弹窗 -->
      <div class="trace-modal-mask is-hidden" id="trace-map-select-modal">
        <div class="trace-modal-panel">
          <div class="trace-modal-title">选择关联地图</div>
          <div class="trace-modal-field">
            <label class="trace-modal-label">为 AI 生成日程提供地点约束</label>
            <div id="trace-map-list-container" style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
              <!-- 动态插入地图列表 -->
              <div style="text-align:center;color:#999;font-size:12px;padding:10px;">加载中...</div>
            </div>
          </div>
          <div class="trace-modal-hint" id="trace-map-select-hint"></div>
          <div class="trace-modal-actions">
            <button class="trace-btn trace-btn-cancel" id="trace-map-select-cancel">取消</button>
            <button class="trace-btn trace-btn-confirm" id="trace-map-select-confirm">确认生成</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   [区域标注·本次需求·日程模块交互事件绑定]
   ========================================================================== */
export function bindScheduleEvents(shellContainer, container, state, context) {
  const generateBtn = shellContainer.querySelector('#trace-schedule-generate-btn');
  const mapModal = container.querySelector('#trace-map-select-modal');
  const cancelBtn = container.querySelector('#trace-map-select-cancel');
  const confirmBtn = container.querySelector('#trace-map-select-confirm');
  const mapListContainer = container.querySelector('#trace-map-list-container');
  const hintEl = container.querySelector('#trace-map-select-hint');

  let selectedMapId = state.boundMapId || null;
  let availableMaps = [];

  const openMapModal = async () => {
    if (!state.activeContactId) {
      showApiErrorModal(shellContainer, { title: '提示', message: '请先选择一个联系人' });
      return;
    }

    mapModal.classList.remove('is-hidden');
    hintEl.textContent = '';
    
    // 加载地图列表
    try {
      const mapData = await loadMapData(context.db);
      availableMaps = mapData.maps || [];
      if (availableMaps.length === 0) {
        mapListContainer.innerHTML = '<div style="text-align:center;color:#999;font-size:12px;padding:10px;">暂无可用地图，请先在地图应用中创建</div>';
      } else {
        mapListContainer.innerHTML = availableMaps.map(m => {
          const isSelected = m.id === selectedMapId ? 'background:#1a1a1a;color:#fff;' : 'background:#f5f5f5;color:#1a1a1a;';
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
  };

  const closeMapModal = () => {
    mapModal.classList.add('is-hidden');
  };

  generateBtn?.addEventListener('click', openMapModal);
  cancelBtn?.addEventListener('click', closeMapModal);
  mapModal?.addEventListener('click', (e) => {
    if (e.target === mapModal) closeMapModal();
  });

  confirmBtn?.addEventListener('click', async () => {
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

      // 2. 收集聊天记录（最近20条）
      const chatKey = `chat_messages_${state.activeMaskId}_${state.activeContactId}`;
      const chatRecord = await context.db.get('appsData', chatKey);
      const chatRecordsRaw = chatRecord ? (chatRecord.data || chatRecord.value || []) : [];
      const chatLines = chatRecordsRaw.slice(-20).map(msg => {
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

任务要求：
1. 请根据上述背景为你自己生成今天的日程表，必须在上述【已有地点】中选择活动场所，绝不允许虚构新地点！
2. 日程表固定生成 8 个时间段，每 2 小时一个时段，从 08:00 开始到次日 00:00 结束（即 08:00 - 10:00, 10:00 - 12:00, 12:00 - 14:00, 14:00 - 16:00, 16:00 - 18:00, 18:00 - 20:00, 20:00 - 22:00, 22:00 - 00:00）。
3. 时间安排必须符合生活常识，分清早中晚的合理作息（如不能白天睡觉晚上去学校），且要有一定的独立自主性，但也要参考【最近聊天参考】中的对话或约定来安排合适的活动（体现活人感）。
4. 严格输出为精简的 JSON 数组，包含以下字段：
  - time: 时间段（必须严格遵守格式，如 "08:00 - 10:00"）
  - location: 所在地点（必须是【已有地点】之一）
  - title: 正在做的事（小标题，不超过10字）
  - detail: 正在做的事（正文描述，详细版，50字以内）
5. 禁止生成违背人设（OOC）的行为！
6. 严格返回纯 JSON 数组，禁止任何 Markdown 标记、代码块标记（如 \`\`\`json）或任何多余的解释性文本。`;

      // 6. 调用 API
      const settingsRecord = await context.db.get('settings', 'settings');
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

      // 保存绑定关系和日程数据
      state.boundMapId = selectedMapId;
      state.schedules = parsedSchedules;

      await persistTraceData(context.db, state, state.activeMaskId, state.activeContactId);
      
      closeMapModal();
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
