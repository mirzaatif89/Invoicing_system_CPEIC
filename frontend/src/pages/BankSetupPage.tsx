import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import ActionMenu from "../components/ActionMenu";

type Branch = { id: number; branchName: string; branchCode: string; address?: string | null; active: boolean };
type Bank = { id: number; code: string; name: string; active: boolean; branches: Branch[] };
type BankForm = { code: string; name: string; active: boolean };
type BranchForm = { branchCode: string; branchName: string; address: string; active: boolean };
const emptyBranch: BranchForm = { branchCode: "", branchName: "", address: "", active: true };

export default function BankSetupPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankForm, setBankForm] = useState<BankForm>({ code: "", name: "", active: true });
  const [branchForm, setBranchForm] = useState<BranchForm>(emptyBranch);
  const [openBankId, setOpenBankId] = useState<number | null>(null);
  const [editingBankId, setEditingBankId] = useState<number | null>(null);
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = async () => { try { setBanks((await api<{ data: Bank[] }>("/banks")).data); setError(""); } catch (err) { setError((err as Error).message); } };
  const nextBankCode = async () => { const result = await api<{ code: string }>("/banks/next-code"); setBankForm((current) => ({ ...current, code: result.code })); };
  useEffect(() => { void load(); void nextBankCode(); }, []);

  const submitBank = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editingBankId) await api(`/banks/${editingBankId}`, { method: "PUT", body: JSON.stringify(bankForm) });
      else await api("/banks", { method: "POST", body: JSON.stringify(bankForm) });
      setEditingBankId(null); setBankForm({ code: "", name: "", active: true }); await nextBankCode(); await load();
    } catch (err) { setError((err as Error).message); }
  };
  const openBranches = async (bank: Bank) => {
    if (openBankId === bank.id) { setOpenBankId(null); return; }
    try { const result = await api<{ code: string }>(`/banks/${bank.id}/branches/next-code`); setOpenBankId(bank.id); setEditingBranchId(null); setBranchForm({ ...emptyBranch, branchCode: result.code }); setError(""); } catch (err) { setError((err as Error).message); }
  };
  const submitBranch = async (event: FormEvent, bankId: number) => {
    event.preventDefault();
    try {
      if (editingBranchId) await api(`/banks/branches/${editingBranchId}`, { method: "PUT", body: JSON.stringify(branchForm) });
      else await api(`/banks/${bankId}/branches`, { method: "POST", body: JSON.stringify(branchForm) });
      const result = await api<{ code: string }>(`/banks/${bankId}/branches/next-code`); setEditingBranchId(null); setBranchForm({ ...emptyBranch, branchCode: result.code }); await load();
    } catch (err) { setError((err as Error).message); }
  };
  const deleteBank = async (bank: Bank) => { if (!confirm(`Delete bank "${bank.name}" and its branches?`)) return; try { await api(`/banks/${bank.id}`, { method: "DELETE" }); if (openBankId === bank.id) setOpenBankId(null); await load(); } catch (err) { setError((err as Error).message); } };
  const deleteBranch = async (branch: Branch) => { if (!confirm(`Delete branch "${branch.branchName}"?`)) return; try { await api(`/banks/branches/${branch.id}`, { method: "DELETE" }); await load(); } catch (err) { setError((err as Error).message); } };

  return <section>
    <div className="page-head"><div><h1>Bank &amp; Branch Setup</h1><p>Manage banks and branches used for cheque payments.</p></div></div>
    <div className="card">
      {error && <div className="alert">{error}</div>}
      <form className="slab-form" onSubmit={(event) => void submitBank(event)}>
        <label>Bank Code<input value={bankForm.code} onChange={(e) => setBankForm({ ...bankForm, code: e.target.value })} required /></label>
        <label>Bank Name<input value={bankForm.name} onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })} required /></label>
        <label className="checkbox-label"><input type="checkbox" checked={bankForm.active} onChange={(e) => setBankForm({ ...bankForm, active: e.target.checked })} />Active</label>
        <button className="primary">{editingBankId ? "Update Bank" : "Add Bank"}</button>
        {editingBankId && <button type="button" onClick={() => { setEditingBankId(null); setBankForm({ code: "", name: "", active: true }); void nextBankCode(); }}>Cancel</button>}
      </form>
      <div className="table-wrap"><table><thead><tr><th>Code</th><th>Bank</th><th>Active</th><th>Branches</th><th>Actions</th></tr></thead><tbody>
        {banks.map((bank) => <>
          <tr key={bank.id}><td>{bank.code}</td><td>{bank.name}</td><td>{bank.active ? "Yes" : "No"}</td><td>{bank.branches.length}</td><td><ActionMenu>
            <button onClick={() => { setEditingBankId(bank.id); setBankForm({ code: bank.code, name: bank.name, active: bank.active }); }}>Edit</button>
            <button onClick={() => void openBranches(bank)}>{openBankId === bank.id ? "Hide Branches" : "Show Branches"}</button><button className="danger" onClick={() => void deleteBank(bank)}>Delete</button>
          </ActionMenu></td></tr>
          {openBankId === bank.id && <tr key={`${bank.id}-branches`}><td colSpan={5}>
            <div className="form-actions"><button type="button" onClick={() => setOpenBankId(null)}>Hide Branches</button></div>
            <form className="slab-form" onSubmit={(event) => void submitBranch(event, bank.id)}>
              <label>Branch Code<input value={branchForm.branchCode} onChange={(e) => setBranchForm({ ...branchForm, branchCode: e.target.value })} required /></label>
              <label>Branch Name<input value={branchForm.branchName} onChange={(e) => setBranchForm({ ...branchForm, branchName: e.target.value })} required /></label>
              <label>Address<input value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} /></label>
              <label className="checkbox-label"><input type="checkbox" checked={branchForm.active} onChange={(e) => setBranchForm({ ...branchForm, active: e.target.checked })} />Active</label>
              <button className="primary">{editingBranchId ? "Update Branch" : "Add Branch"}</button>
              {editingBranchId && <button type="button" onClick={() => { setEditingBranchId(null); setBranchForm(emptyBranch); }}>Cancel</button>}
            </form>
            <table><thead><tr><th>Code</th><th>Branch</th><th>Address</th><th>Active</th><th>Actions</th></tr></thead><tbody>{bank.branches.map((branch) => <tr key={branch.id}>
              <td>{branch.branchCode}</td><td>{branch.branchName}</td><td>{branch.address || "-"}</td><td>{branch.active ? "Yes" : "No"}</td><td><ActionMenu>
                <button onClick={() => { setEditingBranchId(branch.id); setBranchForm({ branchCode: branch.branchCode, branchName: branch.branchName, address: branch.address || "", active: branch.active }); }}>Edit</button>
                <button className="danger" onClick={() => void deleteBranch(branch)}>Delete</button>
              </ActionMenu></td>
            </tr>)}</tbody></table>
          </td></tr>}
        </>)}
      </tbody></table></div>
    </div>
  </section>;
}
