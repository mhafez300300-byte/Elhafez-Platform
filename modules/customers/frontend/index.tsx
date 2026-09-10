import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomerCategoryView, CustomerDetail, CustomerStatus, CustomerSummary, CustomerTagView, CustomerType } from '../contracts';
import './customers.css';

export interface CustomersWorkspaceProps {
  baseUrl: string;
  accessToken: string;
}

type ListResponse = { items: CustomerSummary[]; page: number; pageSize: number; total: number };
type Notice = { kind: 'success' | 'error'; text: string } | null;
type CustomerForm = {
  customerType: CustomerType;
  fullName: string;
  tradeName: string;
  primaryPhone: string;
  secondaryPhone: string;
  whatsappPhone: string;
  email: string;
  nationalId: string;
  taxNumber: string;
  commercialRegistration: string;
  birthDate: string;
  gender: string;
  categoryId: string;
  source: string;
  notes: string;
  tagIds: string[];
};

type AddressForm = { label: string; governorate: string; city: string; street: string; details: string; landmark: string; phone: string; isDefault: boolean };

const emptyCustomer: CustomerForm = { customerType: 'INDIVIDUAL', fullName: '', tradeName: '', primaryPhone: '', secondaryPhone: '', whatsappPhone: '', email: '', nationalId: '', taxNumber: '', commercialRegistration: '', birthDate: '', gender: '', categoryId: '', source: '', notes: '', tagIds: [] };
const emptyAddress: AddressForm = { label: '', governorate: '', city: '', street: '', details: '', landmark: '', phone: '', isDefault: false };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function customerLayoutForWidth(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < 720) return 'mobile';
  if (width < 1080) return 'tablet';
  return 'desktop';
}

function nullable(value: string): string | null { return value.trim() ? value : null; }
function newKey(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }

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
  if (row.some((value) => value.length > 0)) rows.push(row);
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

