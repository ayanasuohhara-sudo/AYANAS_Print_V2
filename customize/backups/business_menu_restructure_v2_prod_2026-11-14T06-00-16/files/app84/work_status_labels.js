(function () {
    'use strict';

    /**
     * App16 work_status 正本ラベルと移行中の読み取り互換。
     * 書き込みは常に CANONICAL / WRITE 側。読み取りは ALIASES 経由で正規化。
     */

    const WORK_STATUS_LABELS_VERSION = '1.0.0';

    /** 最終 9 項目（表示順） */
    const OPTIONS = [
        '未着',
        '問合せ・見積り',
        '丸洗い待ち',
        '丸洗い中・乾燥',
        'しみ抜き中',
        '修理中',
        '再直し中',
        '仕上げ中',
        '仕上げ完了',
    ];

    /** App84 手動選択（仕上げ完了は App30） */
    const APP84_SELECT_OPTIONS = OPTIONS.filter((label) => label !== '仕上げ完了');

    const LABELS = {
        notArrived: '未着',
        inquireEstimate: '問合せ・見積り',
        maruWait: '丸洗い待ち',
        maruInProgress: '丸洗い中・乾燥',
        shimiInProgress: 'しみ抜き中',
        repairInProgress: '修理中',
        reworkInProgress: '再直し中',
        finishInProgress: '仕上げ中',
        finishDone: '仕上げ完了',
    };

    /**
     * 旧値 → 正本。移行期間の dual-read 用。
     * データ自体は勝手に書き換えない（読み取り正規化のみ）。
     */
    const READ_ALIASES = {
        '未着手': LABELS.notArrived,
        '振り分け待ち': LABELS.notArrived,
        '未着': LABELS.notArrived,
        '問合せ・見積り': LABELS.inquireEstimate,
        '丸洗い待ち': LABELS.maruWait,
        '丸洗い中': LABELS.maruInProgress,
        '丸洗い中・乾燥': LABELS.maruInProgress,
        'しみ抜き待ち': LABELS.shimiInProgress,
        'しみ抜き中': LABELS.shimiInProgress,
        '修理中': LABELS.repairInProgress,
        '再直し中': LABELS.reworkInProgress,
        '仕上げ待ち': LABELS.finishInProgress,
        '仕上げ中': LABELS.finishInProgress,
        '仕上げ完了': LABELS.finishDone,
    };

    const norm = (value) => String(value ?? '').trim();

    const normalize = (value) => {

        const raw = norm(value);

        if (!raw) {
            return '';
        }

        return READ_ALIASES[raw] || raw;

    };

    const equals = (left, right) => normalize(left) === normalize(right);

    const isCanonicalOption = (value) => OPTIONS.indexOf(norm(value)) >= 0;

    const CAYANAS_WORK_STATUS = {
        VERSION: WORK_STATUS_LABELS_VERSION,
        OPTIONS,
        APP84_SELECT_OPTIONS,
        LABELS,
        READ_ALIASES,
        normalize,
        equals,
        isCanonicalOption,
        norm,
    };

    window.CAYANAS_WORK_STATUS = CAYANAS_WORK_STATUS;
    window.CAYANAS_WORK_STATUS_VERSION = WORK_STATUS_LABELS_VERSION;

}());
