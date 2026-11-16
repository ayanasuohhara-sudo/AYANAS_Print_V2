(function () {
    'use strict';

    /**
     * 業務ダッシュボード — 一覧 UI（専用 kintone アプリのみ）
     */

    const ROOT_ID = 'ayanas-business-dashboard-root';
    const BODY_CLASS = 'ayanas-business-dashboard-active';

    let activePreset = 'today';
    let customStart = '';
    let customEnd = '';
    let lastReport = null;
    let expandedTailoring = new Set();
    let expandedCustomers = new Set();
    let expandedPipeline = new Set();
    let activeKimonoSegment = 'total';
    /** 'daily' | 'monthly' */
    let activeMainTab = 'daily';
    let lastMonthlyReport = null;
    let monthlyFiscalStartYear = null;
    let monthlyRoute = 'all';
    let monthlyCustomerCode = 'ALL';
    let monthlyKimonoType = 'ALL';
    let monthlySelectedMonthKey = '';

    const cfg = () => CAYANAS_BUSINESS_DASHBOARD;
    const ui = () => cfg().UI;

    const isDashboardApp = () => {

        if (typeof kintone === 'undefined' || typeof kintone.app?.getId !== 'function') {
            return false;
        }

        if (typeof CAYANAS_BUSINESS_DASHBOARD === 'undefined') {
            return false;
        }

        const expectedId = cfg().BUSINESS_DASHBOARD_APP_ID;
        const currentId = kintone.app.getId();

        if (expectedId > 0) {
            return currentId === expectedId;
        }

        return currentId > 0;

    };

    const isConfigured = () => cfg().BUSINESS_DASHBOARD_APP_ID > 0;

    const formatInt = (value) => Math.round(Number(value) || 0).toLocaleString('ja-JP');

    const formatYen = (value) => Math.round(Number(value) || 0).toLocaleString('ja-JP');

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const getMountElement = () => {

        const header = kintone.app.getHeaderSpaceElement();

        if (header) {
            return header;
        }

        return document.querySelector('.contents-gaia') || document.body;

    };

    const ensureRoot = () => {

        let root = document.getElementById(ROOT_ID);

        if (root) {
            return root;
        }

        const mount = getMountElement();
        root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'ayanas-bd-root';

        if (mount.firstChild) {
            mount.insertBefore(root, mount.firstChild);
        } else {
            mount.appendChild(root);
        }

        return root;

    };

    const pipelineSegment = (key) => {

        const pipeline = lastReport?.pipeline;

        if (!pipeline) {
            return null;
        }

        if (key === 'honsha') {
            return pipeline.honsha;
        }

        if (key === 'ayanas') {
            return pipeline.ayanas;
        }

        return pipeline.total;

    };

    const filterOpenOrders = (filters) => {

        const orders = lastReport?.pipeline?.openOrders || [];

        return orders.filter((row) => {

            if (filters.segment && filters.segment !== 'total' && row.segment !== filters.segment) {
                return false;
            }

            if (filters.processStatus !== undefined && row.processStatus !== filters.processStatus) {
                return false;
            }

            if (filters.locationStatus !== undefined && row.locationStatus !== filters.locationStatus) {
                return false;
            }

            if (filters.processingCategory
                && !(row.processingCategories || []).includes(filters.processingCategory)) {
                return false;
            }

            if (filters.summaryKey === 'overdue' && !row.deadlineFlags?.overdue) {
                return false;
            }

            if (filters.summaryKey === 'within7' && !row.deadlineFlags?.within7) {
                return false;
            }

            if (filters.summaryKey === 'thisMonth' && !row.deadlineFlags?.thisMonth) {
                return false;
            }

            return true;

        });

    };

    const renderOpenOrderRows = (orders) => {

        if (!orders.length) {
            return `<tr><td colspan="9" class="ayanas-bd-muted">該当なし</td></tr>`;
        }

        return orders.map((row) => `
<tr>
  <td>${escapeHtml(row.manageNo)}</td>
  <td>${escapeHtml(row.customerCode)}</td>
  <td>${escapeHtml(row.customerName)}</td>
  <td>${escapeHtml(row.kimonoType)}</td>
  <td>${escapeHtml(row.kimonoSpec)}</td>
  <td class="num">${escapeHtml(row.orderDate)}</td>
  <td class="num">${escapeHtml(row.deadline)}</td>
  <td>${escapeHtml(row.processStatus)}</td>
  <td>${escapeHtml(row.locationStatus)}</td>
</tr>`).join('');

    };

    const renderOpenOrderNested = (orders, title, colspan) => {

        if (!orders.length) {
            return '';
        }

        const span = colspan || 4;

        return `
<tr class="ayanas-bd-row--nested">
  <td colspan="${span}">
    <div class="ayanas-bd-nested">
      <div class="ayanas-bd-nested__title">${escapeHtml(title)}（${formatInt(orders.length)}件）</div>
      <table class="ayanas-bd-table ayanas-bd-table--nested">
        <thead>
          <tr>
            <th>${escapeHtml(ui().colManageNo)}</th>
            <th>顧客コード</th>
            <th>顧客名</th>
            <th>着物種類</th>
            <th>着物仕様</th>
            <th>${escapeHtml(ui().colOrderDate)}</th>
            <th>${escapeHtml(ui().colDeadline)}</th>
            <th>${escapeHtml(ui().colProcessStatus)}</th>
            <th>${escapeHtml(ui().colLocationStatus)}</th>
          </tr>
        </thead>
        <tbody>${renderOpenOrderRows(orders)}</tbody>
      </table>
    </div>
  </td>
</tr>`;

    };

    const pipelineToggle = (key, expanded) => (
        `<button type="button" class="ayanas-bd-toggle" data-pipeline="${escapeHtml(key)}" aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? '▼' : '▶'}</button>`
    );

    const renderPipeline = () => {

        const u = ui();
        const pipeline = lastReport?.pipeline;

        if (!pipeline) {
            return '';
        }

        const summaryRows = [
            { key: 'openKimono', label: u.pipelineOpenKimono, expandKey: 'summary:open' },
            { key: 'openPoints', label: u.pipelineOpenPoints, expandKey: 'summary:points' },
            { key: 'overdueKimono', label: u.pipelineOverdue, expandKey: 'summary:overdue', summaryKey: 'overdue' },
            { key: 'within7Kimono', label: u.pipelineWithin7, expandKey: 'summary:within7', summaryKey: 'within7' },
            { key: 'thisMonthKimono', label: u.pipelineThisMonth, expandKey: 'summary:thisMonth', summaryKey: 'thisMonth' },
        ];

        const summaryBody = summaryRows.map((row) => {

            const honsha = pipeline.honsha.summary[row.key];
            const ayanas = pipeline.ayanas.summary[row.key];
            const total = pipeline.total.summary[row.key];
            const expanded = expandedPipeline.has(row.expandKey);
            let extra = '';

            if (expanded && row.key === 'openKimono') {

                ['honsha', 'ayanas', 'total'].forEach((seg) => {

                    const orders = filterOpenOrders({ segment: seg });
                    const title = `${row.label} — ${seg === 'honsha' ? u.segmentHonsha : seg === 'ayanas' ? u.segmentAyanas : u.segmentTotal}`;

                    extra += renderOpenOrderNested(orders, title);

                });

            } else if (expanded && row.summaryKey) {

                ['honsha', 'ayanas', 'total'].forEach((seg) => {

                    const orders = filterOpenOrders({ segment: seg, summaryKey: row.summaryKey });
                    const title = `${row.label} — ${seg === 'honsha' ? u.segmentHonsha : seg === 'ayanas' ? u.segmentAyanas : u.segmentTotal}`;

                    extra += renderOpenOrderNested(orders, title);

                });

            } else if (expanded && row.key === 'openPoints') {

                extra = renderOpenOrderNested(
                    filterOpenOrders({ segment: 'total' }),
                    `${row.label}（参考: 各行 openPoints は明細 qty 合計）`,
                );

            }

            return `
<tr>
  <th>
    ${pipelineToggle(row.expandKey, expanded)}
    ${escapeHtml(row.label)}
  </th>
  <td class="num">${formatInt(honsha)}</td>
  <td class="num">${formatInt(ayanas)}</td>
  <td class="num">${formatInt(total)}</td>
</tr>${extra}`;

        }).join('');

        const renderBreakdownTable = (title, note, rows, kind) => {

            const body = rows.map((row) => {

                const expandKey = `${kind}:${row.name}`;
                const expanded = expandedPipeline.has(expandKey);
                let extra = '';

                if (expanded) {

                    ['honsha', 'ayanas', 'total'].forEach((seg) => {

                        const segData = pipelineSegment(seg);
                        const segRows = kind === 'process'
                            ? segData.byProcessStatus
                            : segData.byLocationStatus;
                        const segRow = segRows.find((r) => r.name === row.name);
                        const count = segRow?.kimono ?? 0;

                        if (count === 0) {
                            return;
                        }

                        const filters = {
                            segment: seg,
                            processStatus: kind === 'process' ? row.name : undefined,
                            locationStatus: kind === 'location' ? row.name : undefined,
                        };
                        const orders = filterOpenOrders(filters);

                        const segLabel = seg === 'honsha' ? u.segmentHonsha : seg === 'ayanas' ? u.segmentAyanas : u.segmentTotal;

                        extra += renderOpenOrderNested(orders, `${row.name} — ${segLabel}`);

                    });

                }

                return `
<tr>
  <td class="ayanas-bd-toggle-cell">
    ${pipelineToggle(expandKey, expanded)}
    ${escapeHtml(row.name)}
  </td>
  <td class="num">${formatInt(pipeline.honsha[kind === 'process' ? 'byProcessStatus' : 'byLocationStatus'].find((r) => r.name === row.name)?.kimono ?? 0)}</td>
  <td class="num">${formatInt(pipeline.ayanas[kind === 'process' ? 'byProcessStatus' : 'byLocationStatus'].find((r) => r.name === row.name)?.kimono ?? 0)}</td>
  <td class="num">${formatInt(row.kimono)}</td>
</tr>${extra}`;

            }).join('');

            return `
<h3 class="ayanas-bd-subsection__title">${escapeHtml(title)}</h3>
<p class="ayanas-bd-note ayanas-bd-note--muted">${escapeHtml(note)}</p>
<table class="ayanas-bd-table">
  <thead>
    <tr>
      <th>区分</th>
      <th>${escapeHtml(u.segmentHonsha)}</th>
      <th>${escapeHtml(u.segmentAyanas)}</th>
      <th>${escapeHtml(u.segmentTotal)}</th>
    </tr>
  </thead>
  <tbody>${body || '<tr><td colspan="4">—</td></tr>'}</tbody>
</table>`;

        };

        const processingBody = pipeline.total.byProcessing.map((row) => {

            const expandKey = `proc:${row.name}`;
            const expanded = expandedPipeline.has(expandKey);
            let extra = '';

            if (expanded) {

                ['honsha', 'ayanas', 'total'].forEach((seg) => {

                    const segRow = pipelineSegment(seg).byProcessing.find((r) => r.name === row.name) || { kimono: 0, points: 0 };

                    if (segRow.kimono === 0) {
                        return;
                    }

                    const segLabel = seg === 'honsha' ? u.segmentHonsha : seg === 'ayanas' ? u.segmentAyanas : u.segmentTotal;
                    const orders = filterOpenOrders({ segment: seg, processingCategory: row.name });

                    extra += renderOpenOrderNested(orders, `${row.name} — ${segLabel}`, 7);

                });

            }

            const honshaRow = pipeline.honsha.byProcessing.find((r) => r.name === row.name) || { kimono: 0, points: 0 };
            const ayanasRow = pipeline.ayanas.byProcessing.find((r) => r.name === row.name) || { kimono: 0, points: 0 };

            return `
<tr>
  <td class="ayanas-bd-toggle-cell">
    ${pipelineToggle(expandKey, expanded)}
    ${escapeHtml(row.name)}
  </td>
  <td class="num">${formatInt(honshaRow.kimono)}</td>
  <td class="num">${formatInt(honshaRow.points)}</td>
  <td class="num">${formatInt(ayanasRow.kimono)}</td>
  <td class="num">${formatInt(ayanasRow.points)}</td>
  <td class="num">${formatInt(row.kimono)}</td>
  <td class="num">${formatInt(row.points)}</td>
</tr>${extra}`;

        }).join('');

        const listExpanded = expandedPipeline.has('list:all');
        const listToggle = pipelineToggle('list:all', listExpanded);
        const listOrders = filterOpenOrders({ segment: 'total' });

        return `
<section class="ayanas-bd-section ayanas-bd-section--pipeline">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionPipeline)}</h2>
  <p class="ayanas-bd-note">${escapeHtml(u.pipelineDefinitionNote)}</p>
  <p class="ayanas-bd-note ayanas-bd-note--muted">基準日（JST）: ${escapeHtml(pipeline.asOfDate)} / 受注残 ${formatInt(pipeline.meta.openManageNoCount)} 管理番号</p>
  <table class="ayanas-bd-table ayanas-bd-table--summary">
    <thead>
      <tr>
        <th>指標</th>
        <th>${escapeHtml(u.segmentHonsha)}</th>
        <th>${escapeHtml(u.segmentAyanas)}</th>
        <th>${escapeHtml(u.segmentTotal)}</th>
      </tr>
    </thead>
    <tbody>${summaryBody}</tbody>
  </table>
  ${renderBreakdownTable(u.pipelineByProcess, u.pipelineProcessNote, pipeline.total.byProcessStatus, 'process')}
  ${renderBreakdownTable(u.pipelineByLocation, u.pipelineLocationNote, pipeline.total.byLocationStatus, 'location')}
  <h3 class="ayanas-bd-subsection__title">${escapeHtml(u.pipelineByProcessing)}</h3>
  <p class="ayanas-bd-note ayanas-bd-note--muted">${escapeHtml(u.pipelineProcessingNote)}</p>
  <table class="ayanas-bd-table">
    <thead>
      <tr>
        <th>加工分類</th>
        <th colspan="2">${escapeHtml(u.segmentHonsha)}</th>
        <th colspan="2">${escapeHtml(u.segmentAyanas)}</th>
        <th colspan="2">${escapeHtml(u.segmentTotal)}</th>
      </tr>
      <tr>
        <th></th>
        <th class="num">着物枚数</th>
        <th class="num">加工点数</th>
        <th class="num">着物枚数</th>
        <th class="num">加工点数</th>
        <th class="num">着物枚数</th>
        <th class="num">加工点数</th>
      </tr>
    </thead>
    <tbody>${processingBody}</tbody>
  </table>
  <div class="ayanas-bd-pipeline-list-toggle">${listToggle} ${escapeHtml(u.pipelineOpenList)}</div>
  ${listExpanded ? `
  <div class="ayanas-bd-nested ayanas-bd-nested--standalone">
    <div class="ayanas-bd-nested__title">${escapeHtml(u.pipelineOpenList)}（${formatInt(listOrders.length)}件）</div>
    <table class="ayanas-bd-table ayanas-bd-table--nested">
      <thead>
        <tr>
          <th>${escapeHtml(u.colManageNo)}</th>
          <th>顧客コード</th>
          <th>顧客名</th>
          <th>着物種類</th>
          <th>着物仕様</th>
          <th>${escapeHtml(u.colOrderDate)}</th>
          <th>${escapeHtml(u.colDeadline)}</th>
          <th>${escapeHtml(u.colProcessStatus)}</th>
          <th>${escapeHtml(u.colLocationStatus)}</th>
        </tr>
      </thead>
      <tbody>${renderOpenOrderRows(listOrders)}</tbody>
    </table>
  </div>` : ''}
</section>`;

    };

    const renderOverviewMainRow = (segmentData, showLogistics) => {

        const log = segmentData.logistics || {};
        const dash = '—';

        return `
  <td class="num">${formatInt(segmentData.orderKimono)}</td>
  <td class="num">${formatYen(segmentData.orderAmount)}</td>
  <td class="num">${formatInt(segmentData.deliveryKimono)}</td>
  <td class="num">${formatYen(segmentData.deliveryAmount)}</td>
  <td class="num">${formatInt(segmentData.wipKimono)}</td>
  <td class="num">${formatYen(segmentData.wipAmount)}</td>
  <td class="num">${showLogistics ? formatInt(log.overseasOut) : dash}</td>
  <td class="num">${showLogistics ? formatInt(log.overseasIn) : dash}</td>
  <td class="num">${showLogistics ? formatInt(log.wasaiOut) : dash}</td>
  <td class="num">${showLogistics ? formatInt(log.wasaiIn) : dash}</td>
  <td class="num">${showLogistics ? formatInt(log.outsourceOut) : dash}</td>
  <td class="num">${showLogistics ? formatInt(log.outsourceIn) : dash}</td>`;

    };

    const renderOverviewCategoryRow = (segmentData, kind) => {

        const cols = cfg().OVERVIEW_CATEGORY_COLUMNS;
        const bucket = kind === 'order' ? segmentData.orderCategories : segmentData.deliveryCategories;

        return cols.map((col) => (
            `<td class="num">${formatInt(bucket?.[col.id] ?? 0)}</td>`
        )).join('');

    };

    const renderOverallStatus = () => {

        const u = ui();
        const overview = lastReport?.overview;

        if (!overview?.snapshots) {
            return '';
        }

        const periodLabel = {
            today: u.overviewRowToday,
            this_month: u.overviewRowMonth,
            fiscal_year: u.overviewRowFiscal,
        };

        const segmentGroups = [
            { key: 'honsha', label: u.segmentHonsha, showLogistics: false },
            { key: 'ayanas', label: u.overviewSegmentStore, showLogistics: false },
            { key: 'total', label: u.segmentTotal, showLogistics: true },
        ];

        const periodKeys = overview.periodRows || ['today', 'this_month', 'fiscal_year'];

        let mainBody = '';

        segmentGroups.forEach((group) => {

            periodKeys.forEach((periodKey, index) => {

                const snap = overview.snapshots[periodKey];
                const segmentData = snap?.segments?.[group.key] || {};
                const periodCell = periodLabel[periodKey] || periodKey;
                const groupCell = index === 0
                    ? `<td class="ayanas-bd-overview-seg" rowspan="${periodKeys.length}">${escapeHtml(group.label)}</td>`
                    : '';

                mainBody += `
<tr>
  ${groupCell}
  <td>${escapeHtml(periodCell)}</td>
  ${renderOverviewMainRow(segmentData, group.showLogistics)}
</tr>`;

            });

        });

        const categoryHeader = cfg().OVERVIEW_CATEGORY_COLUMNS
            .map((col) => `<th class="num">${escapeHtml(col.label)}</th>`)
            .join('');

        const renderCategoryBlock = (title, kind) => {

            let body = '';

            segmentGroups.forEach((group) => {

                periodKeys.forEach((periodKey, index) => {

                    const snap = overview.snapshots[periodKey];
                    const segmentData = snap?.segments?.[group.key] || {};
                    const periodCell = periodLabel[periodKey] || periodKey;
                    const groupCell = index === 0
                        ? `<td class="ayanas-bd-overview-seg" rowspan="${periodKeys.length}">${escapeHtml(group.label)}</td>`
                        : '';

                    body += `
<tr>
  ${groupCell}
  <td>${escapeHtml(periodCell)}</td>
  ${renderOverviewCategoryRow(segmentData, kind)}
</tr>`;

                });

            });

            return `
<h3 class="ayanas-bd-subsection__title">${escapeHtml(title)}</h3>
<div class="ayanas-bd-overview-scroll">
  <table class="ayanas-bd-table ayanas-bd-overview-table">
    <thead>
      <tr>
        <th></th>
        <th></th>
        ${categoryHeader}
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</div>`;

        };

        return `
<section class="ayanas-bd-section ayanas-bd-section--overview">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionOverview)}</h2>
  <p class="ayanas-bd-note ayanas-bd-note--muted">${escapeHtml(overview.wipNote || '')}</p>
  <p class="ayanas-bd-note ayanas-bd-note--muted">${escapeHtml(overview.logisticsNote || '')}</p>
  <p class="ayanas-bd-note">${escapeHtml(u.orderAmountNote)}</p>
  <p class="ayanas-bd-note ayanas-bd-note--muted">${escapeHtml(u.aggregationExclusionNote)}</p>
  <div class="ayanas-bd-overview-scroll">
    <table class="ayanas-bd-table ayanas-bd-overview-table">
      <thead>
        <tr>
          <th></th>
          <th></th>
          <th class="num">${escapeHtml(u.overviewColOrderKimono)}</th>
          <th class="num">${escapeHtml(u.overviewColOrderAmount)}</th>
          <th class="num">${escapeHtml(u.overviewColDeliveryKimono)}</th>
          <th class="num">${escapeHtml(u.overviewColDeliveryAmount)}</th>
          <th class="num">${escapeHtml(u.overviewColWipKimono)}</th>
          <th class="num">${escapeHtml(u.overviewColWipAmount)}</th>
          <th class="num">${escapeHtml(u.overviewColOverseasOut)}</th>
          <th class="num">${escapeHtml(u.overviewColOverseasIn)}</th>
          <th class="num">${escapeHtml(u.overviewColWasaiOut)}</th>
          <th class="num">${escapeHtml(u.overviewColWasaiIn)}</th>
          <th class="num">${escapeHtml(u.overviewColOutsourceOut)}</th>
          <th class="num">${escapeHtml(u.overviewColOutsourceIn)}</th>
        </tr>
      </thead>
      <tbody>${mainBody}</tbody>
    </table>
  </div>
  ${renderCategoryBlock(u.overviewBlockOrder, 'order')}
  ${renderCategoryBlock(u.overviewBlockDelivery, 'delivery')}
</section>`;

    };

    const renderLogistics = () => {

        const u = ui();
        const log = lastReport?.logistics;

        if (!log) {
            return '';
        }

        const row = (label, route) => `
<tr>
  <th>${escapeHtml(label)}</th>
  <td class="num">${formatInt(route?.outbound)}</td>
  <td class="num">${formatInt(route?.inbound)}</td>
</tr>`;

        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionLogistics)}</h2>
  <p class="ayanas-bd-note">${escapeHtml(u.logisticsNote)}</p>
  <table class="ayanas-bd-table ayanas-bd-table--summary">
    <thead>
      <tr>
        <th></th>
        <th>${escapeHtml(u.logisticsOutbound)}</th>
        <th>${escapeHtml(u.logisticsInbound)}</th>
      </tr>
    </thead>
    <tbody>
      ${row(u.logisticsOverseas, log.overseas)}
      ${row(u.logisticsWasai, log.wasai)}
      ${row(u.logisticsOutsource, log.outsource)}
    </tbody>
  </table>
</section>`;

    };

    const renderKimonoTypeSpec = () => {

        const u = ui();
        const block = lastReport?.kimonoTypeSpec;

        if (!block) {
            return '';
        }

        const rows = block[activeKimonoSegment] || [];

        const segBtn = (id, label) => (
            `<button type="button" class="ayanas-bd-btn ayanas-bd-btn--seg${activeKimonoSegment === id ? ' is-active' : ''}" data-bd-kimono-seg="${id}">${escapeHtml(label)}</button>`
        );

        if (!rows.length) {
            return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionKimonoTypeSpec)}</h2>
  <p class="ayanas-bd-note">${escapeHtml(u.kimonoRouteNote)}</p>
  <div class="ayanas-bd-segment">${segBtn('honsha', u.segmentHonsha)}${segBtn('ayanas', u.segmentAyanas)}${segBtn('total', u.segmentTotal)}</div>
  <p class="ayanas-bd-message">対象データがありません。</p>
</section>`;
        }

        const body = rows.map((row) => `
<tr>
  <td>${escapeHtml(row.kimonoType)}</td>
  <td>${escapeHtml(row.kimonoSpec)}</td>
  <td class="num">${formatInt(row.total)}</td>
  <td class="num">${formatInt(row.overseas)}</td>
  <td class="num">${formatInt(row.domestic)}</td>
  <td class="num">${formatInt(row.sekkai)}</td>
  <td class="num">${formatInt(row.other)}</td>
</tr>`).join('');

        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionKimonoTypeSpec)}</h2>
  <p class="ayanas-bd-note">${escapeHtml(u.kimonoRouteNote)}</p>
  <div class="ayanas-bd-segment">${segBtn('honsha', u.segmentHonsha)}${segBtn('ayanas', u.segmentAyanas)}${segBtn('total', u.segmentTotal)}</div>
  <table class="ayanas-bd-table">
    <thead>
      <tr>
        <th>着物種類</th>
        <th>仕様</th>
        <th>${escapeHtml(u.colKimonoTotal)}</th>
        <th>${escapeHtml(u.colKimonoOverseas)}</th>
        <th>${escapeHtml(u.colKimonoDomestic)}</th>
        <th>${escapeHtml(u.colKimonoSekkai)}</th>
        <th>${escapeHtml(u.colKimonoOther)}</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</section>`;

    };

    const renderTailoring = () => {

        const u = ui();
        const rows = lastReport?.tailoring || [];

        const body = rows.map((row) => {
            const expanded = expandedTailoring.has(row.name);
            const toggle = expanded ? '▼' : '▶';
            const t = row.total;

            let extra = '';

            if (expanded && row.kimonoSpecRows?.length) {
                const specBody = row.kimonoSpecRows.map((spec) => `
