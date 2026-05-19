// @ts-nocheck
/**
 * 文件名: js/apps/chat/chat-message-prompt-payload.js
 * 用途: 闲谈应用 — 聊天消息页 Prompt Payload 组装
 * 架构层: 应用层（闲谈子模块）
 *
 * 说明：
 * 1. 负责从 currentMessages 中提取“用户最新一轮消息”和短期记忆历史。
 * 2. 只做运行时请求上下文组装，不直接操作 DOM，不直接写入持久化存储。
 * 3. 数据最终仍由上层消息流通过 DB.js / IndexedDB 维护，不使用 localStorage/sessionStorage。
 */

/* ==========================================================================
   [区域标注·已完成·本次拆分] 用户最新一轮消息 Prompt Payload 组装子模块
   说明：
   1. 原 chat-message.js 中的 buildPromptPayloadForLatestUserRound 已拆分到本文件。
   2. 本文件只负责 AI 请求前的上下文整理、历史轮次切分、时间感知元数据计算。
   3. 不直接依赖聊天页 DOM，不直接执行持久化写入。
   4. 上层仍通过 facade 保持原导出名不变，避免影响既有调用方。
   ========================================================================== */
export function buildPromptPayloadForLatestUserRound(messages = [], shortTermMemoryRounds = 8) {
  const normalized = Array.isArray(messages)
    ? messages.filter(item => item && (item.role === 'user' || item.role === 'assistant') && String(item.content || '').trim())
    : [];

  let latestUserStart = -1;
  for (let i = normalized.length - 1; i >= 0; i -= 1) {
    if (normalized[i].role !== 'user') continue;
    latestUserStart = i;
    while (latestUserStart > 0 && normalized[latestUserStart - 1]?.role === 'user') {
      latestUserStart -= 1;
    }
    break;
  }

  /* 用户最新一轮消息 = 消息末尾往前连续的 user 消息组，而不是最后一条 user 消息 */
  let currentRoundMessages = latestUserStart >= 0 ? normalized.slice(latestUserStart).filter(item => item.role === 'user') : [];
  /* ========================================================================
     [区域标注·已完成·用户消息撤回] 最近撤回事件并入下一轮 AI 请求
     说明：
     1. 用户可能撤回较早位置的气泡，但撤回行为发生在当前时刻；下一轮 AI 仍必须收到这条撤回提示。
     2. withdrawnAt / timestamp 晚于最近 AI 消息的 user_withdraw_system 会并入 currentRoundMessages。
     3. 这里只组装请求上下文，不新增存储；消息对象仍随 currentMessages 写入 DB.js / IndexedDB。
     ======================================================================== */
  const latestAssistantTimestamp = normalized
    .filter(item => item.role === 'assistant')
    .reduce((max, item) => Math.max(max, Number(item?.timestamp || 0) || 0), 0);
  const currentRoundIdSet = new Set(currentRoundMessages.map(item => String(item?.id || '')).filter(Boolean));
  const recentWithdrawMessages = normalized
    .filter(item => (
      String(item?.type || '') === 'user_withdraw_system'
      && !currentRoundIdSet.has(String(item?.id || ''))
      && (Number(item?.withdrawnAt || item?.timestamp || 0) || 0) > latestAssistantTimestamp
    ));
  if (recentWithdrawMessages.length) {
    currentRoundMessages = [...currentRoundMessages, ...recentWithdrawMessages]
      .sort((a, b) => (Number(a?.timestamp || a?.withdrawnAt || 0) || 0) - (Number(b?.timestamp || b?.withdrawnAt || 0) || 0));
  }
  const latestUserMessage = [...currentRoundMessages].reverse().find(item => Number(item?.timestamp || 0) > 0)
    || [...normalized].reverse().find(item => item.role === 'user' && Number(item?.timestamp || 0) > 0)
    || null;
  const latestAnyMessage = [...normalized].reverse().find(item => Number(item?.timestamp || 0) > 0) || null;
  /* ========================================================================
     [AI撤回时间感知增强] 撤回系统小字发送给 AI 的文本规则
     说明：
     1. user_withdraw_system 必须把系统提示小字自身的发送时间传给 AI，避免 AI 把早上的撤回提示误认成当前刚发生。
     2. withdrawnVisibleToAi=false：只提示对方在指定时间撤回且你看不见原文，引导 AI 结合本轮 API 实际请求时间判断“刚才/之前”。
     3. withdrawnVisibleToAi=true：提示对方在指定时间撤回且你看得见原文，并附撤回原文；禁止默认使用“刚才/刚刚”。
     4. 该字段随 currentMessages 写入 DB.js / IndexedDB；本区只做请求上下文组装，不使用 localStorage/sessionStorage。
     ======================================================================== */
  const formatWithdrawSystemTipTimeForAi = (timestamp) => {
    const value = Number(timestamp || 0) || 0;
    if (!value) return '未知时间';
    const date = new Date(value);
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const getAiVisibleContentForMessage = (item = {}, options = {}) => {
    /* ========================================================================
       [区域标注·已完成·本次角色气泡拍拍AI上下文]
       说明：
       1. user_pat_system 显示层仍是系统提示小字，AI 请求层在这里补充解释。
       2. 明确告诉 AI：这是 QQ/微信式“拍一拍/戳一戳”社交软件互动，不是真实物理拍打。
       3. 仅增强运行时 Prompt Payload，不新增持久化存储，不使用 localStorage/sessionStorage。
       ======================================================================== */
    if (String(item?.type || '') === 'user_pat_system') {
      const visibleTip = String(item?.content || '').trim() || '你拍了拍对方';
      const roleName = String(item?.patRoleName || '对方').trim() || '对方';
      return `【系统提示小字】${visibleTip}\n请注意：这是一条类似 QQ/微信等社交软件里的“拍一拍/戳一戳”互动提示，不是真实物理上的拍打、触碰或现实动作。你正在扮演“${roleName}”，下一轮回复时请自然回应这次社交软件式拍一拍，不要把它误解成现实中的物理拍打。`;
    }

    if (String(item?.type || '') === 'user_withdraw_system') {
      const systemTipTime = formatWithdrawSystemTipTimeForAi(item.withdrawnAt || item.timestamp);
      const timeAwareInstruction = `【系统提示小字发送时间：${systemTipTime}】当前对话对象在上述时间撤回了一条消息。请务必把这个时间当作撤回系统提示小字发生的时间，并结合“本轮 API 实际请求时间”判断间隔；如果已经过去较久，不要说“刚才/刚刚撤回”，应改用“之前撤回的消息”等符合时间差的表达。`;
      const base = `${timeAwareInstruction}\n你看不见撤回原文。可用一句自然互动回应，例如“您之前撤回的消息我看到了，撤回了什么呀？”`;
      if (!item.withdrawnVisibleToAi) return base;
      const withdrawnText = String(item.withdrawnContent || '').trim();
      return withdrawnText ? `${timeAwareInstruction}\n你看得见撤回原文。若间隔较久，可用一句自然互动回应，例如“您之前撤回的消息我看到了”。\n撤回的消息内容：${withdrawnText}` : base;
    }
    if (String(item?.type || '') === 'gift') {
      /* ======================================================================
         [区域标注·已完成·礼物消息AI上下文摘要化]
         说明：
         1. 礼物代付请求在“当前轮用户消息”中保留完整请求文案，确保 AI 能理解是否代付。
         2. 礼物消息进入历史上下文后仅发送短摘要，避免重复携带长文造成 token 浪费。
         3. 仅处理 type=gift，不影响其它消息类型。
         ====================================================================== */
      const isHistorySummary = Boolean(options.historySummary);
      const giftRequestType = String(item?.giftRequestType || '').trim();
      if (isHistorySummary) {
        const title = String(item?.giftTitle || '礼物').trim();
        const priceLabel = String(item?.giftDisplayPrice || '').trim();
        const prefix = giftRequestType === 'pay_request' ? '[礼物代付请求]' : '[礼物]';
        return `${prefix} ${title}${priceLabel ? ` · ${priceLabel}` : ''}`;
      }
      return String(item?.giftAiPromptText || item?.content || '').trim();
    }
    return String(item.content || '').trim();
  };

  const userInput = currentRoundMessages.map((item, index) => {
    const content = getAiVisibleContentForMessage(item, { historySummary: false });
    return currentRoundMessages.length > 1 ? `第${index + 1}条：${content}` : content;
  }).join('\n');

  const roundLimit = Math.max(0, Math.floor(Number(shortTermMemoryRounds)) || 0);
  const currentRoundMessageIds = new Set(currentRoundMessages.map(item => String(item?.id || '')).filter(Boolean));
  const previous = (latestUserStart >= 0 ? normalized.slice(0, latestUserStart) : normalized)
    .filter(item => !currentRoundMessageIds.has(String(item?.id || '')));

  /* ========================================================================
     [区域标注·已完成·需求1·控制台轮次统计元数据]
     说明：
     1. conversationRoundIndex 按“连续 user 消息组 = 1 轮”统计当前会话总用户轮次，用于控制台显示真正聊到第几轮。
     2. currentRoundMessageCount 仅表示本轮用户连续发送的消息条数，以及被并入本轮的撤回系统提示条数。
     3. 本区域只返回运行时日志元数据，不新增持久化存储，不改变 history/currentUserRoundMessages 的 AI 请求内容。
     ======================================================================== */
  const countUserConversationRounds = (items = []) => {
    let count = 0;
    let previousRole = '';
    (Array.isArray(items) ? items : []).forEach(item => {
      if (item?.role === 'user' && previousRole !== 'user') count += 1;
      previousRole = String(item?.role || '');
    });
    return count;
  };
  const conversationRoundIndex = countUserConversationRounds(normalized);
  const currentRoundMessageCount = currentRoundMessages.length;

  /* ========================================================================
     [区域标注·已完成·本次时间断层强化] 时间感知运行时上下文
     说明：
     1. 即使短期记忆轮数为 0，也继续把必要时间戳随本次 API 请求传给 prompt.js，不额外持久化。
     2. currentUserRound* 表示用户本轮实际回复时间；previousLatest* 表示排除本轮用户消息后的上一段聊天时间。
     3. previousLatestAssistantTimestamp 专门用于判断“上一轮 AI 凌晨回复 → 用户早上才回”的真实跨度，避免 AI 继续停留在凌晨语境劝睡。
     4. 本区只做运行时计算，不使用 localStorage/sessionStorage，不写双份存储兜底。
     ======================================================================== */
  const previousLatestAnyMessage = [...previous].reverse().find(item => Number(item?.timestamp || 0) > 0) || null;
  const previousLatestUserMessage = [...previous].reverse().find(item => item.role === 'user' && Number(item?.timestamp || 0) > 0) || null;
  const previousLatestAssistantMessage = [...previous].reverse().find(item => item.role === 'assistant' && Number(item?.timestamp || 0) > 0) || null;
  const currentRoundTimestamps = currentRoundMessages
    .map(item => Number(item?.timestamp || 0) || 0)
    .filter(Boolean);
  const conversationTimeContext = {
    latestUserTimestamp: Number(latestUserMessage?.timestamp || 0) || 0,
    latestAnyTimestamp: Number(latestAnyMessage?.timestamp || 0) || 0,
    currentUserRoundFirstTimestamp: currentRoundTimestamps.length ? Math.min(...currentRoundTimestamps) : 0,
    currentUserRoundLastTimestamp: currentRoundTimestamps.length ? Math.max(...currentRoundTimestamps) : 0,
    previousLatestAnyTimestamp: Number(previousLatestAnyMessage?.timestamp || 0) || 0,
    previousLatestUserTimestamp: Number(previousLatestUserMessage?.timestamp || 0) || 0,
    previousLatestAssistantTimestamp: Number(previousLatestAssistantMessage?.timestamp || 0) || 0
  };
  const currentUserRoundMessages = currentRoundMessages.map(item => {
    /* ======================================================================
       [区域标注·已完成·本次修改·系统提示小字AI可见但不可引用]
       说明：
       1. 普通用户消息继续把 id 传给 prompt.js，AI 可用 [引用] 协议引用用户最新一轮消息。
       2. user_pat_system / user_withdraw_system 等系统提示小字继续发送给 AI 阅读，但不暴露可引用 ID，禁止 AI 对系统小字作引用回复。
       3. 本区只调整运行时 Prompt Payload，不新增存储，不使用 localStorage/sessionStorage。
       ====================================================================== */
    const messageType = String(item?.type || '').trim();
    const isSystemTipMessage = /_system$/.test(messageType) || ['transfer_system', 'html_card_interaction_system'].includes(messageType);
    return {
      id: isSystemTipMessage ? '' : (item.id || ''),
      role: item.role,
      content: getAiVisibleContentForMessage(item, { historySummary: false }),
      quote: item.quote || null,
      type: item.type || '',
      stickerUrl: item.stickerUrl || '',
      stickerName: item.stickerName || '',
      imageUrl: item.imageUrl || '',
      imageName: item.imageName || '',
      timestamp: Number(item.timestamp || 0) || 0
    };
  });

  if (roundLimit <= 0) {
    return {
      userInput,
      history: [],
      currentUserRoundMessages,
      conversationTimeContext,
      /* [区域标注·已完成·需求1·短期记忆为0时日志元数据] 仅供控制台展示，不影响 AI 请求历史内容。 */
      conversationRoundIndex,
      currentRoundMessageCount,
      historyRoundCount: 0,
      historyMessageCount: 0
    };
  }

  const toHistoryPromptItem = (item = {}) => {
    /* ======================================================================
       [区域标注·已完成·本次修改·历史系统提示小字AI可见但不可引用]
       说明：
       1. 普通历史消息继续把 id 传给 prompt.js，AI 可用 [引用] 协议引用短期记忆范围内的普通消息。
       2. 历史里的 user_pat_system / user_withdraw_system 等系统提示小字继续发送给 AI 阅读，但不暴露可引用 ID。
       3. 与 currentUserRoundMessages 保持一致：系统提示小字“只能看，不能引用回复”。
       4. 本区只调整运行时 Prompt Payload，不新增存储，不使用 localStorage/sessionStorage。
       ====================================================================== */
    const messageType = String(item?.type || '').trim();
    const isSystemTipMessage = /_system$/.test(messageType) || ['transfer_system', 'html_card_interaction_system'].includes(messageType);
    return {
      id: isSystemTipMessage ? '' : (item.id || ''),
      role: item.role,
      content: getAiVisibleContentForMessage(item, { historySummary: true }),
      quote: item.quote || null,
      type: item.type || '',
      stickerUrl: item.stickerUrl || '',
      stickerName: item.stickerName || '',
      imageUrl: item.imageUrl || '',
      imageName: item.imageName || '',
      /* [区域标注·已修改] 历史消息保留发送时间，供时间感知把“昨天/明天/后天”等相对时间锚定到原消息时间。 */
      timestamp: Number(item.timestamp || 0) || 0
    };
  };

  /* ========================================================================
     [区域标注·已完成·本次短期记忆按轮截取修复] 历史消息按真实对话轮分组
     说明：
     1. 一轮 = 连续用户消息组 + 随后 AI 返回消息组；用户连续发多条不拆轮，AI 多气泡回复也不拆轮。
     2. 短期记忆设置 shortTermMemoryRounds 表示“历史轮数”，不是“历史消息条数”。
     3. 这里先按轮选择最近 N 轮，再展开为 prompt.js/API 需要的扁平 messages 数组。
     4. 本区只处理运行时请求上下文，不新增持久化存储，不使用 localStorage/sessionStorage。
     ======================================================================== */
  const rounds = [];
  let current = [];
  let currentHasAssistantMessages = false;

  previous.forEach(item => {
    if (item.role === 'user' && current.length && currentHasAssistantMessages) {
      rounds.push(current);
      current = [];
      currentHasAssistantMessages = false;
    }

    current.push(toHistoryPromptItem(item));

    if (item.role === 'assistant') {
      currentHasAssistantMessages = true;
    }
  });
  if (current.length) rounds.push(current);

  /* ========================================================================
     [区域标注·已完成·本次短期记忆按轮截取修复] 短期记忆日志统计
     说明：
     1. selectedHistoryRounds 是本次短期记忆实际携带的历史轮次数组，historyRoundCount 按“轮”统计。
     2. historyMessageCount 按最终展开后的 history 消息条数统计，仅用于排查 token 与气泡拆分数量。
     3. 发送给 AI 时仍是扁平 messages 数组，但截取边界已按“最近 N 轮历史”计算，不再按 N 条消息卡掉早期轮次。
     ======================================================================== */
  const selectedHistoryRounds = rounds.slice(-roundLimit);
  const selectedHistoryMessages = selectedHistoryRounds.flat();

  return {
    userInput,
    history: selectedHistoryMessages,
    currentUserRoundMessages,
    conversationTimeContext,
    conversationRoundIndex,
    currentRoundMessageCount,
    historyRoundCount: selectedHistoryRounds.length,
    historyMessageCount: selectedHistoryMessages.length
  };
}
