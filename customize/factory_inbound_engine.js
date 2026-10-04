(function () {
    'use strict';

    /**
     * 工場入庫 — 判定ロジック（kintone 非依存）
     */

    const assertConfig = () => {

        if (typeof CAYANAS_FACTORY_INBOUND === 'undefined') {
            throw new Error('CAYANAS_FACTORY_INBOUND が未読込です。');
        }

    };

    const CFG = () => CAYANAS_FACTORY_INBOUND;

    /**
     * @param {string} fromLocation 現在の location_status
     * @param {{ hasMaruarai: boolean, unresolvedCount: number }} lineAnalysis
     * @returns {{ action: 'put'|'reject', workStatus?: string, code?: string, message?: string }}
     */
    const planFactoryInbound = (fromLocation, lineAnalysis) => {

        assertConfig();

        const loc = String(fromLocation ?? '').trim();
        const L = CFG().LOCATION;
        const W = CFG().WORK;

        if (loc === L.factory) {
            return {
                action: 'reject',
                code: 'already_factory',
                message: 'この商品はすでに工場にあります。作業ステータスは変更しません。',
            };
        }

        if (CFG().BLOCKED_SOURCE_LOCATIONS.indexOf(loc) >= 0) {
            return {
                action: 'reject',
                code: 'blocked_source',
                message:
                    '現在地が「' + loc + '」のため、工場入庫（V1）の対象外です。\n'
                    + '外注・海外・和裁士戻りは App78（総合入庫）→ 本社 のルートをご利用ください。',
            };
        }

        if (CFG().ALLOWED_SOURCE_LOCATIONS.indexOf(loc) < 0) {
            return {
                action: 'reject',
                code: 'unknown_source',
                message:
                    '現在地「' + (loc || '（空欄）') + '」からの工場入庫は V1 では未対応です。\n'
                    + '店舗または本社からの入庫のみ自動処理できます。',
            };
        }

        if (loc === L.hq) {
            return {
                action: 'put',
                workStatus: W.sortPending,
                maruaraiNote: '',
            };
        }

        if (loc === L.store) {
            const unresolved = Number(lineAnalysis?.unresolvedCount ?? 0);

            if (unresolved > 0) {
                return {
                    action: 'reject',
                    code: 'unresolved_lines',
                    message:
                        '加工明細の商品が App13 で特定できません（' + unresolved + ' 行）。\n'
                        + '丸洗いの有無を安全に判定できないため、工場入庫を中止しました。\n'
                        + '商品マスタ（App13）または明細の商品コードを確認してください。',
                };
            }

            const hasMaruarai = Boolean(lineAnalysis?.hasMaruarai);

            return {
                action: 'put',
                workStatus: hasMaruarai ? W.maruWait : W.finishWait,
                maruaraiNote: hasMaruarai ? '丸洗いあり' : '丸洗いなし',
            };
        }

        return {
            action: 'reject',
            code: 'unknown_source',
            message: '工場入庫を実行できません。',
        };

    };

    const formatProcessingSummary = (lineSummaries) => {

        const lines = lineSummaries || [];

        if (lines.length === 0) {
            return '（加工明細なし）';
        }

        return lines.map((line) => {

            const name = String(line.itemName || line.itemCode || '—').trim();
            const sub = String(line.subcategory ?? '').trim();

            if (line.unresolved) {
                return name + '（App13未特定）';
            }

            if (sub) {
                return name + ' [' + sub + ']';
            }

            return name;

        }).join(' / ');

    };

    window.CAYANAS_FactoryInboundEngine = {
        planFactoryInbound,
        formatProcessingSummary,
    };

}());