<tr>
  <td>${escapeHtml(spec.kimonoType)}</td>
  <td>${escapeHtml(spec.kimonoSpec)}</td>
  <td class="num">${formatInt(spec.orderKimono)}</td>
</tr>`).join('');

                extra = `
<tr class="ayanas-bd-row--nested">
  <td colspan="5">
    <div class="ayanas-bd-nested">
      <div class="ayanas-bd-nested__title">${escapeHtml(u.expandKimono)}（${escapeHtml(row.name)}）</div>
      <table class="ayanas-bd-table ayanas-bd-table--nested">
        <thead><tr><th>着物種類</th><th>仕様</th><th>受注着物枚数</th></tr></thead>
        <tbody>${specBody}</tbody>
      </table>
    </div>
  </td>
</tr>`;
            }

            return `
<tr>
  <td class="ayanas-bd-toggle-cell">
    <button type="button" class="ayanas-bd-toggle" data-tailoring="${escapeHtml(row.name)}" aria-expanded="${expanded ? 'true' : 'false'}">${toggle}</button>
    ${escapeHtml(row.name)}
  </td>
  <td class="num">${formatInt(t.orderKimono)}</td>
  <td class="num">${formatYen(t.orderAmount)}</td>
  <td class="num">${formatInt(t.deliveryKimono)}</td>
  <td class="num">${formatYen(t.deliveryAmount)}</td>
