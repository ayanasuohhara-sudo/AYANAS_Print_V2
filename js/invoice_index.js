(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * invoice_index.js
     *
     * 請求書作成アプリ（App 35）一覧画面の表示強化。
     */

    const TOOLBAR_ID = 'ayanas-invoice-index-toolbar';
    const SUMMARY_ID = 'ayanas-invoice-index-summary';
    const FILTERS_ID = 'ayanas-invoice-index-filters';
    const SORTS_ID = 'ayanas-invoice-index-sorts';
    const DEFAULT_ORDER = 'order by invoice_date desc, invoice_no asc';
    const AR_ORDER = 'order by accounts_receivable desc, invoice_date desc, invoice_no asc';
    const ORDER_BY = DEFAULT_ORDER;

    const PAYMENT_ROW_CLASS = {
        未入金: 'ayanas-payment-unpaid',
        一部入金: 'ayanas-payment-partial',
        入金済: 'ayanas-payment-paid',
    };

    const LIST_SORTS = [
        { id: 'default', label: '請求日順', orderBy: DEFAULT_ORDER },
        { id: 'ar_desc', label: '売掛残高順', orderBy: AR_ORDER },
    ];

    const LIST_FILTERS = [
        { id: 'all', label: 'すべて', query: '' },
        { id: 'unpaid', label: '未入金', query: 'payment_status in ("未入金")' },
        { id: 'partial', label: '一部入金', query: 'payment_status in ("一部入金")' },
        { id: 'paid', label: '入金済', query: 'payment_status in ("入金済")' },
        { id: 'creating', label: '作成中', query: 'invoice_status in ("作成中")' },
        { id: 'confirmed', label: '確定', query: 'invoice_status in ("確定")' },
    ];

    /** 一覧表示推奨フィールド（kintone 一覧設定用） */
    const LIST_VIEW_FIELDS = [
        'invoice_no',
        'invoice_date',
        'customer_code',
        'customer_name',
        'closing_date',
        'due_date',
        'item_count',
        'subtotal',
        'tax',
        'total',
        'payment_status',
        'invoice_status',
        'accounts_receivable',
        'overdue_days',
        'collection_status',
        'last_payment_date',
    ];

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const isInvoiceApp = () => {

        if (typeof InvoiceCreate === 'undefined') {
            return false;
        }

        return kintone.app.getId() === InvoiceCreate.getInvoiceAppId();

    };

    const getFields = () => InvoiceCreate.INVOICE_FIELDS;

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

    const formatYen = (value) => `${toNumber(value).toLocaleString()} 円`;

    const getFullQuery = () => {

        const params = new URLSearchParams(window.location.search);

        return String(params.get('q') ?? kintone.app.getQueryCondition() ?? '').trim();

    };

    const normalizeQuery = (query) => String(query ?? '').replace(/\s+order by .+$/i, '').trim();

    const getActiveSortId = () => {

        const fullQuery = getFullQuery();

        if (/order by accounts_receivable desc/i.test(fullQuery)) {
            return 'ar_desc';
        }

        return 'default';

    };

    const getActiveFilterId = () => {

        const condition = normalizeQuery(getFullQuery());

        if (!condition) {
            return 'all';
        }

        const matched = LIST_FILTERS.find((filter) => filter.query && filter.query === condition);

        return matched ? matched.id : '';

    };

    const getCurrentFilterQuery = () => {

        const matched = LIST_FILTERS.find((filter) => filter.id === getActiveFilterId());

        return matched?.query ?? '';

    };

    const buildNavigationQuery = (filterQuery, sortId) => {

        const sort = LIST_SORTS.find((item) => item.id === sortId) || LIST_SORTS[0];

        if (!filterQuery) {
            return sort.orderBy;
        }

        return `${filterQuery} ${sort.orderBy}`;

    };

    const navigateWithQuery = (filterQuery, sortId = getActiveSortId()) => {

        const appId = kintone.app.getId();
        const query = buildNavigationQuery(filterQuery, sortId);
        const params = new URLSearchParams();

        params.set('q', query);

        window.location.href = `/k/${appId}/?${params.toString()}`;

    };

    const getSummaryFetchQuery = () => buildNavigationQuery(getCurrentFilterQuery(), getActiveSortId());

    const fetchAllRecordsForSummary = async () => {

        const fields = getFields();
        const summaryFields = [
            fields.invoiceAmount,
            fields.paymentAmount,
            fields.paymentBalance,
            fields.total,
            fields.paymentStatus,
            fields.dueDate,
            fields.accountsReceivable,
            fields.overdueDays,
            fields.collectionStatus,
            fields.lastPaymentDate,
        ];
        const query = getSummaryFetchQuery();
        const records = [];
        const limit = 500;
        let offset = 0;

        while (true) {

            const response = await kintoneApi(
                kintone.api.url('/k/v1/records', true),
                'GET',
                {
                    app: kintone.app.getId(),
                    query: `${query} limit ${limit} offset ${offset}`,
                    fields: summaryFields,
                }
            );

            records.push(...response.records);

            if (response.records.length < limit) {
                break;
            }

            offset += limit;

        }

        return records;

    };

    const getInvoiceAmount = (record) => {

        const fields = getFields();
        const invoiceAmount = toNumber(getFieldValue(record, fields.invoiceAmount));

        if (invoiceAmount !== 0) {
            return invoiceAmount;
        }

        return toNumber(getFieldValue(record, fields.total));

    };

    const getOutstandingAmount = (record) => {

        const fields = getFields();
        const paymentStatus = String(getFieldValue(record, fields.paymentStatus) ?? '').trim();

        if (paymentStatus === InvoiceCreate.PAYMENT_STATUS_PAID) {
            return 0;
        }

        const paymentBalance = getFieldValue(record, fields.paymentBalance);

        if (paymentBalance !== '' && paymentBalance !== null && paymentBalance !== undefined) {
            return toNumber(paymentBalance);
        }

        return InvoiceCreate.calculatePaymentBalance(
            getInvoiceAmount(record),
            getFieldValue(record, fields.paymentAmount)
        );

    };

    const calculateSummary = (records) => {

        let invoiceTotal = 0;
        let outstandingTotal = 0;
        let receivableTotal = 0;

        records.forEach((record) => {
            invoiceTotal += getInvoiceAmount(record);
            outstandingTotal += getOutstandingAmount(record);

            const receivable = InvoiceCreate.computeReceivableDisplay(record);

            receivableTotal += receivable.accounts_receivable;
        });

        return {
            count: records.length,
            invoiceTotal,
            outstandingTotal,
            receivableTotal,
        };

    };

    const renderSummaryContent = (summary) => {

        if (!summary) {
            return '<p class="ayanas-invoice-index-loading">集計を読み込み中...</p>';
        }

        return [
            `<p class="ayanas-invoice-index-summary-item"><strong>請求件数</strong>${summary.count.toLocaleString()} 件</p>`,
            `<p class="ayanas-invoice-index-summary-item"><strong>請求金額合計</strong>${formatYen(summary.invoiceTotal)}</p>`,
            `<p class="ayanas-invoice-index-summary-item"><strong>未入金金額合計</strong>${formatYen(summary.outstandingTotal)}</p>`,
            `<p class="ayanas-invoice-index-summary-item"><strong>売掛残高合計</strong>${formatYen(summary.receivableTotal)}</p>`,
        ].join('');

    };

    const renderSortButtons = () => {

        const activeSortId = getActiveSortId();

        return LIST_SORTS.map((sort) => {

            const activeClass = sort.id === activeSortId ? ' is-active' : '';

            return `<button type="button" class="ayanas-invoice-index-filter-button${activeClass}" data-sort-id="${sort.id}">${sort.label}</button>`;

        }).join('');

    };

    const renderFilterButtons = () => {

        const activeFilterId = getActiveFilterId();

        return LIST_FILTERS.map((filter) => {

            const activeClass = filter.id === activeFilterId ? ' is-active' : '';

            return `<button type="button" class="ayanas-invoice-index-filter-button${activeClass}" data-filter-id="${filter.id}">${filter.label}</button>`;

        }).join('');

    };

    const ensureToolbar = () => {

        let toolbar = document.getElementById(TOOLBAR_ID);

        if (toolbar) {
            return toolbar;
        }

        toolbar = document.createElement('div');
        toolbar.id = TOOLBAR_ID;
        toolbar.className = 'ayanas-invoice-index-toolbar';
        toolbar.innerHTML = `
            <div id="${SUMMARY_ID}" class="ayanas-invoice-index-summary">
                <p class="ayanas-invoice-index-loading">集計を読み込み中...</p>
            </div>
            <div id="${FILTERS_ID}" class="ayanas-invoice-index-filters">
                <span class="ayanas-invoice-index-filters-label">絞り込み</span>
            </div>
            <div id="${SORTS_ID}" class="ayanas-invoice-index-filters ayanas-invoice-index-sorts">
                <span class="ayanas-invoice-index-filters-label">並び替え</span>
            </div>
        `;

        const contents = document.querySelector('.contents-gaia');

        if (contents) {
            contents.insertBefore(toolbar, contents.firstChild);
        }

        const filters = toolbar.querySelector(`#${FILTERS_ID}`);

        if (filters) {
            filters.insertAdjacentHTML('beforeend', renderFilterButtons());

            filters.addEventListener('click', (event) => {

                const button = event.target.closest('[data-filter-id]');

                if (!(button instanceof HTMLButtonElement)) {
                    return;
                }

                const filter = LIST_FILTERS.find((item) => item.id === button.dataset.filterId);

                if (!filter) {
                    return;
                }

                navigateWithQuery(filter.query, getActiveSortId());

            });
        }

        const sorts = toolbar.querySelector(`#${SORTS_ID}`);

        if (sorts) {
            sorts.insertAdjacentHTML('beforeend', renderSortButtons());

            sorts.addEventListener('click', (event) => {

                const button = event.target.closest('[data-sort-id]');

                if (!(button instanceof HTMLButtonElement)) {
                    return;
                }

                const sort = LIST_SORTS.find((item) => item.id === button.dataset.sortId);

                if (!sort) {
                    return;
                }

                navigateWithQuery(getCurrentFilterQuery(), sort.id);

            });
        }

        return toolbar;

    };

    const updateSummary = async () => {

        const summaryElement = document.getElementById(SUMMARY_ID);

        if (!summaryElement) {
            return;
        }

        summaryElement.innerHTML = '<p class="ayanas-invoice-index-loading">集計を読み込み中...</p>';

        try {

            const records = await fetchAllRecordsForSummary();
            const summary = calculateSummary(records);

            summaryElement.innerHTML = renderSummaryContent(summary);

        } catch (error) {

            console.error('[AYANAS Invoice Index]', error);
            summaryElement.innerHTML = '<p class="ayanas-invoice-index-loading">集計の取得に失敗しました。</p>';

        }

    };

    const applyRowColors = (records) => {

        const fields = getFields();
        const paymentField = fields.paymentStatus;

        window.setTimeout(() => {

            const rows = document.querySelectorAll('.recordlist-gaia tbody tr');

            records.forEach((record, index) => {

                const row = rows[index];

                if (!row) {
                    return;
                }

                Object.values(PAYMENT_ROW_CLASS).forEach((className) => {
                    row.classList.remove(className);
                });

                const status = String(getFieldValue(record, paymentField) ?? '').trim();
                const className = PAYMENT_ROW_CLASS[status];

                if (className) {
                    row.classList.add(className);
                }

            });

        }, 0);

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        ensureToolbar();
        updateSummary();
        applyRowColors(event.records);

        return event;

    });

    window.InvoiceIndex = {
        LIST_VIEW_FIELDS,
        LIST_FILTERS,
        LIST_SORTS,
        DEFAULT_ORDER,
        AR_ORDER,
    };

})();
