import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SupplierAddressView,
  SupplierCategoryView,
  SupplierContactView,
  SupplierDetail,
  SupplierSensitiveView,
  SupplierStatus,
  SupplierSummary,
  SupplierTagView,
  SupplierType,
} from '../contracts';

export interface SuppliersWorkspaceProps {
  baseUrl: string;
  accessToken: string;
}

type ListResponse = { items: SupplierSummary[]; page: number; pageSize: number; total: number };
type Notice = { kind: 'success' | 'error'; text: string } | null;
type SupplierForm = {
  supplierType: SupplierType;
  legalName: string;
  tradeName: string;
  primaryPhone: string;
  secondaryPhone: string;
  whatsappPhone: string;
  email: string;
  website: string;
  nationalId: string;
  taxNumber: string;
  commercialRegistration: string;
  categoryId: string;
  notes: string;
  tagIds: string[];
};
type AddressForm = {
  label: string; governorate: string; city: string; street: string; details: string; landmark: string; phone: string; isDefault: boolean;
};
type ContactForm = {
  name: string; jobTitle: string; phone: string; whatsappPhone: string; email: string; isPrimary: boolean;
};

const emptySupplier: SupplierForm = {
  supplierType: 'COMPANY', legalName: '', tradeName: '', primaryPhone: '', secondaryPhone: '', whatsappPhone: '', email: '', website: '',
  nationalId: '', taxNumber: '', commercialRegistration: '', categoryId: '', notes: '', tagIds: [],
};
const emptyAddress: AddressForm = { label: '', governorate: '', city: '', street: '', details: '', landmark: '', phone: '', isDefault: false };
const emptyContact: ContactForm = { name: '', jobTitle: '', phone: '', whatsappPhone: '', email: '', isPrimary: false };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function supplierLayoutForWidth(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < 720) return 'mobile';
  if (width < 1080) return 'tablet';
  return 'desktop';
}