</tr>${extra}`;

        }).join('');

        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionTailoring)}</h2>
  <table class="ayanas-bd-table">
    <thead>
      <tr>
        <th>区分</th>
        <th>受注着物枚数</th>
        <th>受注金額</th>
        <th>納品着物枚数</th>
        <th>納品金額</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</section>`;

    };

    const renderSekkai = () => {

        const u = ui();
        const rows = lastReport?.sekkai || [];

        const body = rows.map((row) => {
            const t = row.total;

            return `
<tr>
  <td>${escapeHtml(row.name)}</td>
  <td class="num">${formatInt(t.orderPoints)}</td>
  <td class="num">${formatInt(t.deliveryPoints)}</td>
  <td class="num">${formatYen(t.deliveryAmount)}</td>
  <td class="num">${formatYen(t.orderAmount)}</td>
</tr>`;

        }).join('');

        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionSekkai)}</h2>
  <p class="ayanas-bd-note">${escapeHtml(u.registeredAmountNote)}（受注金額列）</p>
  <table class="ayanas-bd-table">
    <thead>
      <tr>
        <th>加工内容</th>
        <th>加工受注点数</th>
        <th>加工納品点数</th>
        <th>納品金額</th>
        <th>受注金額</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</section>`;

    };

    const renderCustomers = () => {

        const u = ui();
        const rows = lastReport?.customers || [];

        if (!rows.length) {
            return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionCustomers)}</h2>
  <p class="ayanas-bd-message">対象データがありません。</p>
</section>`;
        }

        const body = rows.map((row) => {
            const key = row.customerCode;
            const expanded = expandedCustomers.has(key);
            const toggle = expanded ? '▼' : '▶';

            let extra = '';

            if (expanded) {
                const specBody = (row.kimonoSpecRows || []).map((spec) => `
<tr>
  <td>${escapeHtml(spec.kimonoType)}</td>
  <td>${escapeHtml(spec.kimonoSpec)}</td>
  <td class="num">${formatInt(spec.orderKimono)}</td>
</tr>`).join('');

                const procBody = (row.processingPoints || []).map((proc) => `
<tr>
  <td>${escapeHtml(proc.name)}</td>
  <td class="num">${formatInt(proc.points)}</td>
</tr>`).join('');

                extra = `
<tr class="ayanas-bd-row--nested">
  <td colspan="5">
    <div class="ayanas-bd-nested">
      <div class="ayanas-bd-nested__title">${escapeHtml(u.expandKimono)}</div>
      <table class="ayanas-bd-table ayanas-bd-table--nested">
        <thead><tr><th>着物種類</th><th>仕様</th><th>受注着物枚数</th></tr></thead>
        <tbody>${specBody || '<tr><td colspan="3">—</td></tr>'}</tbody>
      </table>
      <div class="ayanas-bd-nested__title">${escapeHtml(u.expandProcessing)}</div>
      <table class="ayanas-bd-table ayanas-bd-table--nested">
        <thead><tr><th>加工分類（App13中分類）</th><th>受注点数</th></tr></thead>
        <tbody>${procBody || '<tr><td colspan="2">—</td></tr>'}</tbody>
      </table>
    </div>
  </td>
</tr>`;
            }

            return `
<tr>
  <td class="ayanas-bd-toggle-cell">
    <button type="button" class="ayanas-bd-toggle" data-customer="${escapeHtml(key)}" aria-expanded="${expanded ? 'true' : 'false'}">${toggle}</button>
    ${escapeHtml(row.customerCode)}
  </td>
  <td>${escapeHtml(row.customerName || '—')}</td>
  <td class="num">${formatInt(row.orderKimono)}</td>
  <td class="num">${formatInt(row.orderPoints)}</td>
  <td class="num">${formatYen(row.orderAmount)}</td>
</tr>${extra}`;

        }).join('');

        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionCustomers)}</h2>
  <table class="ayanas-bd-table">
    <thead>
      <tr>
        <th>得意先コード</th>
        <th>得意先名</th>
        <th>受注着物枚数</th>
        <th>加工受注点数</th>
        <th>受注金額</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</section>`;

    };

    const renderA550 = () => {

        const u = ui();
        const summary = lastReport?.a550?.summary;
        const processing = lastReport?.a550?.processing || [];

        const procBody = processing.map((row) => `
