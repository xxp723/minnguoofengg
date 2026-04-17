import { Logger } from '../../utils/Logger.js';

export function renderApiSection({ current }) {
  return `
      <!-- API设置详情页 -->
      <div id="settings-api" class="settings-detail">
        <div class="settings-detail__body">
          <section class="ui-card">
            <h3>生图API</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">配置文生图接口</p>
            <div style="display:grid;gap:10px;">
              <input id="api-image-url" type="text" placeholder="生图 API Base URL" value="${current.api?.textToImage?.baseUrl || ''}">
              <input id="api-image-key" type="text" placeholder="生图 API Key" value="${current.api?.textToImage?.apiKey || ''}">
            </div>
          </section>
          <section class="ui-card">
            <h3>MiniMax TTS</h3>
            <p class="ui-muted" style="margin-bottom: 10px;">配置语音合成接口</p>
            <div style="display:grid;gap:10px;">
              <input id="api-tts-url" type="text" placeholder="MiniMax TTS Base URL" value="${current.api?.minimaxTTS?.baseUrl || ''}">
              <input id="api-tts-key" type="text" placeholder="MiniMax TTS API Key" value="${current.api?.minimaxTTS?.apiKey || ''}">
            </div>
          </section>
          <button class="ui-button primary" id="save-api" style="width: 100%; margin-top: 10px;">保存 API 设置</button>
        </div>
      </div>
  `;
}

export function bindApiEvents(container, { settings }) {
  const onSaveApi = async () => {
    const imageUrl = container.querySelector('#api-image-url')?.value || '';
    const imageKey = container.querySelector('#api-image-key')?.value || '';
    const ttsUrl = container.querySelector('#api-tts-url')?.value || '';
    const ttsKey = container.querySelector('#api-tts-key')?.value || '';

    await settings.update({
      api: {
        textToImage: { baseUrl: imageUrl, apiKey: imageKey },
        minimaxTTS: { baseUrl: ttsUrl, apiKey: ttsKey, voiceId: '' }
      }
    });

    Logger.info('API 设置已保存');
  };

  container.querySelector('#save-api')?.addEventListener('click', onSaveApi);
}
