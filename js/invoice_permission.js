(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * invoice_permission.js
     *
     * 請求書作成アプリの操作権限チェック。
     * V1.0: kintone アプリのアクセス権（getPermissions）のみ利用する。
     */

    const InvoicePermission = {};

    const PERMISSION_DENIED_MESSAGE = 'この操作を実行する権限がありません。';

    const EDITABLE_STATUS = () => (
        typeof InvoiceCreate !== 'undefined'
            ? InvoiceCreate.INVOICE_STATUS_CREATING
            : '作成中'
    );

    const CONFIRMED_STATUS = () => (
        typeof InvoiceCreate !== 'undefined'
            ? InvoiceCreate.INVOICE_STATUS_CONFIRMED
            : '確定'
    );

    let appPermissionsCache = null;
    let appPermissionsPromise = null;

    const defaultAppPermissions = () => ({
        addRecord: true,
        editRecord: true,
        deleteRecord: true,
    });

    const defaultRecordPermissions = () => ({
        editRecord: true,
        deleteRecord: true,
    });

    InvoicePermission.PERMISSION_DENIED_MESSAGE = PERMISSION_DENIED_MESSAGE;

    InvoicePermission.getAppPermissions = async () => {

        if (appPermissionsCache) {
            return appPermissionsCache;
        }

        if (!appPermissionsPromise) {

            if (typeof kintone === 'undefined' || typeof kintone.app?.getPermissions !== 'function') {
                appPermissionsCache = defaultAppPermissions();
                return appPermissionsCache;
            }

            appPermissionsPromise = kintone.app.getPermissions()
                .then((permissions) => {
                    appPermissionsCache = permissions || defaultAppPermissions();
                    return appPermissionsCache;
                })
                .catch((error) => {
                    console.warn('[AYANAS Invoice Permission] app permissions fallback', error);
                    appPermissionsCache = defaultAppPermissions();
                    return appPermissionsCache;
                });

        }

        return appPermissionsPromise;

    };

    InvoicePermission.getRecordPermissions = async () => {

        if (typeof kintone === 'undefined' || typeof kintone.app?.record?.getPermissions !== 'function') {
            return defaultRecordPermissions();
        }

        try {
            return await kintone.app.record.getPermissions();
        } catch (error) {
            console.warn('[AYANAS Invoice Permission] record permissions fallback', error);
            return defaultRecordPermissions();
        }

    };

    InvoicePermission.getInvoiceStatus = (record) => {

        const fieldCode = typeof InvoiceCreate !== 'undefined'
            ? InvoiceCreate.INVOICE_FIELDS.invoiceStatus
            : 'invoice_status';

        const field = record?.[fieldCode];

        return String(field?.value ?? '').trim();

    };

    InvoicePermission.isEditableStatus = (record) => (
        InvoicePermission.getInvoiceStatus(record) === EDITABLE_STATUS()
    );

    InvoicePermission.canAddRecord = async () => {
        const permissions = await InvoicePermission.getAppPermissions();
        return Boolean(permissions.addRecord);
    };

    /** 請求確定・取消・一括作成（アプリ編集権限 = 経理/管理者） */
    InvoicePermission.canManageInvoice = async () => {
        const permissions = await InvoicePermission.getAppPermissions();
        return Boolean(permissions.editRecord);
    };

    InvoicePermission.canDeleteRecord = async () => {
        const permissions = await InvoicePermission.getAppPermissions();
        return Boolean(permissions.deleteRecord);
    };

    InvoicePermission.canEditCurrentRecord = async (record) => {

        if (!InvoicePermission.isEditableStatus(record)) {
            return false;
        }

        const permissions = await InvoicePermission.getRecordPermissions();

        return Boolean(permissions.editRecord);

    };

    InvoicePermission.canUseImportButtons = async (record, recordId) => {

        if (!recordId) {
            return InvoicePermission.canAddRecord();
        }

        return InvoicePermission.canEditCurrentRecord(record);

    };

    InvoicePermission.assertAddRecord = async () => {

        if (!(await InvoicePermission.canAddRecord())) {
            throw new Error(PERMISSION_DENIED_MESSAGE);
        }

    };

    InvoicePermission.assertManageInvoice = async () => {

        if (!(await InvoicePermission.canManageInvoice())) {
            throw new Error(PERMISSION_DENIED_MESSAGE);
        }

    };

    InvoicePermission.assertEditCurrentRecord = async (record) => {

        if (!(await InvoicePermission.canEditCurrentRecord(record))) {
            throw new Error(PERMISSION_DENIED_MESSAGE);
        }

    };

    InvoicePermission.assertConfirm = async (record) => {

        await InvoicePermission.assertManageInvoice();

        const status = InvoicePermission.getInvoiceStatus(record);

        if (status === CONFIRMED_STATUS()) {
            throw new Error('この請求書は既に確定済みです。');
        }

        if (status !== EDITABLE_STATUS()) {
            throw new Error(PERMISSION_DENIED_MESSAGE);
        }

    };

    InvoicePermission.assertVoid = async (record) => {

        await InvoicePermission.assertManageInvoice();

        const status = InvoicePermission.getInvoiceStatus(record);

        if (status === CONFIRMED_STATUS()) {
            throw new Error('請求済のため取消できません。');
        }

        if (status !== EDITABLE_STATUS()) {
            throw new Error(PERMISSION_DENIED_MESSAGE);
        }

    };

    InvoicePermission.assertEditSubmit = async (record) => {

        const permissions = await InvoicePermission.getRecordPermissions();

        if (!permissions.editRecord) {
            throw new Error(PERMISSION_DENIED_MESSAGE);
        }

        if (!InvoicePermission.isEditableStatus(record)) {
            throw new Error(PERMISSION_DENIED_MESSAGE);
        }

    };

    InvoicePermission.getActionOptions = async (record, recordId) => {

        const hasRecord = Boolean(recordId);
        const status = InvoicePermission.getInvoiceStatus(record);
        const isCreating = status === EDITABLE_STATUS();
        const [canImport, canManage] = await Promise.all([
            InvoicePermission.canUseImportButtons(record, recordId),
            InvoicePermission.canManageInvoice(),
        ]);

        return {
            includeImport: canImport,
            includeCreate: canImport,
            includeConfirm: hasRecord && isCreating && canManage,
            includeCancel: hasRecord && isCreating && canManage,
        };

    };

    window.InvoicePermission = InvoicePermission;

})();