export function CustomersWorkspace({ baseUrl, accessToken }: CustomersWorkspaceProps) {
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('elhafez.customers.company') ?? '');
  const [list, setList] = useState<ListResponse>({ items: [], page: 1, pageSize: 25, total: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatus | ''>('');
  const [customerType, setCustomerType] = useState<CustomerType | ''>('');
  const [categories, setCategories] = useState<CustomerCategoryView[]>([]);
  const [tags, setTags] = useState<CustomerTagView[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyCustomer);
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddress);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState<CustomerSummary[]>([]);
  const [sensitiveLoaded, setSensitiveLoaded] = useState(false);
  const [auditRows, setAuditRows] = useState<Array<Record<string, unknown>>>([]);
  const [categoryName, setCategoryName] = useState('');
  const [tagName, setTagName] = useState('');

  const companyValid = uuidPattern.test(companyId);

  const api = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    if (!companyValid) throw new Error('Enter a valid Company UUID first');
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-company-id': companyId,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | T | null;
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'error' in body ? body.error?.message : undefined;
      throw new Error(message ?? `Request failed (${response.status})`);
    }
    return body as T;
  }, [accessToken, baseUrl, companyId, companyValid]);

  const loadClassifications = useCallback(async () => {
    if (!companyValid) return;
    const [nextCategories, nextTags] = await Promise.all([
      api<CustomerCategoryView[]>('/customers/categories'),
      api<CustomerTagView[]>('/customers/tags'),
    ]);
    setCategories(nextCategories);
    setTags(nextTags);
  }, [api, companyValid]);

  const loadCustomers = useCallback(async (page = 1) => {
    if (!companyValid) return;
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    if (customerType) params.set('customerType', customerType);
    const next = await api<ListResponse>(`/customers?${params.toString()}`);
    setList(next);
  }, [api, companyValid, customerType, search, status]);

  useEffect(() => {
    if (!companyValid) return;
    localStorage.setItem('elhafez.customers.company', companyId);
    const timer = window.setTimeout(() => {
      void Promise.all([loadCustomers(1), loadClassifications()]).catch((error: unknown) => setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not load customers' }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [companyId, companyValid, loadClassifications, loadCustomers]);

  const selectedSummary = useMemo(() => selected ? list.items.find((item) => item.id === selected.id) ?? selected : null, [list.items, selected]);

  async function openCustomer(id: string): Promise<void> {
    setBusy(true); setNotice(null); setSensitiveLoaded(false); setAuditRows([]);
    try {
      const customer = await api<CustomerDetail>(`/customers/${id}`);
      setSelected(customer);
      setCreating(false); setEditing(false);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not open customer' }); }
    finally { setBusy(false); }
  }

  async function loadSensitive(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      const sensitive = await api<{ nationalId: string | null; taxNumber: string | null; commercialRegistration: string | null; birthDate: string | null; gender: string | null }>(`/customers/${selected.id}/sensitive`);
      setForm((current) => ({ ...current, nationalId: sensitive.nationalId ?? '', taxNumber: sensitive.taxNumber ?? '', commercialRegistration: sensitive.commercialRegistration ?? '', birthDate: sensitive.birthDate ?? '', gender: sensitive.gender ?? '' }));
      setSensitiveLoaded(true);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Sensitive data permission required' }); }
    finally { setBusy(false); }
  }

  async function loadAudit(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      const rows = await api<Array<Record<string, unknown>>>(`/audit?limit=500&companyId=${encodeURIComponent(companyId)}`);
      setAuditRows(rows.filter((row) => row.entityType === 'customer' && row.entityId === selected.id));
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Audit permission required' }); }
    finally { setBusy(false); }
  }

  function startCreate(): void {
    setSelected(null); setForm(emptyCustomer); setAddressForm({ ...emptyAddress, isDefault: true }); setCreating(true); setEditing(false); setDuplicateWarnings([]); setSensitiveLoaded(true);
  }

  async function startEdit(): Promise<void> {
    if (!selected) return;
    setForm({
      customerType: selected.customerType, fullName: selected.fullName, tradeName: selected.tradeName ?? '', primaryPhone: selected.primaryPhone ?? '', secondaryPhone: selected.secondaryPhone ?? '', whatsappPhone: selected.whatsappPhone ?? '', email: selected.email ?? '', nationalId: '', taxNumber: '', commercialRegistration: '', birthDate: '', gender: '', categoryId: selected.category?.id ?? '', source: selected.source ?? '', notes: selected.notes ?? '', tagIds: selected.tags.map((tag) => tag.id),
    });
    setEditing(true); setCreating(false); setSensitiveLoaded(false);
    try { await loadSensitive(); } catch { /* loadSensitive already reports authorization failure */ }
  }

  function customerPayload(): Record<string, unknown> {
    return {
      customerType: form.customerType,
      fullName: form.fullName,
      tradeName: nullable(form.tradeName),
      primaryPhone: nullable(form.primaryPhone),
      secondaryPhone: nullable(form.secondaryPhone),
      whatsappPhone: nullable(form.whatsappPhone),
      email: nullable(form.email),
      ...(sensitiveLoaded ? {
        nationalId: nullable(form.nationalId), taxNumber: nullable(form.taxNumber), commercialRegistration: nullable(form.commercialRegistration), birthDate: nullable(form.birthDate), gender: nullable(form.gender),
      } : {}),
      categoryId: form.categoryId || null,
      source: nullable(form.source), notes: nullable(form.notes), tagIds: form.tagIds,
    };
  }

  async function checkDuplicates(): Promise<void> {
    if (!form.fullName.trim()) return;
    try { setDuplicateWarnings(await api<CustomerSummary[]>('/customers/duplicates', { method: 'POST', body: JSON.stringify(customerPayload()) })); }
    catch { setDuplicateWarnings([]); }
  }

  async function saveCustomer(event: FormEvent, addAnother = false): Promise<void> {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      if (editing && selected) {
        const updated = await api<CustomerDetail>(`/customers/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ ...customerPayload(), version: selected.version }) });
        setSelected(updated); setEditing(false); setNotice({ kind: 'success', text: 'Customer updated successfully' });
      } else {
        const addressHasData = Object.entries(addressForm).some(([key, value]) => key !== 'isDefault' && Boolean(String(value).trim()));
        const response = await api<{ customer: CustomerDetail; warnings: CustomerSummary[] }>('/customers', { method: 'POST', headers: { 'Idempotency-Key': newKey('customer') }, body: JSON.stringify({ ...customerPayload(), addresses: addressHasData ? [{ ...addressForm, label: nullable(addressForm.label), governorate: nullable(addressForm.governorate), city: nullable(addressForm.city), street: nullable(addressForm.street), details: nullable(addressForm.details), landmark: nullable(addressForm.landmark), phone: nullable(addressForm.phone) }] : [] }) });
        setDuplicateWarnings(response.warnings);
        setNotice({ kind: 'success', text: 'Customer created successfully' });
        if (addAnother) { setForm(emptyCustomer); setAddressForm({ ...emptyAddress, isDefault: true }); setCreating(true); }
        else { setSelected(response.customer); setCreating(false); }
      }
      await loadCustomers(1);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Save failed' }); }
    finally { setBusy(false); }
  }

  async function quickAdd(): Promise<void> {
    const name = window.prompt('Customer name');
    if (!name) return;
    const phone = window.prompt('Phone (optional)') ?? '';
    setBusy(true);
    try {
      const response = await api<{ customer: CustomerDetail }>('/customers/quick', { method: 'POST', headers: { 'Idempotency-Key': newKey('quick') }, body: JSON.stringify({ fullName: name, primaryPhone: nullable(phone) }) });
      setSelected(response.customer); setNotice({ kind: 'success', text: 'Quick customer created' }); await loadCustomers(1);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Quick add failed' }); }
    finally { setBusy(false); }
  }

  async function changeStatus(next: CustomerStatus): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await api<CustomerDetail>(`/customers/${selected.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next, version: selected.version }) });
      setSelected(updated); setNotice({ kind: 'success', text: `Status changed to ${next}` }); await loadCustomers(list.page);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Status change failed' }); }
    finally { setBusy(false); }
  }

  async function addAddress(event: FormEvent): Promise<void> {
    event.preventDefault(); if (!selected) return; setBusy(true);
    try {
      await api(`/customers/${selected.id}/addresses`, { method: 'POST', body: JSON.stringify({ ...addressForm, label: nullable(addressForm.label), governorate: nullable(addressForm.governorate), city: nullable(addressForm.city), street: nullable(addressForm.street), details: nullable(addressForm.details), landmark: nullable(addressForm.landmark), phone: nullable(addressForm.phone) }) });
      setAddressForm(emptyAddress); await openCustomer(selected.id); setNotice({ kind: 'success', text: 'Address added' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Address save failed' }); }
    finally { setBusy(false); }
  }

  async function setDefault(addressId: string): Promise<void> {
    if (!selected) return; setBusy(true);
    try { await api(`/customers/${selected.id}/addresses/${addressId}/default`, { method: 'POST' }); await openCustomer(selected.id); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Default address failed' }); }
    finally { setBusy(false); }
  }

  async function deactivateAddress(addressId: string, version: number): Promise<void> {
    if (!selected) return; setBusy(true);
    try { await api(`/customers/${selected.id}/addresses/${addressId}/deactivate`, { method: 'POST', body: JSON.stringify({ version }) }); await openCustomer(selected.id); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Deactivate address failed' }); }
    finally { setBusy(false); }
  }

  async function addClassification(kind: 'categories' | 'tags'): Promise<void> {
    const name = kind === 'categories' ? categoryName : tagName;
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api(`/customers/${kind}`, { method: 'POST', body: JSON.stringify({ name }) });
      if (kind === 'categories') setCategoryName(''); else setTagName('');
      await loadClassifications();
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Classification save failed' }); }
    finally { setBusy(false); }
  }

  async function importFile(file: File): Promise<void> {
    setBusy(true); setNotice(null);
    try {
      const raw = parseCsv(await file.text());
      const rows = raw.map((row) => ({
        customerType: row.customerType === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL', fullName: row.fullName ?? '', tradeName: nullable(row.tradeName ?? ''), primaryPhone: nullable(row.primaryPhone ?? ''), secondaryPhone: nullable(row.secondaryPhone ?? ''), whatsappPhone: nullable(row.whatsappPhone ?? ''), email: nullable(row.email ?? ''), nationalId: nullable(row.nationalId ?? ''), taxNumber: nullable(row.taxNumber ?? ''), commercialRegistration: nullable(row.commercialRegistration ?? ''), birthDate: nullable(row.birthDate ?? ''), gender: nullable(row.gender ?? ''), source: nullable(row.source ?? ''), notes: nullable(row.notes ?? ''), addressLabel: nullable(row.addressLabel ?? ''), governorate: nullable(row.governorate ?? ''), city: nullable(row.city ?? ''), street: nullable(row.street ?? ''), addressDetails: nullable(row.addressDetails ?? ''), landmark: nullable(row.landmark ?? ''), addressPhone: nullable(row.addressPhone ?? ''),
      }));
      const result = await api<{ committed: boolean; created: number; rejected: Array<{ row: number; reason: string }> }>('/customers/import', { method: 'POST', headers: { 'Idempotency-Key': newKey('import') }, body: JSON.stringify({ rows }) });
      if (result.committed) { setNotice({ kind: 'success', text: `Imported ${result.created} customers` }); await loadCustomers(1); }
      else setNotice({ kind: 'error', text: `Import rejected: ${result.rejected.map((item) => `row ${item.row}: ${item.reason}`).join('; ')}` });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Import failed' }); }
    finally { setBusy(false); }
  }

  async function exportCustomers(): Promise<void> {
    setBusy(true);
    try {
      const result = await api<{ filename: string; csv: string }>('/customers/export');
      const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Export failed' }); }
    finally { setBusy(false); }
  }

  function copyPhone(): void {
    const phone = selected?.primaryPhone ?? selected?.whatsappPhone;
    if (phone) void navigator.clipboard.writeText(phone);
  }

  function openWhatsApp(): void {
    const phone = selected?.whatsappPhone ?? selected?.primaryPhone;
    if (phone) window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer');
  }

  return <section className="customers-workspace" aria-busy={busy}>
    <header className="customers-toolbar">
      <div><h2>Customers</h2><p>Customer master data — v1.0</p></div>
      <div className="customers-actions"><button onClick={startCreate}>Add Customer</button><button className="secondary" onClick={() => void quickAdd()}>Quick Add</button><button className="secondary" onClick={() => void exportCustomers()}>Export CSV</button><label className="file-button">Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ''; }}/></label></div>
    </header>
    <div className="company-scope"><label>Company ID<input value={companyId} onChange={(event) => setCompanyId(event.target.value.trim())} placeholder="UUID"/></label>{!companyValid && companyId && <span className="inline-error">Invalid Company UUID</span>}</div>
    {notice && <div className={`customers-notice ${notice.kind}`}>{notice.text}</div>}
    <div className="customers-filters"><input aria-label="Search customers" placeholder="Search name, code, phone, email, ID…" value={search} onChange={(event) => setSearch(event.target.value)}/><select value={status} onChange={(event) => setStatus(event.target.value as CustomerStatus | '')}><option value="">Operational statuses</option><option>ACTIVE</option><option>SUSPENDED</option><option>ARCHIVED</option></select><select value={customerType} onChange={(event) => setCustomerType(event.target.value as CustomerType | '')}><option value="">All types</option><option>INDIVIDUAL</option><option>COMPANY</option></select><button className="ghost" onClick={() => { setSearch(''); setStatus(''); setCustomerType(''); }}>Clear filters</button></div>

    <div className="customers-grid">
      <div className="customers-list-panel">
        <div className="customers-table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Phone</th><th>Type</th><th>Category</th><th>City</th><th>Status</th><th>Updated</th></tr></thead><tbody>{list.items.map((customer) => <tr key={customer.id} className={selected?.id === customer.id ? 'selected' : ''} onClick={() => void openCustomer(customer.id)}><td>{customer.customerCode}</td><td>{customer.fullName}</td><td>{customer.primaryPhone ?? '—'}</td><td>{customer.customerType}</td><td>{customer.category?.name ?? '—'}</td><td>{customer.city ?? '—'}</td><td><span className={`status ${customer.status.toLowerCase()}`}>{customer.status}</span></td><td>{new Date(customer.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        <div className="customers-cards">{list.items.map((customer) => <button className="customer-card" key={customer.id} onClick={() => void openCustomer(customer.id)}><strong>{customer.fullName}</strong><span>{customer.customerCode}</span><span>{customer.primaryPhone ?? 'No phone'}</span><span className={`status ${customer.status.toLowerCase()}`}>{customer.status}</span></button>)}</div>
        <footer className="pager"><button disabled={list.page <= 1} onClick={() => void loadCustomers(list.page - 1)}>Previous</button><span>Page {list.page} · {list.total} customers</span><button disabled={list.page * list.pageSize >= list.total} onClick={() => void loadCustomers(list.page + 1)}>Next</button></footer>
      </div>

      <div className="customer-detail-panel">
        {(creating || editing) ? <form onSubmit={(event) => void saveCustomer(event)}>
          <div className="panel-heading"><h3>{editing ? 'Edit Customer' : 'New Customer'}</h3><button type="button" className="ghost" onClick={() => { setCreating(false); setEditing(false); }}>Cancel</button></div>
          <div className="form-section"><h4>Basic Data</h4><div className="form-grid"><label>Type<select value={form.customerType} onChange={(event) => setForm({ ...form, customerType: event.target.value as CustomerType })}><option>INDIVIDUAL</option><option>COMPANY</option></select></label><label className="span-2">Name<input required value={form.fullName} onBlur={() => void checkDuplicates()} onChange={(event) => setForm({ ...form, fullName: event.target.value })}/></label><label>Trade name<input value={form.tradeName} onChange={(event) => setForm({ ...form, tradeName: event.target.value })}/></label></div></div>
          <div className="form-section"><h4>Contact Information</h4><div className="form-grid"><label>Primary phone<input value={form.primaryPhone} onBlur={() => void checkDuplicates()} onChange={(event) => setForm({ ...form, primaryPhone: event.target.value })}/></label><label>Secondary phone<input value={form.secondaryPhone} onChange={(event) => setForm({ ...form, secondaryPhone: event.target.value })}/></label><label>WhatsApp<input value={form.whatsappPhone} onChange={(event) => setForm({ ...form, whatsappPhone: event.target.value })}/></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label></div></div>
          <div className="form-section"><h4>Identification</h4>{editing && !sensitiveLoaded && <button type="button" className="secondary" onClick={() => void loadSensitive()}>Load sensitive fields</button>}<div className="form-grid"><label>National ID<input disabled={editing && !sensitiveLoaded} value={form.nationalId} onChange={(event) => setForm({ ...form, nationalId: event.target.value })}/></label><label>Tax number<input disabled={editing && !sensitiveLoaded} value={form.taxNumber} onChange={(event) => setForm({ ...form, taxNumber: event.target.value })}/></label><label>Commercial registration<input disabled={editing && !sensitiveLoaded} value={form.commercialRegistration} onChange={(event) => setForm({ ...form, commercialRegistration: event.target.value })}/></label><label>Birth date<input type="date" disabled={editing && !sensitiveLoaded} value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })}/></label><label>Gender<input disabled={editing && !sensitiveLoaded} value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}/></label></div></div>
          <div className="form-section"><h4>Classification</h4><div className="form-grid"><label>Category<select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">No category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Source<input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}/></label><fieldset className="span-2"><legend>Tags</legend><div className="tag-picker">{tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={form.tagIds.includes(tag.id)} onChange={(event) => setForm({ ...form, tagIds: event.target.checked ? [...form.tagIds, tag.id] : form.tagIds.filter((id) => id !== tag.id) })}/>{tag.name}</label>)}</div></fieldset></div></div>
          {!editing && <div className="form-section"><h4>Initial Address</h4><AddressInputs value={addressForm} onChange={setAddressForm}/></div>}
          <div className="form-section"><h4>Notes</h4><textarea rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></div>
          {duplicateWarnings.length > 0 && <div className="duplicate-warning"><strong>Possible duplicates</strong>{duplicateWarnings.map((item) => <button type="button" key={item.id} onClick={() => void openCustomer(item.id)}>{item.customerCode} — {item.fullName} — {item.primaryPhone ?? 'no phone'}</button>)}</div>}
          <div className="sticky-actions"><button type="submit" disabled={busy}>Save</button>{!editing && <button type="button" className="secondary" disabled={busy} onClick={(event) => void saveCustomer(event as unknown as FormEvent, true)}>Save & Add Another</button>}</div>
        </form> : selectedSummary && selected ? <div>
          <div className="panel-heading"><div><h3>{selected.fullName}</h3><p>{selected.customerCode} · {selected.customerType}</p></div><div className="inline-actions"><button onClick={() => void startEdit()}>Edit</button><button className="secondary" onClick={copyPhone}>Copy phone</button><button className="secondary" onClick={openWhatsApp}>WhatsApp</button></div></div>
          <div className="profile-summary"><span className={`status ${selected.status.toLowerCase()}`}>{selected.status}</span><span>{selected.primaryPhone ?? 'No primary phone'}</span><span>{selected.email ?? 'No email'}</span><span>{selected.category?.name ?? 'No category'}</span></div>
          <div className="profile-section"><h4>Lifecycle</h4><div className="inline-actions">{selected.status !== 'ACTIVE' && <button onClick={() => void changeStatus('ACTIVE')}>Activate</button>}{selected.status === 'ACTIVE' && <button className="secondary" onClick={() => void changeStatus('SUSPENDED')}>Suspend</button>}{selected.status !== 'ARCHIVED' && <button className="danger" onClick={() => void changeStatus('ARCHIVED')}>Archive</button>}</div></div>
          <div className="profile-section"><h4>Addresses</h4>{selected.addresses.filter((address) => address.active).map((address) => <article className="address-card" key={address.id}><div><strong>{address.label ?? 'Address'}</strong>{address.isDefault && <span className="default-badge">Default</span>}<p>{[address.street,address.city,address.governorate].filter(Boolean).join(', ') || address.details || 'No formatted address'}</p></div><div className="inline-actions">{!address.isDefault && <button className="secondary" onClick={() => void setDefault(address.id)}>Set default</button>}<button className="ghost" onClick={() => void deactivateAddress(address.id, address.version)}>Deactivate</button></div></article>)}{selected.status !== 'ARCHIVED' && <form className="address-add" onSubmit={(event) => void addAddress(event)}><AddressInputs value={addressForm} onChange={setAddressForm}/><button type="submit">Add address</button></form>}</div>
          <div className="profile-section"><h4>Classification</h4><p>{selected.tags.length ? selected.tags.map((tag) => tag.name).join(' · ') : 'No tags'}</p><p>Source: {selected.source ?? '—'}</p></div>
          <div className="profile-section"><h4>Notes</h4><p>{selected.notes ?? 'No notes'}</p></div>
          <div className="profile-section"><h4>History & Sensitive Data</h4><div className="inline-actions"><button className="secondary" onClick={() => void loadSensitive()}>Load sensitive data</button><button className="secondary" onClick={() => void loadAudit()}>View audit history</button></div>{sensitiveLoaded && <dl className="sensitive"><dt>National ID</dt><dd>{form.nationalId || '—'}</dd><dt>Tax number</dt><dd>{form.taxNumber || '—'}</dd><dt>Commercial registration</dt><dd>{form.commercialRegistration || '—'}</dd></dl>}{auditRows.length > 0 && <div className="audit-list">{auditRows.map((row, index) => <pre key={`${String(row.id ?? index)}`}>{JSON.stringify(row, null, 2)}</pre>)}</div>}</div>
        </div> : <div className="empty-state"><h3>Select a customer</h3><p>Open a customer from the list or create a new one.</p></div>}
      </div>
    </div>

    <section className="classification-manager"><h3>Customer Categories & Tags</h3><div><label>New category<input value={categoryName} onChange={(event) => setCategoryName(event.target.value)}/></label><button onClick={() => void addClassification('categories')}>Add category</button></div><div><label>New tag<input value={tagName} onChange={(event) => setTagName(event.target.value)}/></label><button onClick={() => void addClassification('tags')}>Add tag</button></div></section>
  </section>;
}

function AddressInputs({ value, onChange }: { value: AddressForm; onChange: (next: AddressForm) => void }) {
  return <div className="form-grid"><label>Label<input value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })}/></label><label>Governorate / Region<input value={value.governorate} onChange={(event) => onChange({ ...value, governorate: event.target.value })}/></label><label>City / Area<input value={value.city} onChange={(event) => onChange({ ...value, city: event.target.value })}/></label><label>Street<input value={value.street} onChange={(event) => onChange({ ...value, street: event.target.value })}/></label><label className="span-2">Details<input value={value.details} onChange={(event) => onChange({ ...value, details: event.target.value })}/></label><label>Landmark<input value={value.landmark} onChange={(event) => onChange({ ...value, landmark: event.target.value })}/></label><label>Address phone<input value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })}/></label><label className="checkbox"><input type="checkbox" checked={value.isDefault} onChange={(event) => onChange({ ...value, isDefault: event.target.checked })}/>Default address</label></div>;
}
