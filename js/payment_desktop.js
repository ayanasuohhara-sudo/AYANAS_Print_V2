(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * payment_desktop.js
     *
     * 入金管理アプリ（App 36）画面イベント。
     */

    const isPaymentApp = () => {

        if (typeof PaymentCreate === 'undefined') {
            return false;
        }

        return kintone.app.getId() === PaymentCreate.getPaymentAppId();

    };

    const getFields = () => PaymentCreate.PAYMENT_FIELDS;

    const getFieldValue = (record, fieldCode) => {

        const field = record?.[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const toNumber = (value) => {

        if (value === null || value === '' || value === undefined) {
            return 0;
        }

        const number = Number(value);

        return Number.isNaN(number) ? 0 : number;

    };

    const handleInvoiceNoChange = async (event) => {

        const fields = getFields();
        const invoiceNo = String(getFieldValue(event.record, fields.invoiceNo) ?? '').trim();

        if (!invoiceNo) {
            return event;
        }

        try {

            const currentPayment = toNumber(getFieldValue(event.record, fields.paymentAmount));
            const fee = toNumber(getFieldValue(event.record, fields.fee));
            const paymentData = await PaymentCreate.loadInvoiceForPayment(invoiceNo, currentPayment);

            event.record[fields.customerCode].value = paymentData.header.customer_code;
            event.record[fields.customerName].value = paymentData.header.customer_name;
            event.record[fields.detailTable].value = PaymentCreate.toPaymentDetailFieldValue(
                paymentData.detail
            ).value;
            event.record[fields.receivedAmount].value = PaymentCreate.calculateReceivedAmount(
                currentPayment,
                fee
            );

        } catch (error) {

            console.error('[AYANAS Payment]', error);

            const message = error instanceof Error
                ? error.message
                : '請求書情報の取得に失敗しました。';

            event.error = message;

        }

        return event;

    };

    const handleAmountChange = async (event) => {

        const fields = getFields();
        const invoiceNo = String(getFieldValue(event.record, fields.invoiceNo) ?? '').trim();

        if (!invoiceNo) {
            return event;
        }

        const paymentAmount = toNumber(getFieldValue(event.record, fields.paymentAmount));
        const fee = toNumber(getFieldValue(event.record, fields.fee));

        try {

            const paymentData = await PaymentCreate.loadInvoiceForPayment(invoiceNo, paymentAmount);

            event.record[fields.receivedAmount].value = PaymentCreate.calculateReceivedAmount(
                paymentAmount,
                fee
            );
            event.record[fields.detailTable].value = PaymentCreate.toPaymentDetailFieldValue(
                paymentData.detail
            ).value;

        } catch (error) {

            console.error('[AYANAS Payment]', error);

        }

        return event;

    };

    const handleSubmitSuccess = async (event) => {

        if (!isPaymentApp()) {
            return event;
        }

        try {

            const fields = getFields();
            const invoiceNo = String(getFieldValue(event.record, fields.invoiceNo) ?? '').trim();
            const result = await PaymentCreate.syncInvoicePayment(invoiceNo);

            console.log('[AYANAS Payment] 請求書更新', result);

            alert(
                '入金を登録し、請求書を更新しました。\n\n'
                + `請求番号: ${result.invoiceNo}\n`
                + `累計入金額: ${result.totalPaid.toLocaleString()} 円\n`
                + `売掛残高: ${result.accountsReceivable.toLocaleString()} 円\n`
                + `入金状況: ${result.paymentStatus}`
            );

        } catch (error) {

            console.error('[AYANAS Payment]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`入金は保存されましたが、請求書の更新に失敗しました。\n\n${message}`);

        }

        return event;

    };

    kintone.events.on(
        ['app.record.create.change.invoice_no', 'app.record.edit.change.invoice_no'],
        handleInvoiceNoChange
    );

    kintone.events.on(
        [
            'app.record.create.change.payment_amount',
            'app.record.edit.change.payment_amount',
            'app.record.create.change.fee',
            'app.record.edit.change.fee',
        ],
        handleAmountChange
    );

    kintone.events.on(
        ['app.record.create.submit.success', 'app.record.edit.submit.success'],
        handleSubmitSuccess
    );

})();
