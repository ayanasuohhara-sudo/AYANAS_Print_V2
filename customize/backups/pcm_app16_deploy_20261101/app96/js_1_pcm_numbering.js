(function() {
  'use strict';

  /**
   * PCM 個人顧客ID採番 — カウンタ App + revision 排他
   * カウンタ更新と PCM 保存は別トランザクション（欠番許容）。
   */

  const cfg = () => {
    if (typeof window.CAYANAS_PCM === 'undefined') {
      throw new Error('[pcm_numbering] pcm_config.js を先に読み込んでください。');
    }
    return window.CAYANAS_PCM;
  };

  const padSeq = (seq, width) => {
    const n = Number(seq);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('採番シーケンスが不正です: ' + seq);
    }
    return String(Math.floor(n)).padStart(width, '0');
  };

  const formatPersonalCustomerId = (seq) => {
    const C = cfg();
    return C.ID_PREFIX + padSeq(seq, C.ID_PAD);
  };

  const escapeQuery = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const fetchCounterRecord = async () => {
    const C = cfg();
    if (!C.COUNTER_APP_ID) {
      throw new Error('COUNTER_APP_ID が未設定です。アプリ作成後に pcm_config.js を更新してください。');
    }

    const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
      app: C.COUNTER_APP_ID,
      query: C.COUNTER_FIELDS.counterKey + ' = "' + escapeQuery(C.COUNTER_KEY) + '" limit 1',
      fields: ['$id', '$revision', C.COUNTER_FIELDS.counterKey, C.COUNTER_FIELDS.nextSeq],
    });

    const record = (resp.records || [])[0];
    if (!record) {
      throw new Error('採番カウンタレコードがありません（counter_key=' + C.COUNTER_KEY + '）。');
    }

    return record;
  };

  /**
   * @returns {Promise<{ personalCustomerId: string, seq: number }>}
   */
  const allocateNextPersonalCustomerId = async () => {
    const C = cfg();
    let lastError = null;

    for (let attempt = 0; attempt < C.NUMBERING_MAX_RETRY; attempt += 1) {
      try {
        const counter = await fetchCounterRecord();
        const id = String(counter.$id.value);
        const revision = String(counter.$revision.value);
        const nextSeq = Number(counter[C.COUNTER_FIELDS.nextSeq].value);
        const personalCustomerId = formatPersonalCustomerId(nextSeq);

        await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
          app: C.COUNTER_APP_ID,
          id: id,
          revision: revision,
          record: {
            [C.COUNTER_FIELDS.nextSeq]: { value: String(nextSeq + 1) },
          },
        });

        return { personalCustomerId: personalCustomerId, seq: nextSeq };
      } catch (err) {
        lastError = err;
        const code = err && err.code;
        /* CB_VA01 等 revision 不一致、または同時更新 */
        const retryable = code === 'CB_VA01'
          || code === 'GAIA_RE01'
          || /revision|改訂|排他|同時/i.test(String(err && err.message));

        if (!retryable || attempt === C.NUMBERING_MAX_RETRY - 1) {
          break;
        }
      }
    }

    const detail = lastError && lastError.message ? lastError.message : String(lastError);
    throw new Error('個人顧客IDの採番に失敗しました（再試行上限）。' + detail);
  };

  const isValidPersonalCustomerId = (value) => cfg().ID_PATTERN.test(String(value ?? '').trim());

  window.CAYANAS_PCM_Numbering = {
    formatPersonalCustomerId: formatPersonalCustomerId,
    allocateNextPersonalCustomerId: allocateNextPersonalCustomerId,
    isValidPersonalCustomerId: isValidPersonalCustomerId,
    fetchCounterRecord: fetchCounterRecord,
  };
}());