<tr>
  <td>${escapeHtml(row.name)}</td>
  <td class="num">${formatInt(row.orderPoints)}</td>
  <td class="num">${formatInt(row.deliveryPoints)}</td>
  <td class="num">${formatYen(row.orderAmount)}</td>
  <td class="num">${formatYen(row.deliveryAmount)}</td>
</tr>`).join('');

        return `
<section class="ayanas-bd-section ayanas-bd-section--a550">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionA550)}</h2>
  <table class="ayanas-bd-table ayanas-bd-table--summary">
    <tbody>
      <tr><th>受注着物枚数</th><td class="num">${formatInt(summary?.orderKimono)}</td></tr>
      <tr><th>納品着物枚数</th><td class="num">${formatInt(summary?.deliveryKimono)}</td></tr>
      <tr><th>加工受注点数</th><td class="num">${formatInt(summary?.orderPoints)}</td></tr>
      <tr><th>加工納品点数</th><td class="num">${formatInt(summary?.deliveryPoints)}</td></tr>
      <tr><th>受注金額</th><td class="num">${formatYen(summary?.orderAmount)}</td></tr>
      <tr><th>納品金額</th><td class="num">${formatYen(summary?.deliveryAmount)}</td></tr>
    </tbody>
  </table>
  <table class="ayanas-bd-table">
    <thead>
      <tr>
        <th>加工</th>
        <th>受注点数</th>
        <th>納品点数</th>
        <th>受注金額</th>
        <th>納品金額</th>
      </tr>
    </thead>
    <tbody>${procBody}</tbody>
  </table>
