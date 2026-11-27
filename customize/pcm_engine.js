(function() {
  'use strict';

  /**
   * PCM 検索・類似候補（自動統合なし）
   */

  const cfg = () => {
    if (typeof window.CAYANAS_PCM === 'undefined') {
      throw new Error('[pcm_engine] pcm_config.js を先に読み込んでください。');
    }
    return window.CAYANAS_PCM;
  };

  const escapeQuery = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const readValue = (record, code) => {
    const field = record && record[code];
    if (!field || field.value === null || field.value === undefined) {
      return '';
    }
    return String(field.value).trim();
  };

  const normalizePhone = (value) => String(value ?? '').replace(/[^\d]/g, '');

  const buildLikeClause = (fieldCode, keyword) => {
    const q = String(keyword ?? '').trim();
    if (!q) {
      return '';
    }
    return fieldCode + ' like "' + escapeQuery(q) + '"';
  };

  /**
   * 一覧検索クエリ。空キーワードは空文字を返す。
   * @param {{ personalCustomerId?: string, customerName?: string, customerKana?: string, phone?: string, mobilePhone?: string, memberNo?: string }} criteria
   */
  const buildSearchQuery = (criteria) => {
    const C = cfg();
    const F = C.FIELDS;
    const parts = [];
    const c = criteria || {};

    const id = String(c.personalCustomerId ?? '').trim();
    if (id) {
      parts.push(F.personalCustomerId + ' like "' + escapeQuery(id) + '"');
    }

    const nameClause = buildLikeClause(F.customerName, c.customerName);
    if (nameClause) {
      parts.push(nameClause);
    }

    const kanaClause = buildLikeClause(F.customerKana, c.customerKana);
    if (kanaClause) {
      parts.push(kanaClause);
    }

    const phone = String(c.phone ?? '').trim();
    if (phone) {
      parts.push(F.phone + ' like "' + escapeQuery(phone) + '"');
    }

    const mobile = String(c.mobilePhone ?? '').trim();
    if (mobile) {
      parts.push(F.mobilePhone + ' like "' + escapeQuery(mobile) + '"');
    }

    const memberNo = String(c.memberNo ?? '').trim();
    if (memberNo) {
      parts.push(F.memberNo + ' like "' + escapeQuery(memberNo) + '"');
    }

    if (parts.length === 0) {
      return '';
    }

    return '(' + parts.join(' or ') + ') order by ' + F.personalCustomerId + ' asc limit 50';
  };

  const searchCustomers = async (criteria) => {
    const C = cfg();
    if (!C.PCM_APP_ID) {
      throw new Error('PCM_APP_ID が未設定です。');
    }

    const query = buildSearchQuery(criteria);
    if (!query) {
      return [];
    }

    const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
      app: C.PCM_APP_ID,
      query: query,
    });

    return resp.records || [];
  };

  /**
   * 新規登録時の類似候補（自動統合しない）。
   * 氏名・かな・電話のいずれかが近いレコードを列挙。
   */
  const findSimilarCandidates = async (draftRecord, excludeRecordId) => {
    const C = cfg();
    const F = C.FIELDS;
    const name = readValue(draftRecord, F.customerName);
    const kana = readValue(draftRecord, F.customerKana);
    const phone = readValue(draftRecord, F.phone);
    const mobile = readValue(draftRecord, F.mobilePhone);

    const clauses = [];
    if (name) {
      clauses.push(F.customerName + ' like "' + escapeQuery(name) + '"');
    }
    if (kana) {
      clauses.push(F.customerKana + ' like "' + escapeQuery(kana) + '"');
    }
    if (phone) {
      clauses.push(F.phone + ' like "' + escapeQuery(phone) + '"');
    }
    if (mobile) {
      clauses.push(F.mobilePhone + ' like "' + escapeQuery(mobile) + '"');
    }

    if (clauses.length === 0) {
      return [];
    }

    const query = '(' + clauses.join(' or ') + ') order by ' + F.personalCustomerId + ' asc limit 20';
    const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
      app: C.PCM_APP_ID,
      query: query,
    });

    const exclude = String(excludeRecordId ?? '').trim();
    const draftPhoneNorm = normalizePhone(phone || mobile);

    return (resp.records || []).filter(function(rec) {
      if (exclude && String(rec.$id.value) === exclude) {
        return false;
      }

      const recName = readValue(rec, F.customerName);
      const recKana = readValue(rec, F.customerKana);
      const recPhone = normalizePhone(readValue(rec, F.phone) + readValue(rec, F.mobilePhone));

      if (name && recName && recName.indexOf(name) >= 0) {
        return true;
      }
      if (name && recName && name.indexOf(recName) >= 0) {
        return true;
      }
      if (kana && recKana && (recKana.indexOf(kana) >= 0 || kana.indexOf(recKana) >= 0)) {
        return true;
      }
      if (draftPhoneNorm.length >= 4 && recPhone.indexOf(draftPhoneNorm) >= 0) {
        return true;
      }
      if (draftPhoneNorm.length >= 4 && draftPhoneNorm.indexOf(recPhone) >= 0 && recPhone.length >= 4) {
        return true;
      }

      return false;
    });
  };

  const formatCandidateLine = (record) => {
    const C = cfg();
    const F = C.FIELDS;
    return [
      readValue(record, F.personalCustomerId) || '(ID未採番)',
      readValue(record, F.customerName),
      readValue(record, F.customerKana),
      readValue(record, F.phone) || readValue(record, F.mobilePhone),
      [
        readValue(record, F.prefecture),
        readValue(record, F.city),
        readValue(record, F.addressLine),
      ].filter(Boolean).join(''),
    ].filter(Boolean).join(' / ');
  };

  const recordDetailUrl = (recordId) => {
    const C = cfg();
    return '/k/' + C.PCM_APP_ID + '/show#record=' + encodeURIComponent(String(recordId));
  };

  window.CAYANAS_PCM_Engine = {
    buildSearchQuery: buildSearchQuery,
    searchCustomers: searchCustomers,
    findSimilarCandidates: findSimilarCandidates,
    formatCandidateLine: formatCandidateLine,
    recordDetailUrl: recordDetailUrl,
    readValue: readValue,
    normalizePhone: normalizePhone,
  };
}());