function nullable(value: string): string | null { return value.trim() ? value.trim() : null; }
function newKey(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
function phoneDigits(value: string | null): string { return (value ?? '').replace(/\D/g, ''); }
function addressToForm(address: SupplierAddressView): AddressForm {
  return {
    label: address.label ?? '', governorate: address.governorate ?? '', city: address.city ?? '', street: address.street ?? '',
    details: address.details ?? '', landmark: address.landmark ?? '', phone: address.phone ?? '', isDefault: address.isDefault,
  };
}
function contactToForm(contact: SupplierContactView): ContactForm {
  return {
    name: contact.name, jobTitle: contact.jobTitle ?? '', phone: contact.phone ?? '', whatsappPhone: contact.whatsappPhone ?? '',
    email: contact.email ?? '', isPrimary: contact.isPrimary,
  };
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell.replace(/\r$/, ''));
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

export function SuppliersWorkspace({ baseUrl, accessToken }: SuppliersWorkspaceProps) {
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('elhafez.suppliers.company') ?? '');
  const [list, setList] = useState<ListResponse>({ items: [], page: 1, pageSize: 25, total: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupplierStatus | ''>('');
  const [supplierType, setSupplierType] = useState<SupplierType | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [governorateFilter, setGovernorateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [categories, setCategories] = useState<SupplierCategoryView[]>([]);
  const [tags, setTags] = useState<SupplierTagView[]>([]);
  const [selected, setSelected] = useState<SupplierDetail | null>(null);
  const [sensitive, setSensitive] = useState<SupplierSensitiveView | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptySupplier);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sensitiveLoaded, setSensitiveLoaded] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddress);
  const [editingAddress, setEditingAddress] = useState<SupplierAddressView | null>(null);
  const [contactForm, setContactForm] = useState<ContactForm>(emptyContact);
  const [editingContact, setEditingContact] = useState<SupplierContactView | null>(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState<SupplierSummary[]>([]);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [auditRows, setAuditRows] = useState<Array<Record<string, unknown>>>([]);
  const [categoryName, setCategoryName] = useState('');
  const [tagName, setTagName] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const companyValid = uuidPattern.test(companyId);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${accessToken}`,
    'x-company-id': companyId,
  }), [accessToken, companyId]);

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'message' in payload ? String((payload as { message: unknown }).message) : `Request failed (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  }, [baseUrl, headers]);

  const filters = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    if (supplierType) params.set('supplierType', supplierType);
    if (categoryFilter) params.set('categoryId', categoryFilter);
    if (governorateFilter.trim()) params.set('governorate', governorateFilter.trim());
    if (cityFilter.trim()) params.set('city', cityFilter.trim());
    if (tagFilter) params.set('tagIds', tagFilter);
    if (createdFrom) params.set('createdFrom', createdFrom);
    if (createdTo) params.set('createdTo', createdTo);
    return params;
  }, [search, status, supplierType, categoryFilter, governorateFilter, cityFilter, tagFilter, createdFrom, createdTo]);

  const loadList = useCallback(async (page = 1) => {
    if (!companyValid) return;
    const params = new URLSearchParams(filters);
    params.set('page', String(page));
    params.set('pageSize', '25');
    try { setList(await request<ListResponse>(`/suppliers?${params}`)); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تحميل الموردين' }); }
  }, [companyValid, filters, request]);

  const loadClassifications = useCallback(async () => {
    if (!companyValid) return;
    try {
      const [nextCategories, nextTags] = await Promise.all([
        request<SupplierCategoryView[]>('/suppliers/categories?includeInactive=true'),
        request<SupplierTagView[]>('/suppliers/tags?includeInactive=true'),
      ]);
      setCategories(nextCategories);
      setTags(nextTags);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تحميل التصنيفات' }); }
  }, [companyValid, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadList(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [loadList]);
  useEffect(() => { void loadClassifications(); }, [loadClassifications]);

  async function openSupplier(id: string) {
    try {
      setBusy(true);
      const detail = await request<SupplierDetail>(`/suppliers/${id}`);
      setSelected(detail); setSensitive(null); setSensitiveLoaded(false); setAuditRows([]); setCreating(false); setEditing(false);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر فتح المورد' }); }
    finally { setBusy(false); }
  }

  function startCreate() {
    setCreating(true); setEditing(false); setSelected(null); setSensitive(null); setSensitiveLoaded(false);
    setForm(emptySupplier); setAddressForm({ ...emptyAddress, isDefault: true }); setContactForm({ ...emptyContact, isPrimary: true });
    setDuplicateWarnings([]); setDuplicateConfirmed(false); setNotice(null);
  }

  function startEdit() {
    if (!selected) return;
    setCreating(false); setEditing(true); setSensitiveLoaded(false); setSensitive(null); setDuplicateWarnings([]); setDuplicateConfirmed(true);
    setForm({
      supplierType: selected.supplierType, legalName: selected.legalName, tradeName: selected.tradeName ?? '', primaryPhone: selected.primaryPhone ?? '',
      secondaryPhone: selected.secondaryPhone ?? '', whatsappPhone: selected.whatsappPhone ?? '', email: selected.email ?? '', website: selected.website ?? '',
      nationalId: '', taxNumber: '', commercialRegistration: '', categoryId: selected.category?.id ?? '', notes: selected.notes ?? '', tagIds: selected.tags.map((tag) => tag.id),
    });
  }

  async function loadSensitive(forEdit = false) {
    if (!selected) return;
    try {
      const data = await request<SupplierSensitiveView>(`/suppliers/${selected.id}/sensitive`);
      setSensitive(data); setSensitiveLoaded(true);
      if (forEdit) setForm((current) => ({ ...current, nationalId: data.nationalId ?? '', taxNumber: data.taxNumber ?? '', commercialRegistration: data.commercialRegistration ?? '' }));
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'لا توجد صلاحية لعرض البيانات الحساسة' }); }
  }

  function basePayload() {
    return {
      supplierType: form.supplierType,
      legalName: form.legalName.trim(),
      tradeName: nullable(form.tradeName),
      primaryPhone: nullable(form.primaryPhone),
      secondaryPhone: nullable(form.secondaryPhone),
      whatsappPhone: nullable(form.whatsappPhone),
      email: nullable(form.email),
      website: nullable(form.website),
      categoryId: form.categoryId || null,
      notes: nullable(form.notes),
      tagIds: form.tagIds,
    };
  }

  function sensitivePayload() {
    return {
      nationalId: nullable(form.nationalId),
      taxNumber: nullable(form.taxNumber),
      commercialRegistration: nullable(form.commercialRegistration),
    };
  }

  function meaningfulAddress(): boolean {
    return [addressForm.label, addressForm.governorate, addressForm.city, addressForm.street, addressForm.details, addressForm.landmark].some((value) => value.trim());
  }

  function addressPayload() {
    return {
      label: nullable(addressForm.label), governorate: nullable(addressForm.governorate), city: nullable(addressForm.city), street: nullable(addressForm.street),
      details: nullable(addressForm.details), landmark: nullable(addressForm.landmark), phone: nullable(addressForm.phone), isDefault: addressForm.isDefault,
    };
  }

  function contactPayload() {
    return {
      name: contactForm.name.trim(), jobTitle: nullable(contactForm.jobTitle), phone: nullable(contactForm.phone), whatsappPhone: nullable(contactForm.whatsappPhone),
      email: nullable(contactForm.email), isPrimary: contactForm.isPrimary,
    };
  }

  async function saveSupplier(addAnother: boolean) {
    if (!form.legalName.trim()) { setNotice({ kind: 'error', text: 'اسم المورد مطلوب' }); return; }
    setBusy(true); setNotice(null);
    try {
      if (creating && !duplicateConfirmed) {
        const warnings = await request<SupplierSummary[]>('/suppliers/duplicates', { method: 'POST', body: JSON.stringify({ ...basePayload(), ...sensitivePayload() }) });
        if (warnings.length > 0) {
          setDuplicateWarnings(warnings);
          setNotice({ kind: 'error', text: 'وجدنا موردًا مشابهًا. راجع النتائج ثم اختر «متابعة رغم التشابه» إذا كان المورد جديدًا فعلًا.' });
          return;
        }
      }
      if (creating) {
        const body = {
          ...basePayload(), ...sensitivePayload(),
          addresses: meaningfulAddress() ? [addressPayload()] : [],
          contacts: contactForm.name.trim() ? [contactPayload()] : [],
        };
        const result = await request<{ supplier: SupplierDetail; warnings: SupplierSummary[]; replayed: boolean }>('/suppliers', {
          method: 'POST', headers: { 'Idempotency-Key': newKey('supplier-create') }, body: JSON.stringify(body),
        });
        setNotice({ kind: 'success', text: 'تم حفظ المورد' });
        await loadList(1);
        if (addAnother) startCreate(); else await openSupplier(result.supplier.id);
      } else if (editing && selected) {
        const body = {
          ...basePayload(),
          ...(sensitiveLoaded ? sensitivePayload() : {}),
          version: selected.version,
        };
        const updated = await request<SupplierDetail>(`/suppliers/${selected.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        setSelected(updated); setEditing(false); setNotice({ kind: 'success', text: 'تم تحديث المورد' }); await loadList(list.page);
      }
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر حفظ المورد' }); }
    finally { setBusy(false); }
  }

  async function changeStatus(next: SupplierStatus) {
    if (!selected) return;
    try {
      setBusy(true);
      const updated = await request<SupplierDetail>(`/suppliers/${selected.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next, version: selected.version }) });
      setSelected(updated); setNotice({ kind: 'success', text: 'تم تغيير حالة المورد' }); await loadList(list.page);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تغيير الحالة' }); }
    finally { setBusy(false); }
  }

  async function saveAddress(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    try {
      setBusy(true);
      if (editingAddress) {
        await request(`/suppliers/${selected.id}/addresses/${editingAddress.id}`, { method: 'PATCH', body: JSON.stringify({ ...addressPayload(), version: editingAddress.version }) });
      } else {
        await request(`/suppliers/${selected.id}/addresses`, { method: 'POST', body: JSON.stringify(addressPayload()) });
      }
      setAddressForm(emptyAddress); setEditingAddress(null); await openSupplier(selected.id); setNotice({ kind: 'success', text: 'تم حفظ العنوان' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر حفظ العنوان' }); }
    finally { setBusy(false); }
  }

  async function setDefaultAddress(address: SupplierAddressView) {
    if (!selected) return;
    try { await request(`/suppliers/${selected.id}/addresses/${address.id}/default`, { method: 'POST' }); await openSupplier(selected.id); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تعيين العنوان الافتراضي' }); }
  }

  async function deactivateAddress(address: SupplierAddressView) {
    if (!selected) return;
    try { await request(`/suppliers/${selected.id}/addresses/${address.id}/deactivate`, { method: 'POST', body: JSON.stringify({ version: address.version }) }); await openSupplier(selected.id); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تعطيل العنوان' }); }
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    try {
      setBusy(true);
      if (editingContact) {
        await request(`/suppliers/${selected.id}/contacts/${editingContact.id}`, { method: 'PATCH', body: JSON.stringify({ ...contactPayload(), version: editingContact.version }) });
      } else {
        await request(`/suppliers/${selected.id}/contacts`, { method: 'POST', body: JSON.stringify(contactPayload()) });
      }
      setContactForm(emptyContact); setEditingContact(null); await openSupplier(selected.id); setNotice({ kind: 'success', text: 'تم حفظ جهة الاتصال' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر حفظ جهة الاتصال' }); }
    finally { setBusy(false); }
  }

  async function setPrimaryContact(contact: SupplierContactView) {
    if (!selected) return;
    try { await request(`/suppliers/${selected.id}/contacts/${contact.id}/primary`, { method: 'POST' }); await openSupplier(selected.id); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تعيين جهة الاتصال الرئيسية' }); }
  }

  async function deactivateContact(contact: SupplierContactView) {
    if (!selected) return;
    try { await request(`/suppliers/${selected.id}/contacts/${contact.id}/deactivate`, { method: 'POST', body: JSON.stringify({ version: contact.version }) }); await openSupplier(selected.id); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تعطيل جهة الاتصال' }); }
  }

  async function createCategory() {
    if (!categoryName.trim()) return;
    try { await request('/suppliers/categories', { method: 'POST', body: JSON.stringify({ name: categoryName.trim() }) }); setCategoryName(''); await loadClassifications(); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر إنشاء التصنيف' }); }
  }

  async function toggleCategory(category: SupplierCategoryView) {
    try { await request(`/suppliers/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ name: category.name, active: !category.active }) }); await loadClassifications(); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تحديث التصنيف' }); }
  }

  async function createTag() {
    if (!tagName.trim()) return;
    try { await request('/suppliers/tags', { method: 'POST', body: JSON.stringify({ name: tagName.trim() }) }); setTagName(''); await loadClassifications(); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر إنشاء الوسم' }); }
  }

  async function toggleTag(tag: SupplierTagView) {
    try { await request(`/suppliers/tags/${tag.id}`, { method: 'PATCH', body: JSON.stringify({ name: tag.name, active: !tag.active }) }); await loadClassifications(); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تحديث الوسم' }); }
  }

  async function exportCsv() {
    if (!companyValid) return;
    try {
      const params = new URLSearchParams(filters);
      const result = await request<{ filename: string; csv: string; count: number }>(`/suppliers/export?${params}`);
      const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = result.filename; link.click(); URL.revokeObjectURL(url);
      setNotice({ kind: 'success', text: `تم تصدير ${result.count} مورد` });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر التصدير' }); }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || !companyValid) return;
    try {
      setBusy(true);
      const rows = parseCsv(await file.text()).map((row) => ({
        supplierType: row.supplierType,
        legalName: row.legalName,
        tradeName: nullable(row.tradeName ?? ''), primaryPhone: nullable(row.primaryPhone ?? ''), secondaryPhone: nullable(row.secondaryPhone ?? ''),
        whatsappPhone: nullable(row.whatsappPhone ?? ''), email: nullable(row.email ?? ''), website: nullable(row.website ?? ''),
        nationalId: nullable(row.nationalId ?? ''), taxNumber: nullable(row.taxNumber ?? ''), commercialRegistration: nullable(row.commercialRegistration ?? ''),
        categoryId: uuidPattern.test(row.categoryId ?? '') ? row.categoryId : null,
        tagIds: (row.tagIds ?? '').split('|').filter((id) => uuidPattern.test(id)), notes: nullable(row.notes ?? ''),
        addressLabel: nullable(row.addressLabel ?? ''), governorate: nullable(row.governorate ?? ''), city: nullable(row.city ?? ''), street: nullable(row.street ?? ''),
        addressDetails: nullable(row.addressDetails ?? ''), landmark: nullable(row.landmark ?? ''), addressPhone: nullable(row.addressPhone ?? ''),
        contactName: nullable(row.contactName ?? ''), contactJobTitle: nullable(row.contactJobTitle ?? ''), contactPhone: nullable(row.contactPhone ?? ''),
        contactWhatsappPhone: nullable(row.contactWhatsappPhone ?? ''), contactEmail: nullable(row.contactEmail ?? ''),
        contactIsPrimary: /^(true|1|yes)$/i.test(row.contactIsPrimary ?? ''),
      }));
      const result = await request<{ committed: boolean; created: number; rejected: Array<{ row: number; reason: string }> }>('/suppliers/import', {
        method: 'POST', headers: { 'Idempotency-Key': newKey('supplier-import') }, body: JSON.stringify({ rows }),
      });
      if (!result.committed) setNotice({ kind: 'error', text: `لم يتم الاستيراد. المرفوض: ${result.rejected.map((item) => `صف ${item.row}: ${item.reason}`).join(' | ')}` });
      else { setNotice({ kind: 'success', text: `تم استيراد ${result.created} مورد` }); await loadList(1); }
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر الاستيراد' }); }
    finally { setBusy(false); }
  }

  async function loadAudit() {
    if (!selected) return;
    try {
      const rows = await request<Array<Record<string, unknown>>>(`/audit?limit=200&companyId=${encodeURIComponent(companyId)}`);
      setAuditRows(rows.filter((row) => row.entityType === 'supplier' && row.entityId === selected.id));
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'لا توجد صلاحية لعرض سجل التدقيق' }); }
  }

  async function copyPhone(phone: string | null) {
    if (!phone) return;
    try { await navigator.clipboard.writeText(phone); setNotice({ kind: 'success', text: 'تم نسخ رقم الهاتف' }); }
    catch { setNotice({ kind: 'error', text: 'تعذر نسخ رقم الهاتف' }); }
  }

  function openWhatsapp(phone: string | null) {
    const digits = phoneDigits(phone); if (!digits) return; window.open(`https://wa.me/${digits}`, '_blank', 'noopener,noreferrer');
  }

  function clearFilters() {
    setSearch(''); setStatus(''); setSupplierType(''); setCategoryFilter(''); setGovernorateFilter(''); setCityFilter(''); setTagFilter(''); setCreatedFrom(''); setCreatedTo('');
  }

  function setCompany(value: string) {
    setCompanyId(value); localStorage.setItem('elhafez.suppliers.company', value); setSelected(null); setSensitive(null);
  }

  const activeCategories = categories.filter((category) => category.active || category.id === form.categoryId);
  const activeTags = tags.filter((tag) => tag.active || form.tagIds.includes(tag.id));

  return <section className="suppliers-workspace" dir="rtl">
    <header className="suppliers-head">
      <div><span className="eyebrow">Elhafez Platform</span><h2>الموردون</h2><p>Supplier Master Data فقط — بدون مشتريات أو أرصدة أو مدفوعات.</p></div>
      <div className="head-actions">
        <button className="primary" type="button" onClick={startCreate} disabled={!companyValid || busy}>+ مورد جديد</button>
        <button type="button" onClick={() => void exportCsv()} disabled={!companyValid || busy}>تصدير CSV</button>
        <label className="file-action">استيراد CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event)} disabled={!companyValid || busy}/></label>
      </div>
    </header>

    <div className="company-scope">
      <label>Company ID<input value={companyId} onChange={(event) => setCompany(event.target.value.trim())} placeholder="UUID الشركة"/></label>
      <span className={companyValid ? 'scope-ok' : 'scope-bad'}>{companyValid ? 'نطاق الشركة صالح' : 'أدخل Company UUID صالحًا'}</span>
    </div>
    {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}

    {(creating || editing) && <form className="supplier-editor" onSubmit={(event) => { event.preventDefault(); void saveSupplier(false); }}>
      <div className="section-title"><div><h3>{creating ? 'إضافة مورد' : 'تعديل المورد'}</h3><p>الحقول الحساسة لا تظهر في التعديل إلا بصلاحية منفصلة.</p></div><button type="button" onClick={() => { setCreating(false); setEditing(false); }}>إلغاء</button></div>
      <h4>البيانات الأساسية</h4>
      <div className="form-grid">
        <label>نوع المورد<select value={form.supplierType} onChange={(event) => setForm({ ...form, supplierType: event.target.value as SupplierType })}><option value="COMPANY">شركة</option><option value="INDIVIDUAL">فرد</option></select></label>
        <label>الاسم القانوني *<input value={form.legalName} onChange={(event) => { setForm({ ...form, legalName: event.target.value }); setDuplicateConfirmed(false); }}/></label>
        <label>الاسم التجاري<input value={form.tradeName} onChange={(event) => setForm({ ...form, tradeName: event.target.value })}/></label>
        <label>التصنيف<select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">بدون تصنيف</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? '' : ' (غير نشط)'}</option>)}</select></label>
      </div>
      <h4>بيانات الاتصال</h4>
      <div className="form-grid">
        <label>الهاتف الرئيسي<input value={form.primaryPhone} onChange={(event) => setForm({ ...form, primaryPhone: event.target.value })}/></label>
        <label>هاتف إضافي<input value={form.secondaryPhone} onChange={(event) => setForm({ ...form, secondaryPhone: event.target.value })}/></label>
        <label>WhatsApp<input value={form.whatsappPhone} onChange={(event) => setForm({ ...form, whatsappPhone: event.target.value })}/></label>
        <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label>
        <label>Website<input type="url" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="https://..."/></label>
      </div>
      <h4>البيانات التعريفية الحساسة</h4>
      {editing && !sensitiveLoaded && <button type="button" onClick={() => void loadSensitive(true)}>تحميل البيانات الحساسة للتعديل</button>}
      {(creating || sensitiveLoaded) && <div className="form-grid">
        <label>National ID<input value={form.nationalId} onChange={(event) => setForm({ ...form, nationalId: event.target.value })}/></label>
        <label>Tax Number<input value={form.taxNumber} onChange={(event) => setForm({ ...form, taxNumber: event.target.value })}/></label>
        <label>Commercial Registration<input value={form.commercialRegistration} onChange={(event) => setForm({ ...form, commercialRegistration: event.target.value })}/></label>
      </div>}
      <h4>التصنيف والوسوم</h4>
      <div className="tag-picker">{activeTags.map((tag) => <label key={tag.id}><input type="checkbox" checked={form.tagIds.includes(tag.id)} onChange={(event) => setForm({ ...form, tagIds: event.target.checked ? [...form.tagIds, tag.id] : form.tagIds.filter((id) => id !== tag.id) })}/>{tag.name}</label>)}</div>
      <h4>ملاحظات</h4><textarea rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/>
      {creating && <>
        <h4>عنوان أولي اختياري</h4><AddressFields value={addressForm} onChange={setAddressForm}/>
        <h4>جهة اتصال أولية اختيارية</h4><ContactFields value={contactForm} onChange={setContactForm}/>
      </>}
      {editing && selected && <div className="editor-owned-summary">العناوين الحالية: {selected.addresses.filter((item) => item.active).length} · جهات الاتصال: {selected.contacts.filter((item) => item.active).length}. إدارتها من ملف المورد بعد حفظ البيانات الأساسية.</div>}
      {duplicateWarnings.length > 0 && <div className="duplicate-box"><strong>موردون مشابهون:</strong>{duplicateWarnings.map((item) => <button type="button" key={item.id} onClick={() => void openSupplier(item.id)}>{item.supplierCode} — {item.legalName} — {item.primaryPhone ?? 'بدون هاتف'}</button>)}<button className="danger-outline" type="button" onClick={() => { setDuplicateConfirmed(true); setNotice(null); }}>متابعة رغم التشابه</button></div>}
      <div className="sticky-actions"><button className="primary" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>{creating && <button type="button" onClick={() => void saveSupplier(true)} disabled={busy}>حفظ وإضافة آخر</button>}</div>
    </form>}

    {!creating && !editing && <>
      <div className="filters-panel">
        <input className="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم، الكود، الهاتف، البريد، الرقم الضريبي أو جهة الاتصال…"/>
        <select value={status} onChange={(event) => setStatus(event.target.value as SupplierStatus | '')}><option value="">كل الحالات التشغيلية</option><option value="ACTIVE">نشط</option><option value="SUSPENDED">موقوف</option><option value="ARCHIVED">مؤرشف</option></select>
        <select value={supplierType} onChange={(event) => setSupplierType(event.target.value as SupplierType | '')}><option value="">كل الأنواع</option><option value="COMPANY">شركة</option><option value="INDIVIDUAL">فرد</option></select>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">كل التصنيفات</option>{categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input value={governorateFilter} onChange={(event) => setGovernorateFilter(event.target.value)} placeholder="المحافظة"/>
        <input value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} placeholder="المدينة"/>
        <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">كل الوسوم</option>{tags.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <label>من<input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)}/></label><label>إلى<input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)}/></label>
        <button type="button" onClick={clearFilters}>مسح الفلاتر</button>
      </div>

      <div className="suppliers-content">
        <div className="supplier-list-panel">
          <div className="list-meta"><strong>{list.total} مورد</strong><span>صفحة {list.page}</span></div>
          <div className="suppliers-table-wrap"><table><thead><tr><th>الكود</th><th>المورد</th><th>الهاتف</th><th>النوع</th><th>التصنيف</th><th>المدينة</th><th>الحالة</th><th>آخر تحديث</th><th></th></tr></thead><tbody>{list.items.map((item) => <tr key={item.id} className={selected?.id === item.id ? 'selected-row' : ''}><td>{item.supplierCode}</td><td><strong>{item.legalName}</strong><small>{item.tradeName}</small></td><td>{item.primaryPhone ?? '—'}</td><td>{item.supplierType === 'COMPANY' ? 'شركة' : 'فرد'}</td><td>{item.category?.name ?? '—'}</td><td>{item.city ?? '—'}</td><td><StatusBadge status={item.status}/></td><td>{new Date(item.updatedAt).toLocaleDateString('ar-EG')}</td><td><button type="button" onClick={() => void openSupplier(item.id)}>فتح</button></td></tr>)}</tbody></table></div>
          <div className="suppliers-cards">{list.items.map((item) => <button className="supplier-card" type="button" key={item.id} onClick={() => void openSupplier(item.id)}><span className="card-code">{item.supplierCode}</span><strong>{item.legalName}</strong><span>{item.primaryPhone ?? 'بدون هاتف'}</span><span>{item.category?.name ?? 'بدون تصنيف'} · {item.city ?? 'بدون مدينة'}</span><StatusBadge status={item.status}/></button>)}</div>
          <div className="pager"><button type="button" disabled={list.page <= 1} onClick={() => void loadList(list.page - 1)}>السابق</button><button type="button" disabled={list.page * list.pageSize >= list.total} onClick={() => void loadList(list.page + 1)}>التالي</button></div>
        </div>

        <aside className="classification-panel"><h3>التصنيفات</h3><div className="inline-create"><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="تصنيف جديد"/><button type="button" onClick={() => void createCategory()}>إضافة</button></div>{categories.map((item) => <div className="classification-row" key={item.id}><span>{item.name}</span><button type="button" onClick={() => void toggleCategory(item)}>{item.active ? 'تعطيل' : 'تفعيل'}</button></div>)}<h3>الوسوم</h3><div className="inline-create"><input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="وسم جديد"/><button type="button" onClick={() => void createTag()}>إضافة</button></div>{tags.map((item) => <div className="classification-row" key={item.id}><span>{item.name}</span><button type="button" onClick={() => void toggleTag(item)}>{item.active ? 'تعطيل' : 'تفعيل'}</button></div>)}</aside>
      </div>

      {selected && <article className="supplier-profile">
        <div className="profile-head"><div><span className="card-code">{selected.supplierCode}</span><h3>{selected.legalName}</h3><p>{selected.tradeName}</p></div><div className="profile-actions"><button type="button" onClick={startEdit}>تعديل</button><button type="button" onClick={() => void copyPhone(selected.primaryPhone)}>نسخ الهاتف</button><button type="button" onClick={() => openWhatsapp(selected.whatsappPhone ?? selected.primaryPhone)}>WhatsApp</button><button type="button" onClick={() => void loadAudit()}>سجل التدقيق</button></div></div>
        <div className="profile-grid"><Info title="النوع" value={selected.supplierType === 'COMPANY' ? 'شركة' : 'فرد'}/><Info title="الهاتف" value={selected.primaryPhone}/><Info title="هاتف إضافي" value={selected.secondaryPhone}/><Info title="WhatsApp" value={selected.whatsappPhone}/><Info title="Email" value={selected.email}/><Info title="Website" value={selected.website}/><Info title="التصنيف" value={selected.category?.name}/><Info title="الوسوم" value={selected.tags.map((tag) => tag.name).join('، ')}/><Info title="الحالة" value={selected.status}/></div>
        <div className="status-actions">{selected.status !== 'ACTIVE' && <button type="button" onClick={() => void changeStatus('ACTIVE')}>تفعيل</button>}{selected.status === 'ACTIVE' && <button type="button" onClick={() => void changeStatus('SUSPENDED')}>إيقاف</button>}{selected.status !== 'ARCHIVED' && <button className="danger-outline" type="button" onClick={() => void changeStatus('ARCHIVED')}>أرشفة</button>}</div>

        <section className="profile-section"><div className="section-title"><h4>البيانات الحساسة</h4>{!sensitive && <button type="button" onClick={() => void loadSensitive(false)}>عرض بصلاحية منفصلة</button>}</div>{sensitive && <div className="profile-grid"><Info title="National ID" value={sensitive.nationalId}/><Info title="Tax Number" value={sensitive.taxNumber}/><Info title="Commercial Registration" value={sensitive.commercialRegistration}/></div>}</section>

        <section className="profile-section"><h4>العناوين</h4><div className="owned-list">{selected.addresses.filter((item) => item.active).map((address) => <div className="owned-card" key={address.id}><div><strong>{address.label ?? 'عنوان'}</strong>{address.isDefault && <span className="mini-badge">افتراضي</span>}<p>{[address.governorate, address.city, address.street, address.details].filter(Boolean).join('، ')}</p><small>{address.phone}</small></div><div><button type="button" onClick={() => { setEditingAddress(address); setAddressForm(addressToForm(address)); }}>تعديل</button>{!address.isDefault && <button type="button" onClick={() => void setDefaultAddress(address)}>افتراضي</button>}<button type="button" onClick={() => void deactivateAddress(address)}>تعطيل</button></div></div>)}</div><form className="nested-form" onSubmit={(event) => void saveAddress(event)}><AddressFields value={addressForm} onChange={setAddressForm}/><div><button className="primary" type="submit">{editingAddress ? 'حفظ تعديل العنوان' : 'إضافة عنوان'}</button>{editingAddress && <button type="button" onClick={() => { setEditingAddress(null); setAddressForm(emptyAddress); }}>إلغاء</button>}</div></form></section>

        <section className="profile-section"><h4>جهات الاتصال</h4><div className="owned-list">{selected.contacts.filter((item) => item.active).map((contact) => <div className="owned-card" key={contact.id}><div><strong>{contact.name}</strong>{contact.isPrimary && <span className="mini-badge">رئيسي</span>}<p>{contact.jobTitle ?? 'بدون مسمى'} · {contact.phone ?? contact.whatsappPhone ?? 'بدون هاتف'}</p><small>{contact.email}</small></div><div><button type="button" onClick={() => { setEditingContact(contact); setContactForm(contactToForm(contact)); }}>تعديل</button>{!contact.isPrimary && <button type="button" onClick={() => void setPrimaryContact(contact)}>رئيسي</button>}<button type="button" onClick={() => void deactivateContact(contact)}>تعطيل</button></div></div>)}</div><form className="nested-form" onSubmit={(event) => void saveContact(event)}><ContactFields value={contactForm} onChange={setContactForm}/><div><button className="primary" type="submit">{editingContact ? 'حفظ تعديل جهة الاتصال' : 'إضافة جهة اتصال'}</button>{editingContact && <button type="button" onClick={() => { setEditingContact(null); setContactForm(emptyContact); }}>إلغاء</button>}</div></form></section>

        <section className="profile-section"><h4>ملاحظات</h4><p className="notes-box">{selected.notes || 'لا توجد ملاحظات'}</p></section>
        {auditRows.length > 0 && <section className="profile-section"><h4>سجل التدقيق</h4><div className="audit-list">{auditRows.map((row, index) => <div key={`${String(row.id ?? '')}-${index}`}><strong>{String(row.action ?? '')}</strong><span>{row.createdAt ? new Date(String(row.createdAt)).toLocaleString('ar-EG') : ''}</span></div>)}</div></section>}
      </article>}
    </>}
  </section>;
}

function AddressFields({ value, onChange }: { value: AddressForm; onChange: (value: AddressForm) => void }) {
  return <div className="form-grid address-fields"><label>الاسم<input value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })}/></label><label>المحافظة<input value={value.governorate} onChange={(event) => onChange({ ...value, governorate: event.target.value })}/></label><label>المدينة<input value={value.city} onChange={(event) => onChange({ ...value, city: event.target.value })}/></label><label>الشارع<input value={value.street} onChange={(event) => onChange({ ...value, street: event.target.value })}/></label><label>تفاصيل<input value={value.details} onChange={(event) => onChange({ ...value, details: event.target.value })}/></label><label>علامة مميزة<input value={value.landmark} onChange={(event) => onChange({ ...value, landmark: event.target.value })}/></label><label>هاتف العنوان<input value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })}/></label><label className="check"><input type="checkbox" checked={value.isDefault} onChange={(event) => onChange({ ...value, isDefault: event.target.checked })}/>عنوان افتراضي</label></div>;
}

function ContactFields({ value, onChange }: { value: ContactForm; onChange: (value: ContactForm) => void }) {
  return <div className="form-grid contact-fields"><label>الاسم<input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })}/></label><label>المسمى الوظيفي<input value={value.jobTitle} onChange={(event) => onChange({ ...value, jobTitle: event.target.value })}/></label><label>الهاتف<input value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })}/></label><label>WhatsApp<input value={value.whatsappPhone} onChange={(event) => onChange({ ...value, whatsappPhone: event.target.value })}/></label><label>Email<input type="email" value={value.email} onChange={(event) => onChange({ ...value, email: event.target.value })}/></label><label className="check"><input type="checkbox" checked={value.isPrimary} onChange={(event) => onChange({ ...value, isPrimary: event.target.checked })}/>جهة الاتصال الرئيسية</label></div>;
}

function Info({ title, value }: { title: string; value: string | null | undefined }) {
  return <div className="info"><span>{title}</span><strong>{value || '—'}</strong></div>;
}

function StatusBadge({ status }: { status: SupplierStatus }) {
  const label = status === 'ACTIVE' ? 'نشط' : status === 'SUSPENDED' ? 'موقوف' : 'مؤرشف';
  return <span className={`status-badge ${status.toLowerCase()}`}>{label}</span>;
}