</section>`;

    };

    const renderMeta = () => {

        const meta = lastReport?.meta;

        if (!meta) {
            return '';
        }

        const oq = meta.orderQtyStats || {};
        const dq = meta.deliveryQtyStats || {};
        const audit = meta.audit;
        const pm = lastReport?.pipeline?.meta;

        let auditBlock = '';

        if (audit) {
            auditBlock = `
  <p class="ayanas-bd-meta">検算: App16 ${formatInt(audit.orderRecordCount)} 件 / App19 ${formatInt(audit.deliveryRecordCount)} 件（${escapeHtml(lastReport?.period?.label || '')}）</p>`;
        }

        let pipelineBlock = '';

        if (pm) {
            pipelineBlock = `
    <p class="ayanas-bd-meta">②現場: App16 ${formatInt(pm.app16RecordCount)} 件 / distinct manage_no ${formatInt(pm.app16DistinctManageNo)} / App19 納品済 manage_no ${formatInt(pm.app19DeliveredDistinctManageNo)} / 受注残 ${formatInt(pm.openManageNoCount)}</p>
    <p class="ayanas-bd-meta">process_status 実値: ${escapeHtml((pm.processStatusValuesSeen || []).join('、') || '—')}</p>
    <p class="ayanas-bd-meta">location_status 実値: ${escapeHtml((pm.locationStatusValuesSeen || []).join('、') || '—')}</p>
    <p class="ayanas-bd-meta">${escapeHtml(pm.templateExportNote || '')}</p>`;
        }

        return `
<details class="ayanas-bd-meta-details">
  <summary>${escapeHtml(ui().metaDetails)}</summary>
  <div class="ayanas-bd-meta-details__body">
    <p class="ayanas-bd-meta">${escapeHtml(meta.cancelNote || '')}</p>
    ${auditBlock}
    ${pipelineBlock}
    <p class="ayanas-bd-meta">${escapeHtml(ui().qtyHintTitle)}: 受注明細 ${formatInt(oq.totalLines)} 行のうち qty≠1 は ${formatInt(oq.nonOneLineCount)} 行 / 納品明細 ${formatInt(dq.totalLines)} 行のうち qty≠1 は ${formatInt(dq.nonOneLineCount)} 行</p>
    <p class="ayanas-bd-meta">App13 中分類（マスタ取得）: ${escapeHtml((meta.productSubcategories || []).join('、') || '—')}</p>
  </div>
</details>`;

    };

    const renderMainTabs = () => {
        const u = ui();
        const tab = (id, label) => (
            `<button type="button" class="ayanas-bd-main-tab${activeMainTab === id ? ' is-active' : ''}" data-bd-main-tab="${id}">${escapeHtml(label)}</button>`
        );
        return `
<nav class="ayanas-bd-main-tabs" aria-label="表示切替">
  ${tab('daily', u.tabDaily || '日次')}
  ${tab('monthly', u.tabMonthly || '経営月次')}
</nav>`;
    };

    const renderToolbar = () => {

        const u = ui();
        const period = lastReport?.period;
        const btn = (id, label) => (
            `<button type="button" class="ayanas-bd-btn${activePreset === id ? ' is-active' : ''}" data-bd-preset="${id}">${escapeHtml(label)}</button>`
        );

        return `
<div class="ayanas-bd-toolbar">
  <h1 class="ayanas-bd-title">${escapeHtml(u.title)}</h1>
  ${renderMainTabs()}
  <div class="ayanas-bd-period">
    ${btn('today', u.periodToday)}
    ${btn('yesterday', u.periodYesterday)}
    ${btn('this_month', u.periodThisMonth)}
    ${btn('last_month', u.periodLastMonth)}
    ${btn('custom', u.periodCustom)}
  </div>
  <div class="ayanas-bd-custom${activePreset === 'custom' ? '' : ' is-hidden'}">
    <label>${escapeHtml(u.customStart)} <input type="date" id="ayanas-bd-start" value="${escapeHtml(customStart || period?.orderStart || '')}"></label>
    <label>${escapeHtml(u.customEnd)} <input type="date" id="ayanas-bd-end" value="${escapeHtml(customEnd || period?.orderEnd || '')}"></label>
    <button type="button" class="ayanas-bd-btn ayanas-bd-btn--primary" id="ayanas-bd-apply">${escapeHtml(u.applyPeriod)}</button>
  </div>
  <button type="button" class="ayanas-bd-btn ayanas-bd-btn--primary" id="ayanas-bd-reload">${escapeHtml(u.reload)}</button>
  <div class="ayanas-bd-period-banner">
    <span class="ayanas-bd-period-label">${escapeHtml(period?.label || '')}</span>
    ${period ? `<span class="ayanas-bd-period-range">${escapeHtml(period.orderStart)} 〜 ${escapeHtml(period.orderEnd)}</span>` : ''}
    <span class="ayanas-bd-period-basis">${escapeHtml(u.periodBasis)}</span>
  </div>
</div>`;

    };

    const formatMom = (mom, rate) => {
        if (mom === null || mom === undefined) {
            return '—';
        }
        const sign = mom > 0 ? '+' : '';
        const rateText = rate === null || rate === undefined
            ? ''
            : `（${sign}${(rate * 100).toFixed(1)}%）`;
        return `${sign}${formatInt(mom)}${rateText}`;
    };

    const formatMonthCell = (value, status) => {
        if (status === 'future') {
            return escapeHtml(ui().monthlyStatusFuture || '未到来');
        }
        if (status === 'before_data') {
            return escapeHtml(ui().monthlyStatusBeforeData || '—');
        }
        if (value === null || value === undefined) {
            return '—';
        }
        return formatInt(value);
    };

    const renderMonthlyChart = (report) => {
        const series = report.series || [];
        const max = Math.max(1, ...series.map((row) => (
            row.status === 'ready' ? (row.filteredKimono || 0) : 0
        )));
        const bars = series.map((row) => {
            const ready = row.status === 'ready';
            const height = ready ? Math.max(4, Math.round(((row.filteredKimono || 0) / max) * 120)) : 4;
            const cls = ready
                ? 'ayanas-bd-m-bar'
                : (row.status === 'future' ? 'ayanas-bd-m-bar is-future' : 'ayanas-bd-m-bar is-empty');
            const title = ready
                ? `${row.label}: ${row.filteredKimono}枚`
                : `${row.label}: ${row.status === 'future' ? '未到来' : '未集計'}`;
            return `
<div class="ayanas-bd-m-bar-wrap" title="${escapeHtml(title)}">
  <div class="${cls}" style="height:${height}px"></div>
  <span class="ayanas-bd-m-bar-label">${escapeHtml(row.label)}</span>
  <span class="ayanas-bd-m-bar-value">${ready ? formatInt(row.filteredKimono) : '—'}</span>
