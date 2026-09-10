import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CustomerAddressView,
  CustomerCategoryView,
  CustomerDetail,
  CustomerStatus,
  CustomerSummary,
  CustomerTagView,
  CustomerType,
} from '../contracts';

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
type AddressForm = {
  label: string;
  governorate: string;
  city: string;
  street: string;
  details: string;
  landmark: string;
  phone: string;
  isDefault: boolean;
};

const emptyCustomer: CustomerForm = {
  customerType: 'INDIVIDUAL', fullName: '', tradeName: '', primaryPhone: '', secondaryPhone: '', whatsappPhone: '',
  email: '', nationalId: '', taxNumber: '', commercialRegistration: '', birthDate: '', gender: '', categoryId: '', source: '', notes: '', tagIds: [],
};
const emptyAddress: AddressForm = { label: '', governorate: '', city: '', street: '', details: '', landmark: '', phone: '', isDefault: false };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function customerLayoutForWidth(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < 720) return 'mobile';
  if (width < 1080) return 'tablet';
  return 'desktop';
}

function nullable(value: string): string | null { return value.trim() ? value.trim() : null; }
function newKey(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
function addressToForm(address: CustomerAddressView): AddressForm {
  return {
    label: address.label ?? '', governorate: address.governorate ?? '', city: address.city ?? '', street: address.street ?? '',
    details: address.details ?? '', landmark: address.landmark ?? '', phone: address.phone ?? '', isDefault: address.isDefault,
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

export function CustomersWorkspace({ baseUrl, accessToken }: CustomersWorkspaceProps) {
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('elhafez.customers.company') ?? '');
  const [list, setList] = useState<ListResponse>({ items: [], page: 1, pageSize: 25, total: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatus | ''>('');
  const [customerType, setCustomerType] = useState<CustomerType | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [governorateFilter, setGovernorateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [categories, setCategories] = useState<CustomerCategoryView[]>([]);
  const [tags, setTags] = useState<CustomerTagView[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyCustomer);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sensitiveLoaded, setSensitiveLoaded] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddress);
  const [editingAddress, setEditingAddress] = useState<CustomerAddressView | null>(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState<CustomerSummary[]>([]);
  const [auditRows, setAuditRows] = useState<Array<Record<string, unknown>>>([]);
  const [categoryName, setCategoryName] = useState('');
  const [tagName, setTagName] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
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

  const filterParams = useCallback((withPage: boolean, page = 1) => {
    const params = new URLSearchParams();
    if (withPage) { params.set('page', String(page)); params.set('pageSize', '25'); }
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    if (customerType) params.set('customerType', customerType);
    if (categoryFilter) params.set('categoryId', categoryFilter);
    if (governorateFilter.trim()) params.set('governorate', governorateFilter.trim());
    if (cityFilter.trim()) params.set('city', cityFilter.trim());
    if (tagFilter) params.set('tagIds', tagFilter);
    if (createdFrom) params.set('createdFrom', createdFrom);
    if (createdTo) params.set('createdTo', createdTo);
    return params;
  }, [categoryFilter, cityFilter, createdFrom, createdTo, customerType, governorateFilter, search, status, tagFilter]);

  const loadCustomers = useCallback(async (page = 1) => {
    if (!companyValid) return;
    setList(await api<ListResponse>(`/customers?${filterParams(true, page).toString()}`));
  }, [api, companyValid, filterParams]);

  const loadClassifications = useCallback(async () => {
    if (!companyValid) return;
    const [nextCategories, nextTags] = await Promise.all([
      api<CustomerCategoryView[]>('/customers/categories?includeInactive=true'),
      api<CustomerTagView[]>('/customers/tags?includeInactive=true'),
    ]);
    setCategories(nextCategories);
    setTags(nextTags);
  }, [api, companyValid]);

  useEffect(() => {
    if (!companyValid) return;
    localStorage.setItem('elhafez.customers.company', companyId);
    const timer = window.setTimeout(() => {
      void Promise.all([loadCustomers(1), loadClassifications()]).catch((error: unknown) => {
        setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not load customers' });
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [companyId, companyValid, loadClassifications, loadCustomers]);

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true); setNotice(null);
    try { await work(); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Operation failed' }); }
    finally { setBusy(false); }
  }

  async function openCustomer(id: string): Promise<void> {
    await run(async () => {
      setSelected(await api<CustomerDetail>(`/customers/${id}`));
      setCreating(false); setEditing(false); setSensitiveLoaded(false); setAuditRows([]); setEditingAddress(null); setAddressForm(emptyAddress);
    });
  }

  function startCreate(): void {
    setSelected(null); setForm(emptyCustomer); setAddressForm({ ...emptyAddress, isDefault: true }); setEditingAddress(null);
    setCreating(true); setEditing(false); setSensitiveLoaded(true); setDuplicateWarnings([]); setAuditRows([]);
  }

  function startEdit(): void {
    if (!selected) return;
    setForm({
      customerType: selected.customerType, fullName: selected.fullName, tradeName: selected.tradeName ?? '', primaryPhone: selected.primaryPhone ?? '',
      secondaryPhone: selected.secondaryPhone ?? '', whatsappPhone: selected.whatsappPhone ?? '', email: selected.email ?? '', nationalId: '', taxNumber: '',
      commercialRegistration: '', birthDate: '', gender: '', categoryId: selected.category?.id ?? '', source: selected.source ?? '', notes: selected.notes ?? '',
      tagIds: selected.tags.map((tag) => tag.id),
    });
    setEditing(true); setCreating(false); setSensitiveLoaded(false);
  }

  async function loadSensitive(): Promise<void> {
    if (!selected) return;
    await run(async () => {
      const sensitive = await api<{ nationalId: string | null; taxNumber: string | null; commercialRegistration: string | null; birthDate: string | null; gender: string | null }>(`/customers/${selected.id}/sensitive`);
      setForm((current) => ({ ...current, nationalId: sensitive.nationalId ?? '', taxNumber: sensitive.taxNumber ?? '', commercialRegistration: sensitive.commercialRegistration ?? '', birthDate: sensitive.birthDate ?? '', gender: sensitive.gender ?? '' }));
      setSensitiveLoaded(true);
    });
  }

  function customerPayload(): Record<string, unknown> {
    return {
      customerType: form.customerType, fullName: form.fullName, tradeName: nullable(form.tradeName), primaryPhone: nullable(form.primaryPhone),
      secondaryPhone: nullable(form.secondaryPhone), whatsappPhone: nullable(form.whatsappPhone), email: nullable(form.email), categoryId: form.categoryId || null,
      source: nullable(form.source), notes: nullable(form.notes), tagIds: form.tagIds,
      ...(sensitiveLoaded ? { nationalId: nullable(form.nationalId), taxNumber: nullable(form.taxNumber), commercialRegistration: nullable(form.commercialRegistration), birthDate: nullable(form.birthDate), gender: nullable(form.gender) } : {}),
    };
  }

  async function checkDuplicates(): Promise<void> {
    if (!form.fullName.trim()) return;
    try { setDuplicateWarnings(await api<CustomerSummary[]>('/customers/duplicates', { method: 'POST', body: JSON.stringify(customerPayload()) })); }
    catch { setDuplicateWarnings([]); }
  }

  async function persistCustomer(addAnother: boolean): Promise<void> {
    await run(async () => {
      if (editing && selected) {
        const updated = await api<CustomerDetail>(`/customers/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ ...customerPayload(), version: selected.version }) });
        setSelected(updated); setEditing(false); setNotice({ kind: 'success', text: 'Customer updated successfully' });
      } else {
        const hasAddress = [addressForm.label, addressForm.governorate, addressForm.city, addressForm.street, addressForm.details, addressForm.landmark].some((value) => value.trim());
        const response = await api<{ customer: CustomerDetail; warnings: CustomerSummary[] }>('/customers', {
          method: 'POST', headers: { 'Idempotency-Key': newKey('customer') },
          body: JSON.stringify({ ...customerPayload(), addresses: hasAddress ? [{ ...addressForm, label: nullable(addressForm.label), governorate: nullable(addressForm.governorate), city: nullable(addressForm.city), street: nullable(addressForm.street), details: nullable(addressForm.details), landmark: nullable(addressForm.landmark), phone: nullable(addressForm.phone) }] : [] }),
        });
        setDuplicateWarnings(response.warnings);
        if (addAnother) { setForm(emptyCustomer); setAddressForm({ ...emptyAddress, isDefault: true }); setCreating(true); }
        else { setSelected(response.customer); setCreating(false); }
        setNotice({ kind: 'success', text: 'Customer created successfully' });
      }
      await loadCustomers(1);
    });
  }

  async function quickAdd(): Promise<void> {
    const fullName = window.prompt('Customer name');
    if (!fullName?.trim()) return;
    const primaryPhone = window.prompt('Phone (optional)') ?? '';
    await run(async () => {
      const response = await api<{ customer: CustomerDetail }>('/customers/quick', { method: 'POST', headers: { 'Idempotency-Key': newKey('quick') }, body: JSON.stringify({ fullName, primaryPhone: nullable(primaryPhone) }) });
      setSelected(response.customer); setNotice({ kind: 'success', text: 'Quick customer created' }); await loadCustomers(1);
    });
  }

  async function changeStatus(next: CustomerStatus): Promise<void> {
    if (!selected) return;
    await run(async () => {
      const updated = await api<CustomerDetail>(`/customers/${selected.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next, version: selected.version }) });
      setSelected(updated); setNotice({ kind: 'success', text: `Status changed to ${next}` }); await loadCustomers(list.page);
    });
  }

  function beginAddressEdit(address: CustomerAddressView): void {
    setEditingAddress(address); setAddressForm(addressToForm(address));
  }

  async function saveAddress(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selected) return;
    await run(async () => {
      const body = { ...addressForm, label: nullable(addressForm.label), governorate: nullable(addressForm.governorate), city: nullable(addressForm.city), street: nullable(addressForm.street), details: nullable(addressForm.details), landmark: nullable(addressForm.landmark), phone: nullable(addressForm.phone) };
      if (editingAddress) {
        await api(`/customers/${selected.id}/addresses/${editingAddress.id}`, { method: 'PATCH', body: JSON.stringify({ ...body, version: editingAddress.version }) });
      } else {
        await api(`/customers/${selected.id}/addresses`, { method: 'POST', body: JSON.stringify(body) });
      }
      const refreshed = await api<CustomerDetail>(`/customers/${selected.id}`);
      setSelected(refreshed); setEditingAddress(null); setAddressForm(emptyAddress); setNotice({ kind: 'success', text: 'Address saved' });
    });
  }

  async function setDefault(addressId: string): Promise<void> {
    if (!selected) return;
    await run(async () => {
      await api(`/customers/${selected.id}/addresses/${addressId}/default`, { method: 'POST' });
      setSelected(await api<CustomerDetail>(`/customers/${selected.id}`));
    });
  }

  async function deactivateAddress(address: CustomerAddressView): Promise<void> {
    if (!selected) return;
    await run(async () => {
      await api(`/customers/${selected.id}/addresses/${address.id}/deactivate`, { method: 'POST', body: JSON.stringify({ version: address.version }) });
      setSelected(await api<CustomerDetail>(`/customers/${selected.id}`));
    });
  }

  async function loadAudit(): Promise<void> {
    if (!selected) return;
    await run(async () => {
      const rows = await api<Array<Record<string, unknown>>>(`/audit?limit=500&companyId=${encodeURIComponent(companyId)}`);
      setAuditRows(rows.filter((row) => row.entityType === 'customer' && row.entityId === selected.id));
    });
  }

  async function addClassification(kind: 'categories' | 'tags'): Promise<void> {
    const name = kind === 'categories' ? categoryName : tagName;
    if (!name.trim()) return;
    await run(async () => {
      await api(`/customers/${kind}`, { method: 'POST', body: JSON.stringify({ name }) });
      if (kind === 'categories') setCategoryName(''); else setTagName('');
      await loadClassifications();
    });
  }

  async function editClassification(kind: 'categories' | 'tags', item: CustomerCategoryView | CustomerTagView): Promise<void> {
    const name = window.prompt('Name', item.name);
    if (!name?.trim()) return;
    await run(async () => {
      await api(`/customers/${kind}/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name, active: item.active }) });
      await loadClassifications();
    });
  }

  async function toggleClassification(kind: 'categories' | 'tags', item: CustomerCategoryView | CustomerTagView): Promise<void> {
    await run(async () => {
      await api(`/customers/${kind}/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name: item.name, active: !item.active }) });
      await loadClassifications();
    });
  }

  async function importFile(file: File): Promise<void> {
    await run(async () => {
      const raw = parseCsv(await file.text());
      const rows = raw.map((row) => ({
        customerType: row.customerType === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL', fullName: row.fullName ?? '', tradeName: nullable(row.tradeName ?? ''),
        primaryPhone: nullable(row.primaryPhone ?? ''), secondaryPhone: nullable(row.secondaryPhone ?? ''), whatsappPhone: nullable(row.whatsappPhone ?? ''),
        email: nullable(row.email ?? ''), nationalId: nullable(row.nationalId ?? ''), taxNumber: nullable(row.taxNumber ?? ''), commercialRegistration: nullable(row.commercialRegistration ?? ''),
        birthDate: nullable(row.birthDate ?? ''), gender: nullable(row.gender ?? ''), source: nullable(row.source ?? ''), notes: nullable(row.notes ?? ''),
        addressLabel: nullable(row.addressLabel ?? ''), governorate: nullable(row.governorate ?? ''), city: nullable(row.city ?? ''), street: nullable(row.street ?? ''),
        addressDetails: nullable(row.addressDetails ?? ''), landmark: nullable(row.landmark ?? ''), addressPhone: nullable(row.addressPhone ?? ''),
      }));
      const result = await api<{ committed: boolean; created: number; rejected: Array<{ row: number; reason: string }> }>('/customers/import', { method: 'POST', headers: { 'Idempotency-Key': newKey('import') }, body: JSON.stringify({ rows }) });
      if (!result.committed) throw new Error(result.rejected.map((item) => `Row ${item.row}: ${item.reason}`).join('; '));
      setNotice({ kind: 'success', text: `Imported ${result.created} customers` }); await loadCustomers(1);
    });
  }

  async function exportCustomers(): Promise<void> {
    await run(async () => {
      const result = await api<{ filename: string; csv: string }>(`/customers/export?${filterParams(false).toString()}`);
      const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; anchor.click(); URL.revokeObjectURL(url);
    });
  }

  function clearFilters(): void {
    setSearch(''); setStatus(''); setCustomerType(''); setCategoryFilter(''); setGovernorateFilter(''); setCityFilter(''); setTagFilter(''); setCreatedFrom(''); setCreatedTo('');
  }

  const activeCategories = useMemo(() => categories.filter((item) => item.active), [categories]);
  const activeTags = useMemo(() => tags.filter((item) => item.active), [tags]);

  return <section className="customers-workspace" aria-busy={busy}>
    <header className="customers-toolbar">
      <div><h2>Customers</h2><p>Customer master data · v1.0.0</p></div>
      <div className="customers-actions">
        <button onClick={startCreate}>Add Customer</button><button className="secondary" onClick={() => void quickAdd()}>Quick Add</button>
        <button className="secondary" onClick={() => void exportCustomers()}>Export CSV</button>
        <label className="file-button">Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ''; }}/></label>
      </div>
    </header>

    <div className="company-scope"><label>Company ID<input value={companyId} onChange={(event) => setCompanyId(event.target.value.trim())} placeholder="UUID"/></label>{!companyValid && companyId && <span className="inline-error">Invalid Company UUID</span>}</div>
    {notice && <div className={`customers-notice ${notice.kind}`}>{notice.text}</div>}

    <div className="customers-filters extended">
      <input aria-label="Search customers" placeholder="Search name, code, phone, email, ID…" value={search} onChange={(event) => setSearch(event.target.value)}/>
      <select value={status} onChange={(event) => setStatus(event.target.value as CustomerStatus | '')}><option value="">Operational statuses</option><option>ACTIVE</option><option>SUSPENDED</option><option>ARCHIVED</option></select>
      <select value={customerType} onChange={(event) => setCustomerType(event.target.value as CustomerType | '')}><option value="">All types</option><option>INDIVIDUAL</option><option>COMPANY</option></select>
      <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <input placeholder="Governorate / region" value={governorateFilter} onChange={(event) => setGovernorateFilter(event.target.value)}/>
      <input placeholder="City / area" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}/>
      <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">All tags</option>{activeTags.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <label>Created from<input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)}/></label>
      <label>Created to<input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)}/></label>
      <button className="ghost" onClick={clearFilters}>Clear filters</button>
    </div>

    <div className="customers-grid">
      <div className="customers-list-panel">
        <div className="customers-table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Phone</th><th>Type</th><th>Category</th><th>City</th><th>Status</th><th>Updated</th></tr></thead><tbody>{list.items.map((customer) => <tr key={customer.id} className={selected?.id === customer.id ? 'selected' : ''} onClick={() => void openCustomer(customer.id)}><td>{customer.customerCode}</td><td>{customer.fullName}</td><td>{customer.primaryPhone ?? '—'}</td><td>{customer.customerType}</td><td>{customer.category?.name ?? '—'}</td><td>{customer.city ?? '—'}</td><td><span className={`status ${customer.status.toLowerCase()}`}>{customer.status}</span></td><td>{new Date(customer.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        <div className="customers-cards">{list.items.map((customer) => <button className="customer-card" key={customer.id} onClick={() => void openCustomer(customer.id)}><strong>{customer.fullName}</strong><span>{customer.customerCode}</span><span>{customer.primaryPhone ?? 'No phone'}</span><span className={`status ${customer.status.toLowerCase()}`}>{customer.status}</span></button>)}</div>
        <footer className="pager"><button disabled={list.page <= 1} onClick={() => void loadCustomers(list.page - 1)}>Previous</button><span>Page {list.page} · {list.total} customers</span><button disabled={list.page * list.pageSize >= list.total} onClick={() => void loadCustomers(list.page + 1)}>Next</button></footer>
      </div>

      <div className="customer-detail-panel">
        {(creating || editing) ? <form onSubmit={(event) => { event.preventDefault(); void persistCustomer(false); }}>
          <div className="panel-heading"><h3>{editing ? 'Edit Customer' : 'New Customer'}</h3><button type="button" className="ghost" onClick={() => { setCreating(false); setEditing(false); }}>Cancel</button></div>
          <FormFields form={form} setForm={setForm} categories={activeCategories} tags={activeTags} sensitiveEnabled={!editing || sensitiveLoaded} onDuplicateCheck={() => void checkDuplicates()}/>
          {editing && !sensitiveLoaded && <div className="form-section"><button type="button" className="secondary" onClick={() => void loadSensitive()}>Load sensitive fields</button><p>National ID, tax, registration, birth date and gender remain unchanged unless loaded with permission.</p></div>}
          {!editing && <div className="form-section"><h4>Initial Address</h4><AddressInputs value={addressForm} onChange={setAddressForm}/></div>}
          {duplicateWarnings.length > 0 && <div className="duplicate-warning"><strong>Possible duplicates</strong>{duplicateWarnings.map((item) => <button type="button" key={item.id} onClick={() => void openCustomer(item.id)}>{item.customerCode} — {item.fullName} — {item.primaryPhone ?? 'no phone'}</button>)}</div>}
          <div className="sticky-actions"><button type="submit" disabled={busy}>Save</button>{!editing && <button type="button" className="secondary" disabled={busy} onClick={() => void persistCustomer(true)}>Save & Add Another</button>}</div>
        </form> : selected ? <div>
          <div className="panel-heading"><div><h3>{selected.fullName}</h3><p>{selected.customerCode} · {selected.customerType}</p></div><div className="inline-actions"><button onClick={startEdit}>Edit</button><button className="secondary" onClick={() => { const phone = selected.primaryPhone ?? selected.whatsappPhone; if (phone) void navigator.clipboard.writeText(phone); }}>Copy phone</button><button className="secondary" onClick={() => { const phone = selected.whatsappPhone ?? selected.primaryPhone; if (phone) window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer'); }}>WhatsApp</button></div></div>
          <div className="profile-summary"><span className={`status ${selected.status.toLowerCase()}`}>{selected.status}</span><span>{selected.primaryPhone ?? 'No primary phone'}</span><span>{selected.email ?? 'No email'}</span><span>{selected.category?.name ?? 'No category'}</span></div>
          <div className="profile-section"><h4>Lifecycle</h4><div className="inline-actions">{selected.status !== 'ACTIVE' && <button onClick={() => void changeStatus('ACTIVE')}>Activate</button>}{selected.status === 'ACTIVE' && <button className="secondary" onClick={() => void changeStatus('SUSPENDED')}>Suspend</button>}{selected.status !== 'ARCHIVED' && <button className="danger" onClick={() => void changeStatus('ARCHIVED')}>Archive</button>}</div></div>
          <div className="profile-section"><h4>Addresses</h4>{selected.addresses.filter((address) => address.active).map((address) => <article className="address-card" key={address.id}><div><strong>{address.label ?? 'Address'}</strong>{address.isDefault && <span className="default-badge">Default</span>}<p>{[address.street,address.city,address.governorate].filter(Boolean).join(', ') || address.details || 'No formatted address'}</p></div><div className="inline-actions"><button className="secondary" onClick={() => beginAddressEdit(address)}>Edit</button>{!address.isDefault && <button className="secondary" onClick={() => void setDefault(address.id)}>Set default</button>}<button className="ghost" onClick={() => void deactivateAddress(address)}>Deactivate</button></div></article>)}{selected.status !== 'ARCHIVED' && <form className="address-add" onSubmit={(event) => void saveAddress(event)}><h4>{editingAddress ? 'Edit address' : 'Add address'}</h4><AddressInputs value={addressForm} onChange={setAddressForm}/><div className="inline-actions"><button type="submit">{editingAddress ? 'Save address' : 'Add address'}</button>{editingAddress && <button type="button" className="ghost" onClick={() => { setEditingAddress(null); setAddressForm(emptyAddress); }}>Cancel edit</button>}</div></form>}</div>
          <div className="profile-section"><h4>Classification</h4><p>{selected.tags.length ? selected.tags.map((tag) => tag.name).join(' · ') : 'No tags'}</p><p>Source: {selected.source ?? '—'}</p></div>
          <div className="profile-section"><h4>Notes</h4><p>{selected.notes ?? 'No notes'}</p></div>
          <div className="profile-section"><h4>History & Sensitive Data</h4><div className="inline-actions"><button className="secondary" onClick={() => void loadSensitive()}>Load sensitive data</button><button className="secondary" onClick={() => void loadAudit()}>View audit history</button></div>{sensitiveLoaded && <dl className="sensitive"><dt>National ID</dt><dd>{form.nationalId || '—'}</dd><dt>Tax number</dt><dd>{form.taxNumber || '—'}</dd><dt>Commercial registration</dt><dd>{form.commercialRegistration || '—'}</dd></dl>}{auditRows.length > 0 && <div className="audit-list">{auditRows.map((row, index) => <pre key={String(row.id ?? index)}>{JSON.stringify(row, null, 2)}</pre>)}</div>}</div>
        </div> : <div className="empty-state"><h3>Select a customer</h3><p>Open a customer from the list or create a new one.</p></div>}
      </div>
    </div>

    <section className="classification-manager"><h3>Customer Categories & Tags</h3><div className="classification-column"><div className="classification-create"><label>New category<input value={categoryName} onChange={(event) => setCategoryName(event.target.value)}/></label><button onClick={() => void addClassification('categories')}>Add</button></div>{categories.map((item) => <div className="classification-row" key={item.id}><span>{item.name} · {item.active ? 'Active' : 'Inactive'}</span><button className="secondary" onClick={() => void editClassification('categories', item)}>Rename</button><button className="ghost" onClick={() => void toggleClassification('categories', item)}>{item.active ? 'Deactivate' : 'Activate'}</button></div>)}</div><div className="classification-column"><div className="classification-create"><label>New tag<input value={tagName} onChange={(event) => setTagName(event.target.value)}/></label><button onClick={() => void addClassification('tags')}>Add</button></div>{tags.map((item) => <div className="classification-row" key={item.id}><span>{item.name} · {item.active ? 'Active' : 'Inactive'}</span><button className="secondary" onClick={() => void editClassification('tags', item)}>Rename</button><button className="ghost" onClick={() => void toggleClassification('tags', item)}>{item.active ? 'Deactivate' : 'Activate'}</button></div>)}</div></section>
  </section>;
}

function FormFields({ form, setForm, categories, tags, sensitiveEnabled, onDuplicateCheck }: { form: CustomerForm; setForm: (value: CustomerForm) => void; categories: CustomerCategoryView[]; tags: CustomerTagView[]; sensitiveEnabled: boolean; onDuplicateCheck: () => void }) {
  return <>
    <div className="form-section"><h4>Basic Data</h4><div className="form-grid"><label>Type<select value={form.customerType} onChange={(event) => setForm({ ...form, customerType: event.target.value as CustomerType })}><option>INDIVIDUAL</option><option>COMPANY</option></select></label><label className="span-2">Name<input required value={form.fullName} onBlur={onDuplicateCheck} onChange={(event) => setForm({ ...form, fullName: event.target.value })}/></label><label>Trade name<input value={form.tradeName} onBlur={onDuplicateCheck} onChange={(event) => setForm({ ...form, tradeName: event.target.value })}/></label></div></div>
    <div className="form-section"><h4>Contact Information</h4><div className="form-grid"><label>Primary phone<input value={form.primaryPhone} onBlur={onDuplicateCheck} onChange={(event) => setForm({ ...form, primaryPhone: event.target.value })}/></label><label>Secondary phone<input value={form.secondaryPhone} onBlur={onDuplicateCheck} onChange={(event) => setForm({ ...form, secondaryPhone: event.target.value })}/></label><label>WhatsApp<input value={form.whatsappPhone} onBlur={onDuplicateCheck} onChange={(event) => setForm({ ...form, whatsappPhone: event.target.value })}/></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label></div></div>
    <div className="form-section"><h4>Identification</h4><div className="form-grid"><label>National ID<input disabled={!sensitiveEnabled} value={form.nationalId} onBlur={onDuplicateCheck} onChange={(event) => setForm({ ...form, nationalId: event.target.value })}/></label><label>Tax number<input disabled={!sensitiveEnabled} value={form.taxNumber} onBlur={onDuplicateCheck} onChange={(event) => setForm({ ...form, taxNumber: event.target.value })}/></label><label>Commercial registration<input disabled={!sensitiveEnabled} value={form.commercialRegistration} onChange={(event) => setForm({ ...form, commercialRegistration: event.target.value })}/></label><label>Birth date<input type="date" disabled={!sensitiveEnabled} value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })}/></label><label>Gender<input disabled={!sensitiveEnabled} value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}/></label></div></div>
    <div className="form-section"><h4>Classification</h4><div className="form-grid"><label>Category<select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">No category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Source<input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}/></label><fieldset className="span-2"><legend>Tags</legend><div className="tag-picker">{tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={form.tagIds.includes(tag.id)} onChange={(event) => setForm({ ...form, tagIds: event.target.checked ? [...form.tagIds, tag.id] : form.tagIds.filter((id) => id !== tag.id) })}/>{tag.name}</label>)}</div></fieldset></div></div>
    <div className="form-section"><h4>Notes</h4><textarea rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></div>
  </>;
}

function AddressInputs({ value, onChange }: { value: AddressForm; onChange: (next: AddressForm) => void }) {
  return <div className="form-grid"><label>Label<input value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })}/></label><label>Governorate / Region<input value={value.governorate} onChange={(event) => onChange({ ...value, governorate: event.target.value })}/></label><label>City / Area<input value={value.city} onChange={(event) => onChange({ ...value, city: event.target.value })}/></label><label>Street<input value={value.street} onChange={(event) => onChange({ ...value, street: event.target.value })}/></label><label className="span-2">Details<input value={value.details} onChange={(event) => onChange({ ...value, details: event.target.value })}/></label><label>Landmark<input value={value.landmark} onChange={(event) => onChange({ ...value, landmark: event.target.value })}/></label><label>Address phone<input value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })}/></label><label className="checkbox"><input type="checkbox" checked={value.isDefault} onChange={(event) => onChange({ ...value, isDefault: event.target.checked })}/>Default address</label></div>;
}
