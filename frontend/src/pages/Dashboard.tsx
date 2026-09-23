import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileBarChart, FileText, Landmark, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";

type Summary = { fiscalYear: string; totalBudget: number; totalExpense: number; totalBalance: number; totalIncomeTaxDeducted: number; totalSalesTaxDeducted: number; invoiceCount: number; budgetDocumentCount: number; payeeCount: number; accountCodeCount: number; topAccountCodesByExpense: { code: string; name: string; totalExpense: number }[]; topVendorsByPayment: { code: string; name: string; totalPaid: number }[] };
type Monthly = { month: string; totalPayments: number };
const money = (value: number) => `PKR ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const currentFiscalYear = new Date().getUTCFullYear() - (new Date().getUTCMonth() < 6 ? 1 : 0);
const years = Array.from({ length: 5 }, (_, index) => currentFiscalYear - index);

function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; } const start = performance.now(), duration = 550; const tick = (now: number) => { const progress = Math.min(1, (now - start) / duration); setShown(value * (1 - Math.pow(1 - progress, 3))); if (progress < 1) requestAnimationFrame(tick); }; const frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [value]);
  return <>{money(shown)}</>;
}
const tooltipFormatter = (value: unknown) => money(Number(value || 0));

export default function Dashboard() {
  const [fiscalYear, setFiscalYear] = useState(String(currentFiscalYear)), [summary, setSummary] = useState<Summary | null>(null), [monthly, setMonthly] = useState<Monthly[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); setError(""); Promise.all([api<Summary>(`/dashboard/summary?fiscalYear=${fiscalYear}`), api<Monthly[]>(`/dashboard/monthly-payments?fiscalYear=${fiscalYear}`)]).then(([nextSummary, nextMonthly]) => { setSummary(nextSummary); setMonthly(nextMonthly); }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false)); }, [fiscalYear]);
  const budgetUsed = summary && summary.totalBudget > 0 ? Math.min(100, Math.max(0, summary.totalExpense / summary.totalBudget * 100)) : 0;
  const pieData = summary ? [{ name: "Expense", value: Math.max(0, summary.totalExpense) }, { name: "Balance", value: Math.max(0, summary.totalBalance) }] : [];
  const cards = summary ? [{ label: "Total Budget", value: summary.totalBudget, tone: "teal" }, { label: "Total Expense", value: summary.totalExpense, tone: "gold" }, { label: "Balance Remaining", value: summary.totalBalance, tone: summary.totalBalance >= 0 ? "success" : "danger" }, { label: "Income Tax Deducted", value: summary.totalIncomeTaxDeducted, tone: "neutral" }, { label: "Sales Tax Deducted", value: summary.totalSalesTaxDeducted, tone: "neutral" }] : [];
  return <section className="dashboard">
    <div className="dashboard-titlebar"><div><span className="eyebrow">Management Overview</span><h1>Institute Accounts System</h1><p>Financial position and invoice activity for the selected fiscal year.</p></div><label className="fiscal-selector">Fiscal Year<select value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)}>{years.map((year) => <option key={year} value={year}>{year}-{String(year + 1).slice(-2)}</option>)}</select></label></div>
    {error && <div className="alert">{error}</div>}
    {loading && !summary ? <div className="card dashboard-loading"><RefreshCw /> Loading dashboard data...</div> : summary && <>
      <div className="summary-cards">{cards.map((card) => <div className={`summary-card summary-${card.tone}`} key={card.label}><span>{card.label}</span><strong><AnimatedNumber value={card.value} /></strong></div>)}<div className="summary-card summary-counts"><span>Registered Records</span><strong>{summary.payeeCount.toLocaleString()} <small>Payees</small></strong><strong>{summary.accountCodeCount.toLocaleString()} <small>Account Codes</small></strong></div><div className="summary-card summary-counts"><span>Fiscal Year Documents</span><strong>{summary.invoiceCount.toLocaleString()} <small>Invoices</small></strong><strong>{summary.budgetDocumentCount.toLocaleString()} <small>Budgets</small></strong></div></div>
      <div className="dashboard-charts">
        <div className="chart-panel chart-wide"><div className="chart-heading"><h2>Monthly Invoice Payments</h2><span>PKR invoice activity</span></div><ResponsiveContainer width="100%" height={300}><LineChart data={monthly} margin={{ top: 8, right: 12, left: 12, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#e3e7ea" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={tooltipFormatter} /><Line type="monotone" dataKey="totalPayments" name="Invoice Payments" stroke="#0e5c5c" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></div>
        <div className="chart-panel"><div className="chart-heading"><h2>Budget vs Expense</h2><span>{budgetUsed.toFixed(1)}% used</span></div><div className="donut-wrap"><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={pieData} innerRadius={68} outerRadius={94} paddingAngle={2} dataKey="value"><Cell fill="#0e5c5c" /><Cell fill="#c9a227" /></Pie><Tooltip formatter={tooltipFormatter} /></PieChart></ResponsiveContainer><strong>{budgetUsed.toFixed(0)}%<small>used</small></strong></div></div>
        <div className="chart-panel"><div className="chart-heading"><h2>Top Account Codes</h2><span>By invoice expense</span></div><ResponsiveContainer width="100%" height={250}><BarChart data={summary.topAccountCodesByExpense} layout="vertical" margin={{ left: 8, right: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#e3e7ea" /><XAxis type="number" hide /><YAxis type="category" dataKey="code" width={58} tick={{ fontSize: 11 }} /><Tooltip formatter={tooltipFormatter} /><Bar dataKey="totalExpense" name="Expense" fill="#0e5c5c" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
        <div className="chart-panel"><div className="chart-heading"><h2>Top Vendors</h2><span>By invoice payment</span></div><ResponsiveContainer width="100%" height={250}><BarChart data={summary.topVendorsByPayment} layout="vertical" margin={{ left: 8, right: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="#e3e7ea" /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} /><Tooltip formatter={tooltipFormatter} /><Bar dataKey="totalPaid" name="Paid" fill="#c9a227" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
      </div>
    </>}
    <div className="dashboard-grid"><Link className="dashboard-tile" to="/transactions/invoices/new"><FileText /><span><strong>Invoice Entry</strong><small>Create tax-aware payment vouchers</small></span><ArrowRight /></Link><Link className="dashboard-tile" to="/transactions/budgets/new"><Landmark /><span><strong>Budget Entry</strong><small>Allocate funds across account heads</small></span><ArrowRight /></Link><Link className="dashboard-tile" to="/reports/budget"><FileBarChart /><span><strong>Reports</strong><small>Review, print and export invoice data</small></span><ArrowRight /></Link></div>
    <p className="dashboard-credit">Developed by Atif Mehmood — 03147656724</p>
  </section>;
}