</div>`;
        }).join('');
        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(ui().monthlyChartTitle || '12か月 受注枚数推移')}</h2>
  <div class="ayanas-bd-m-chart">${bars}</div>
</section>`;
    };

    const renderMonthlyTable = (report) => {
        const u = ui();
        const yt = report.yearTotals || {};
        const tailorTotal = yt.tailorKimono || report.yearTotalKimono || 0;
        const conflictTotal = yt.conflictCount || report.conflictCount || 0;
        const overallTotal = tailorTotal + conflictTotal;
        const rows = (report.series || []).map((row) => {
            const selected = row.key === report.filters.selectedMonthKey ? ' is-selected' : '';
            return `
<tr class="ayanas-bd-m-row${selected}" data-bd-m-month="${escapeHtml(row.key)}">
  <td>${escapeHtml(row.label)}</td>
  <td class="num">${formatMonthCell(row.overseasKimono, row.status)}</td>
  <td class="num">${formatMonthCell(row.domesticKimono, row.status)}</td>
  <td class="num">${formatMonthCell(row.obiKimono, row.status)}</td>
  <td class="num">${formatMonthCell(row.tailorKimono, row.status)}</td>
  <td class="num">${formatMonthCell(row.cumulative, row.status)}</td>
  <td class="num">${row.status === 'ready' ? formatMom(row.mom, row.momRate) : '—'}</td>
</tr>`;
        }).join('');
        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.monthlyTableTitle || '月別一覧')}</h2>
  <p class="ayanas-bd-note">
    年度累計: 海外 ${formatInt(yt.overseasKimono || 0)}
    / 国内着物 ${formatInt(yt.domesticKimono || 0)}
    / 帯 ${formatInt(yt.obiKimono || 0)}
    / 仕立て合計 ${formatInt(tailorTotal)} 枚
    / 分類競合 ${formatInt(conflictTotal)} 件
    （全体 ${formatInt(overallTotal)} ＝ 仕立て合計 ${formatInt(tailorTotal)} ＋ 競合 ${formatInt(conflictTotal)}）
  </p>
  <table class="ayanas-bd-table ayanas-bd-table--summary">
    <thead>
      <tr>
        <th>${escapeHtml(u.monthlyColMonth || '月')}</th>
        <th>${escapeHtml(u.monthlyColOverseas || '海外仕立')}</th>
        <th>${escapeHtml(u.monthlyColDomestic || '国内着物仕立')}</th>
        <th>${escapeHtml(u.monthlyColObi || '帯仕立')}</th>
        <th>${escapeHtml(u.monthlyColTotal || '仕立て合計')}</th>
        <th>${escapeHtml(u.monthlyColCumulative || '累計')}</th>
        <th>${escapeHtml(u.monthlyColMom || '前月比')}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
    };

    const renderMonthlyAmounts = (report) => {
        const u = ui();
        const s = report.selectedMonth || {};
        const sep = s.amountSeparable
            ? formatYen(s.tailorAmount)
            : escapeHtml(u.monthlySeparationImpossible || '分離不可');
        const addon = s.amountSeparable
            ? formatYen(s.addonAmount)
            : escapeHtml(u.monthlySeparationImpossible || '分離不可');
        const avgTailor = s.avgTailorUnitPrice == null
            ? escapeHtml(u.monthlySeparationImpossible || '分離不可')
            : formatYen(s.avgTailorUnitPrice);
        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.monthlyAmountTitle || '金額・単価')}（${escapeHtml(s.label || '')}）</h2>
  <p class="ayanas-bd-note">${escapeHtml(u.monthlySeparationNote || '')}</p>
  <table class="ayanas-bd-table ayanas-bd-table--summary">
    <tbody>
      <tr><th>${escapeHtml(u.monthlyColOverseas || '海外仕立')}</th><td class="num">${formatInt(s.overseasKimono)} 枚</td></tr>
      <tr><th>${escapeHtml(u.monthlyColDomestic || '国内着物仕立')}</th><td class="num">${formatInt(s.domesticKimono)} 枚</td></tr>
      <tr><th>${escapeHtml(u.monthlyColObi || '帯仕立')}</th><td class="num">${formatInt(s.obiKimono)} 枚</td></tr>
      <tr><th>${escapeHtml(u.monthlyColTotal || '仕立て合計')}</th><td class="num">${formatInt(s.tailorKimono)} 枚</td></tr>
      <tr><th>${escapeHtml(u.monthlyOrderTotal || '受注総額')}</th><td class="num">${formatYen(s.orderTotal)}</td></tr>
      <tr><th>${escapeHtml(u.monthlyTailorAmount || '仕立て金額')}</th><td class="num">${sep}</td></tr>
      <tr><th>${escapeHtml(u.monthlyAddonAmount || '追加加工金額')}</th><td class="num">${addon}</td></tr>
      <tr><th>${escapeHtml(u.monthlyAvgOrder || '平均受注単価')}</th><td class="num">${s.avgOrderUnitPrice == null ? '—' : formatYen(s.avgOrderUnitPrice)}</td></tr>
      <tr><th>${escapeHtml(u.monthlyAvgTailor || '平均仕立単価')}</th><td class="num">${avgTailor}</td></tr>
      <tr><th>選択フィルタ枚数</th><td class="num">${formatInt(s.filteredKimono)}</td></tr>
    </tbody>
  </table>
</section>`;
    };

    const renderMonthlyKimonoTypes = (report) => {
        const u = ui();
        const rows = (report.kimonoTypes || []).map((row) => `
<tr>
  <td>${escapeHtml(row.kimonoType)}</td>
  <td class="num">${formatInt(row.overseasKimono)}</td>
  <td class="num">${formatInt(row.domesticKimono)}</td>
  <td class="num">${formatInt(row.obiKimono)}</td>
  <td class="num">${formatInt(row.tailorKimono)}</td>
</tr>`).join('') || '<tr><td colspan="5">データなし</td></tr>';
        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.monthlyKimonoTitle || '着物種類別')}</h2>
  <table class="ayanas-bd-table">
    <thead><tr>
      <th>着物種類</th>
      <th>${escapeHtml(u.monthlyRouteLabelOverseas || '海外')}</th>
      <th>${escapeHtml(u.monthlyRouteLabelDomestic || '国内着物')}</th>
      <th>${escapeHtml(u.monthlyRouteLabelObi || '帯')}</th>
      <th>${escapeHtml(u.monthlyColTotal || '合計')}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
    };

    const formatRouteLabel = (route) => {
        const u = ui();
        if (route === 'overseas') {
            return u.monthlyRouteLabelOverseas || '海外';
        }
        if (route === 'domestic') {
            return u.monthlyRouteLabelDomestic || '国内着物';
        }
        if (route === 'obi') {
            return u.monthlyRouteLabelObi || '帯';
        }
        if (route === 'conflict') {
            return u.monthlyRouteLabelConflict || '競合';
        }
        return route || '—';
    };

    const renderMonthlyConflicts = (report) => {
        const u = ui();
        const conflicts = report.conflicts || [];
        if (!conflicts.length) {
            return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.monthlyConflictsTitle || '仕立て分類の競合')}</h2>
  <p class="ayanas-bd-note">競合なし（1管理番号に複数の仕立て分類が同居する受注はありません）。</p>
</section>`;
        }
        const catLabel = (key) => formatRouteLabel(key);
        const rows = conflicts.map((row) => `
<tr>
  <td>${escapeHtml(row.manageNo)}</td>
  <td>${escapeHtml(row.orderDate)}</td>
  <td>${escapeHtml(row.customerName)}</td>
  <td>${escapeHtml(row.kimonoType)}</td>
  <td>${escapeHtml((row.tailorCategories || []).map(catLabel).join('＋'))}</td>
</tr>`).join('');
        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.monthlyConflictsTitle || '仕立て分類の競合')}</h2>
  <p class="ayanas-bd-note">分類競合 ${formatInt(report.conflictCount || conflicts.length)} 件。仕立て合計には含めません（全体＝仕立て合計＋競合）。元データは変更しません。</p>
  <table class="ayanas-bd-table">
    <thead><tr><th>管理番号</th><th>受注日</th><th>得意先</th><th>着物種類</th><th>同居分類</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
    };

    const renderMonthlyCustomerRank = (report) => {
        const rows = (report.customerRanking || []).slice(0, 30).map((row, index) => `
<tr>
  <td>${index + 1}</td>
  <td>${escapeHtml(row.customerName)}<div class="ayanas-bd-sub">${escapeHtml(row.customerCode)}</div></td>
  <td class="num">${formatInt(row.filteredKimono)}</td>
  <td class="num">${formatYen(row.orderTotal)}</td>
  <td class="num">${formatMom(row.kimonoDelta, row.kimonoDeltaRate)}</td>
  <td class="num">${formatMom(row.amountDelta, null)}</td>
</tr>`).join('') || '<tr><td colspan="6">データなし</td></tr>';
        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(ui().monthlyCustomerRankTitle || '得意先ランキング')}</h2>
  <table class="ayanas-bd-table">
    <thead>
      <tr><th>#</th><th>得意先</th><th>枚数</th><th>受注総額</th><th>枚数増減</th><th>金額増減</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
    };

    const renderMonthlyCustomerMatrix = (report) => {
        const months = report.fiscal?.months || [];
        const head = months.map((m) => `<th>${escapeHtml(m.label)}</th>`).join('');
        const rows = (report.customerMatrix || []).slice(0, 80).map((row) => {
            const cells = months.map((m) => {
                const status = (report.series || []).find((s) => s.key === m.key)?.status;
                if (status !== 'ready') {
                    return `<td class="num">${formatMonthCell(null, status || 'before_data')}</td>`;
                }
                const value = row.months[m.key];
                return `<td class="num">${formatInt(value || 0)}</td>`;
            }).join('');
            return `
<tr>
  <td>${escapeHtml(row.customerName)}<div class="ayanas-bd-sub">${escapeHtml(row.customerCode)}</div></td>
  ${cells}
  <td class="num">${formatInt(row.yearTotal)}</td>
</tr>`;
        }).join('') || `<tr><td colspan="${months.length + 2}">データなし</td></tr>`;
        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(ui().monthlyCustomerMatrixTitle || '得意先×月別')}</h2>
  <div class="ayanas-bd-scroll">
  <table class="ayanas-bd-table ayanas-bd-table--matrix">
    <thead><tr><th>得意先</th>${head}<th>計</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </div>
