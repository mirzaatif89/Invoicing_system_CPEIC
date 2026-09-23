import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAnyRole, requireAuth } from "../middleware/auth.js";
import { contingentNetAmount } from "../lib/contingentBill.js";
import { resolveTaxpayerStatus } from "../lib/taxpayerStatus.js";

const bodySchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(200),
  address_line_1: z.string().trim().max(1000).nullable().optional(),
  address_line_2: z.string().trim().max(1000).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  itax_no: z.string().trim().max(100).nullable().optional(),
  vendorType: z.enum(["COMPANY", "INDIVIDUAL"]).default("INDIVIDUAL"),
});

const listSchema = z.object({
  search: z.string().trim().optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
});

const idSchema = z.coerce.number().int().positive();
const taxpayerStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]), effectiveFrom: z.coerce.date(), validUntil: z.coerce.date().nullable().optional(), notes: z.string().trim().max(300).nullable().optional() });
const dataOf = (input: z.infer<typeof bodySchema>) => ({
  code: input.code, name: input.name, addressLine1: input.address_line_1 || null,
  addressLine2: input.address_line_2 || null, phone: input.phone || null, itaxNo: input.itax_no || null, vendorType: input.vendorType,
});

export const payeeRouter = Router();
payeeRouter.use(requireAuth);

payeeRouter.get("/next-code", async (_req, res) => {
  const rows = await prisma.payee.findMany({ select: { code: true } });
  const highest = rows.reduce((max, row) => /^\d+$/.test(row.code) ? Math.max(max, Number(row.code)) : max, 0);
  res.json({ code: String(highest + 1) });
});

payeeRouter.get("/", async (req, res) => {
  const { search, page, pageSize } = listSchema.parse(req.query);
  const where: Prisma.PayeeWhereInput = search ? { OR: [
    { code: { contains: search } }, { name: { contains: search } },
  ] } : {};
  const [data, total] = await Promise.all([
    prisma.payee.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.payee.count({ where }),
  ]);
  res.json({ data, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
});

payeeRouter.get("/:id", async (req, res) => {
  const item = await prisma.payee.findUnique({ where: { id: idSchema.parse(req.params.id) } });
  if (!item) { res.status(404).json({ error: "Payee not found" }); return; }
  res.json(item);
});

payeeRouter.get("/:id/profile", async (req, res) => {
  const payeeId=idSchema.parse(req.params.id); const payee=await prisma.payee.findUnique({where:{id:payeeId},include:{taxStatusHistory:{orderBy:{effectiveFrom:"desc"}}}}); if(!payee){res.status(404).json({error:"Payee not found"});return;}
  const [supplies,items]=await Promise.all([prisma.poSupply.findMany({where:{payeeId},include:{accountCode:{select:{code:true,name:true}}},orderBy:{poDate:"desc"}}),prisma.invoiceItem.findMany({where:{payeeId},include:{invoice:{include:{cheques:{include:{bankBranch:{include:{bank:true}}}}}}}})]);
  // A single PO can legitimately contain DCs charged to different account
  // codes. An Invoice/Contingent Bill has one account code, so keep those
  // groups separate in the vendor workspace instead of sending mixed DCs.
  const groups=new Map<string,typeof supplies>();
  for(const supply of supplies){const key=`${supply.poNumber}::${supply.accountCodeId}`;groups.set(key,[...(groups.get(key)||[]),supply]);}
  const pos=[...groups.values()].map(rows=>{const poNumber=rows[0].poNumber,accountCodeId=rows[0].accountCodeId,cont=items.filter(i=>i.poNumber===poNumber&&i.invoice.isContingent&&i.invoice.accountCodeId===accountCodeId),gross=rows.reduce((n,s)=>n+Number(s.amount),0),net=cont.length?cont.reduce((n,i)=>n+contingentNetAmount(i),0):gross,bill=cont[0]?.invoice,vendorCheque=bill?.cheques.find(c=>c.type==="VENDOR")||null,accountCode=rows[0].accountCode,dcs=rows.map(s=>({id:s.id,dcNumber:s.dcNumber,amount:s.amount,poDate:s.poDate,actualDeliveryDate:s.actualDeliveryDate,contingentInvoiceId:s.contingentInvoiceId}));return{poNumber,poDate:rows[0].poDate,entryDate:rows[0].createdAt,dcCount:rows.length,accountCode,dcs,grossAmount:gross,netAmount:net,contingentBillId:bill?.id??null,contingentBillItemId:cont[0]?.id??null,contingentBillSerial:bill?.serialNo??null,cheques:bill?.cheques??[],chequeNo:vendorCheque?.chequeNo??null,chequePaid:vendorCheque?.paid??false,invoiceSerial:bill?.serialNo??null,bankBranchId:vendorCheque?.bankBranchId??null,bankName:vendorCheque?.bankBranch?.bank.name??null,branchName:vendorCheque?.bankBranch?.branchName??null,_paid:vendorCheque?.paid?Number(vendorCheque.amount):0};});
  const grossTotal=pos.reduce((n,p)=>n+p.grossAmount,0),paidAmount=pos.reduce((n,p)=>n+p._paid,0),pendingAmount=pos.reduce((n,p)=>n+Math.max(0,p.netAmount-p._paid),0); const {taxStatusHistory,...payeeData}=payee; res.json({payee:payeeData,currentTaxpayerStatus:resolveTaxpayerStatus(taxStatusHistory,new Date()),taxStatusHistory,totals:{grossTotal,paidAmount,pendingAmount,chequeCount:pos.filter(p=>p.chequeNo).length},pos:pos.map(({_paid,...row})=>row)});
});

payeeRouter.get("/:id/tax-status", async (req, res) => res.json({ data: await prisma.vendorTaxStatus.findMany({ where: { payeeId: idSchema.parse(req.params.id) }, orderBy: { effectiveFrom: "desc" } }) }));
payeeRouter.post("/:id/tax-status", requireAnyRole("ADMIN"), async (req, res) => { try { res.status(201).json(await prisma.vendorTaxStatus.create({ data: { ...taxpayerStatusSchema.parse(req.body), payeeId: idSchema.parse(req.params.id) } })); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "A tax status already exists for this effective date." }); return; } throw error; } });
payeeRouter.put("/tax-status/:entryId", requireAnyRole("ADMIN"), async (req, res) => res.json(await prisma.vendorTaxStatus.update({ where: { id: idSchema.parse(req.params.entryId) }, data: taxpayerStatusSchema.parse(req.body) })));
payeeRouter.delete("/tax-status/:entryId", requireAnyRole("ADMIN"), async (req, res) => { await prisma.vendorTaxStatus.delete({ where: { id: idSchema.parse(req.params.entryId) } }); res.status(204).send(); });

payeeRouter.post("/", async (req, res) => {
  try { res.status(201).json(await prisma.payee.create({ data: dataOf(bodySchema.parse(req.body)) })); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "Payee code already exists" }); return; } throw error; }
});

payeeRouter.put("/:id", async (req, res) => {
  try { const { code: _unchangedCode, ...data } = dataOf(bodySchema.parse(req.body)); res.json(await prisma.payee.update({ where: { id: idSchema.parse(req.params.id) }, data })); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "Payee code already exists" }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { res.status(404).json({ error: "Payee not found" }); return; }
    throw error;
  }
});

payeeRouter.delete("/:id", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  try { await prisma.payee.delete({ where: { id: idSchema.parse(req.params.id) } }); res.status(204).send(); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { res.status(404).json({ error: "Payee not found" }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") { res.status(409).json({ error: "Payee is used by transactions and cannot be deleted" }); return; }
    throw error;
  }
});
