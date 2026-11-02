(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/invoice_window.js
     *
     * 長形3号窓付き封筒用・宛名ブロック HTML。
     */

    const InvoiceWindowTemplate = {};

    const esc = (value) => Format.escapeHtml(value);

    const formatPostal = (value) => {

        const raw = String(value ?? '').trim();

        if (!raw) {
            return '';
        }

        return raw.startsWith('〒') ? raw : `〒${raw}`;

    };

    const formatPerson = (value) => {

        const name = String(value ?? '').trim();

        if (!name) {
            return '';
        }

        return name.endsWith('様') ? name : `${name} 様`;

    };

    InvoiceWindowTemplate.buildAddressHtml = (header) => {

        const postal = formatPostal(header.customer_postal_code);
        const address = String(header.customer_address ?? '').trim();
        const company = String(header.customer_name ?? '').trim();
        const person = formatPerson(header.in_charge);

        return `
<div class="invoice-window-address">
    <p class="invoice-window-address__label">請求先</p>
    <p class="invoice-window-address__postal">${esc(postal)}</p>
    <p class="invoice-window-address__address">${esc(address)}</p>
    <p class="invoice-window-address__company">${esc(company)}</p>
    <p class="invoice-window-address__person">${esc(person)}</p>
</div>`;

    };

    window.InvoiceWindowTemplate = InvoiceWindowTemplate;

})();