</section>`;
    };

    const renderMonthlyBacklog = (report) => {
        const backlog = report.backlog || { openKimono: 0, orders: [] };
        const rows = (backlog.orders || []).map((row) => `
<tr>
  <td>${escapeHtml(row.manageNo)}</td>
  <td>${escapeHtml(row.orderDate)}</td>
  <td>${escapeHtml(row.customerName)}</td>
  <td>${escapeHtml(row.kimonoType)}</td>
  <td>${escapeHtml(formatRouteLabel(row.route))}</td>
</tr>`).join('') || '<tr><td colspan="5">受注残なし</td></tr>';
        return `
<section class="ayanas-bd-section">
  <h2 class="ayanas-bd-section__title">${escapeHtml(ui().monthlyBacklogTitle || '未納品の受注残')}</h2>
  <p class="ayanas-bd-note">受注残枚数（フィルタ後・仕立着物）: ${formatInt(backlog.openKimono)}</p>
  <table class="ayanas-bd-table">
    <thead><tr><th>管理番号</th><th>受注日</th><th>得意先</th><th>着物種類</th><th>区分</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
    };

    const renderMonthlyFilters = (report) => {
        const u = ui();
        const years = (report.fiscalYears || []).map((y) => (
            `<option value="${y.startYear}"${Number(y.startYear) === Number(report.fiscal.startYear) ? ' selected' : ''}>${escapeHtml(y.label)}</option>`
        )).join('');
        const customers = [`<option value="ALL">${escapeHtml(u.monthlyCustomerAll || '全得意先')}</option>`]
            .concat((report.filterOptions?.customers || []).map((c) => (
                `<option value="${escapeHtml(c.customerCode)}"${c.customerCode === report.filters.customerCode ? ' selected' : ''}>${escapeHtml(c.customerName)}</option>`
            ))).join('');
        const types = [`<option value="ALL">${escapeHtml(u.monthlyKimonoAll || '全着物種類')}</option>`]
            .concat((report.filterOptions?.kimonoTypes || []).map((t) => (
                `<option value="${escapeHtml(t)}"${t === report.filters.kimonoType ? ' selected' : ''}>${escapeHtml(t)}</option>`
            ))).join('');
        const months = (report.series || []).map((m) => (
            `<option value="${escapeHtml(m.key)}"${m.key === report.filters.selectedMonthKey ? ' selected' : ''}>${escapeHtml(m.label)}</option>`
        )).join('');
        const routeBtn = (id, label) => (
            `<button type="button" class="ayanas-bd-btn${report.filters.route === id ? ' is-active' : ''}" data-bd-m-route="${id}">${escapeHtml(label)}</button>`
        );
        return `
<div class="ayanas-bd-m-filters">
  <label>${escapeHtml(u.monthlyFiscalYear || '分析年度')}
    <select id="ayanas-bd-m-year">${years}</select>
  </label>
  <div class="ayanas-bd-m-routes">
    ${routeBtn('all', u.monthlyRouteAll || '仕立て合計')}
    ${routeBtn('overseas', u.monthlyRouteOverseas || '海外仕立')}
    ${routeBtn('domestic', u.monthlyRouteDomestic || '国内着物仕立')}
    ${routeBtn('obi', u.monthlyRouteObi || '帯仕立')}
  </div>
  <label>得意先<select id="ayanas-bd-m-customer">${customers}</select></label>
  <label>着物種類<select id="ayanas-bd-m-kimono">${types}</select></label>
  <label>選択月<select id="ayanas-bd-m-month">${months}</select></label>
  <button type="button" class="ayanas-bd-btn ayanas-bd-btn--primary" id="ayanas-bd-m-apply">${escapeHtml(u.monthlyApply || '表示更新')}</button>
  <button type="button" class="ayanas-bd-btn" id="ayanas-bd-m-reload">${escapeHtml(u.monthlyReload || '再集計')}</button>
</div>
<p class="ayanas-bd-note">${escapeHtml(u.monthlyRouteNote || '')}</p>`;
    };

    const renderMonthlyView = () => {
        const u = ui();
        if (typeof CAYANAS_BusinessDashboardMonthly === 'undefined') {
            return `<div class="ayanas-bd-error">${escapeHtml(u.monthlyDepsMissing || '')}</div>`;
        }
        if (!lastMonthlyReport) {
            return `<p class="ayanas-bd-message">${escapeHtml(u.loading)}</p>`;
        }
        const report = lastMonthlyReport;
        return `
<div class="ayanas-bd-toolbar">
  <h1 class="ayanas-bd-title">${escapeHtml(u.monthlyTitle || '経営月次分析')}</h1>
  ${renderMainTabs()}
  <p class="ayanas-bd-lead">${escapeHtml(u.monthlyLead || '')}</p>
  <p class="ayanas-bd-note">${escapeHtml(u.monthlyDataStartNote || '')}
    / データ開始: ${escapeHtml(report.dataStartDate)} / 基準日: ${escapeHtml(report.asOfDate)}
    / ${escapeHtml(report.fiscal.label)}（${escapeHtml(report.fiscal.startDate)}〜${escapeHtml(report.fiscal.endDate)}）
  </p>
  ${renderMonthlyFilters(report)}
</div>
${renderMonthlyChart(report)}
${renderMonthlyTable(report)}
${renderMonthlyAmounts(report)}
${renderMonthlyKimonoTypes(report)}
${renderMonthlyCustomerRank(report)}
${renderMonthlyCustomerMatrix(report)}
${renderMonthlyBacklog(report)}
${renderMonthlyConflicts(report)}`;
    };

    const renderAll = (root) => {

        if (!isConfigured()) {
            root.innerHTML = `<div class="ayanas-bd-error">${escapeHtml(ui().noAppId)}</div>`;
            return;
        }

        const version = typeof CAYANAS_BUSINESS_DASHBOARD_VERSION !== 'undefined'
            ? CAYANAS_BUSINESS_DASHBOARD_VERSION
            : '';

        if (activeMainTab === 'monthly') {
            root.innerHTML = `
<div class="ayanas-bd-layout">
${renderMonthlyView()}
<p class="ayanas-bd-footer">業務ダッシュボード v${escapeHtml(version)} / 経営月次 / App ${cfg().BUSINESS_DASHBOARD_APP_ID}</p>
</div>`;
            return;
        }

        if (!lastReport) {
            root.innerHTML = `<p class="ayanas-bd-message">${escapeHtml(ui().loading)}</p>`;
            return;
        }

        root.innerHTML = `
<div class="ayanas-bd-layout">
${renderToolbar()}
${renderOverallStatus()}
${renderPipeline()}
${typeof CAYANAS_BusinessDashboardMoney !== 'undefined' ? CAYANAS_BusinessDashboardMoney.renderSection(lastReport) : ''}
${renderLogistics()}
${renderKimonoTypeSpec()}
${renderTailoring()}
${renderSekkai()}
${renderCustomers()}
${renderA550()}
${renderMeta()}
<p class="ayanas-bd-footer">業務ダッシュボード v${escapeHtml(version)} / App ${cfg().BUSINESS_DASHBOARD_APP_ID}</p>
</div>`;

    };

    const bindEvents = (root) => {

        root.querySelectorAll('[data-bd-main-tab]').forEach((button) => {
            button.addEventListener('click', () => {
                const next = button.getAttribute('data-bd-main-tab') || 'daily';
                if (next === activeMainTab) {
                    return;
                }
                activeMainTab = next;
                loadAndRender(root);
            });
        });

        root.querySelectorAll('[data-bd-m-route]').forEach((button) => {
            button.addEventListener('click', () => {
                monthlyRoute = button.getAttribute('data-bd-m-route') || 'all';
                loadAndRender(root);
            });
        });

        const mApply = root.querySelector('#ayanas-bd-m-apply');
        if (mApply) {
            mApply.addEventListener('click', () => {
                const yearEl = root.querySelector('#ayanas-bd-m-year');
                const custEl = root.querySelector('#ayanas-bd-m-customer');
                const typeEl = root.querySelector('#ayanas-bd-m-kimono');
                const monthEl = root.querySelector('#ayanas-bd-m-month');
                if (yearEl) {
                    monthlyFiscalStartYear = Number(yearEl.value) || monthlyFiscalStartYear;
                }
                if (custEl) {
                    monthlyCustomerCode = custEl.value || 'ALL';
                }
                if (typeEl) {
                    monthlyKimonoType = typeEl.value || 'ALL';
                }
                if (monthEl) {
                    monthlySelectedMonthKey = monthEl.value || '';
                }
                loadAndRender(root);
            });
        }

        const mReload = root.querySelector('#ayanas-bd-m-reload');
        if (mReload) {
            mReload.addEventListener('click', () => loadAndRender(root));
        }

        root.querySelectorAll('[data-bd-m-month]').forEach((row) => {
            row.addEventListener('click', () => {
                monthlySelectedMonthKey = row.getAttribute('data-bd-m-month') || '';
                loadAndRender(root);
            });
        });

        root.querySelectorAll('[data-bd-kimono-seg]').forEach((button) => {

            button.addEventListener('click', () => {

                activeKimonoSegment = button.getAttribute('data-bd-kimono-seg') || 'total';
                renderAll(root);
                bindEvents(root);

            });

        });

        root.querySelectorAll('[data-bd-preset]').forEach((button) => {

            button.addEventListener('click', () => {

                activePreset = button.getAttribute('data-bd-preset') || 'today';

                if (activePreset !== 'custom') {
                    loadAndRender(root);
                } else {
                    renderAll(root);
                    bindEvents(root);
                }

            });

        });

        const apply = root.querySelector('#ayanas-bd-apply');

        if (apply) {
            apply.addEventListener('click', () => {

                customStart = root.querySelector('#ayanas-bd-start')?.value || '';
                customEnd = root.querySelector('#ayanas-bd-end')?.value || '';
                activePreset = 'custom';
                loadAndRender(root);

            });
        }

        const reload = root.querySelector('#ayanas-bd-reload');

        if (reload) {
            reload.addEventListener('click', () => loadAndRender(root));
        }

        root.querySelectorAll('[data-tailoring]').forEach((button) => {

            button.addEventListener('click', (event) => {

                event.stopPropagation();
                const name = button.getAttribute('data-tailoring') || '';

                if (expandedTailoring.has(name)) {
                    expandedTailoring.delete(name);
                } else {
                    expandedTailoring.add(name);
                }

                renderAll(root);
                bindEvents(root);

            });

        });

        root.querySelectorAll('[data-customer]').forEach((button) => {

            button.addEventListener('click', (event) => {

                event.stopPropagation();
                const code = button.getAttribute('data-customer') || '';

                if (expandedCustomers.has(code)) {
                    expandedCustomers.delete(code);
                } else {
                    expandedCustomers.add(code);
                }

                renderAll(root);
                bindEvents(root);

            });

        });

        root.querySelectorAll('[data-pipeline]').forEach((button) => {

            button.addEventListener('click', (event) => {

                event.stopPropagation();
                const key = button.getAttribute('data-pipeline') || '';

                if (expandedPipeline.has(key)) {
                    expandedPipeline.delete(key);
                } else {
                    expandedPipeline.add(key);
                }

                renderAll(root);
                bindEvents(root);

            });

        });

        if (typeof CAYANAS_BusinessDashboardMoney !== 'undefined') {
            CAYANAS_BusinessDashboardMoney.bindEvents(root, {
                arReport: lastReport?.ar,
                rerender: () => {
                    renderAll(root);
                    bindEvents(root);
                },
                reloadAll: () => loadAndRender(root),
            });
        }

    };

    const loadAndRender = async (root) => {

        root.innerHTML = `<p class="ayanas-bd-message">${escapeHtml(ui().loading)}</p>`;

        try {

            if (activeMainTab === 'monthly') {
                if (typeof CAYANAS_BusinessDashboardMonthly === 'undefined') {
                    renderAll(root);
                    bindEvents(root);
                    return;
                }
                lastMonthlyReport = await CAYANAS_BusinessDashboardMonthly.buildMonthlyReport({
                    fiscalStartYear: monthlyFiscalStartYear || undefined,
                    route: monthlyRoute,
                    customerCode: monthlyCustomerCode,
                    kimonoType: monthlyKimonoType,
                    selectedMonthKey: monthlySelectedMonthKey || undefined,
                });
                monthlyFiscalStartYear = lastMonthlyReport.fiscal.startYear;
                monthlySelectedMonthKey = lastMonthlyReport.filters.selectedMonthKey;
                renderAll(root);
                bindEvents(root);
                return;
            }

            if (typeof CAYANAS_BusinessDashboardMoney !== 'undefined') {
                CAYANAS_BusinessDashboardMoney.clearCachesOnReload();
            }

            const businessPromise = CAYANAS_BusinessDashboardEngine.buildReport({
                preset: activePreset,
                customStart,
                customEnd,
            });

            let arReport = null;
            let arError = null;

            const arPromise = (typeof CAYANAS_AREngine !== 'undefined')
                ? CAYANAS_AREngine.buildReport().catch((error) => {
                    arError = error;
                    return null;
                })
                : Promise.resolve(null);

            const [businessReport, arResult] = await Promise.all([businessPromise, arPromise]);

            arReport = arResult;
            lastReport = {
                ...businessReport,
                ar: arReport,
                arError,
            };

            renderAll(root);
            bindEvents(root);

        } catch (error) {

            console.error('[ayanas-business-dashboard]', error);

            const apiMessage = error?.message
                || error?.error?.message
                || (typeof error === 'object' ? JSON.stringify(error) : String(error));

            root.innerHTML = `<div class="ayanas-bd-error">${escapeHtml(ui().errorPrefix)} ${escapeHtml(apiMessage)}</div>`;

        }

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (!isDashboardApp()) {
            return event;
        }

        document.body.classList.add(BODY_CLASS);

        const root = ensureRoot();

        if (!isConfigured()) {
            renderAll(root);
            return event;
        }

        loadAndRender(root);

        return event;

    });

    kintone.events.on('app.record.index.hide', (event) => {

        document.body.classList.remove(BODY_CLASS);

        const root = document.getElementById(ROOT_ID);

        if (root) {
            root.remove();
        }

        return event;

    });

}());
